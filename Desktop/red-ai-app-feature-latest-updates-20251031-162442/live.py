"""
## Documentation
Quickstart: https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started_LiveAPI.py

## Setup

To install the dependencies for this script, run:

```
pip install google-genai opencv-python pyaudio pillow mss
```
"""

import os
import asyncio
import base64
import io
import traceback
import sys
import json
import threading
import time
from queue import Queue
from concurrent.futures import ThreadPoolExecutor

import cv2
import pyaudio
import PIL.Image
import mss

import argparse

from google import genai
from google.genai import types

FORMAT = pyaudio.paInt16
CHANNELS = 1
SEND_SAMPLE_RATE = 16000
RECEIVE_SAMPLE_RATE = 24000
CHUNK_SIZE = 1024

MODEL = "models/gemini-2.0-flash-exp"

DEFAULT_MODE = "camera"

def get_client():
    """Get or create Gemini client with API key validation"""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is not set. Please set it before running the service.")
    return genai.Client(
        http_options={"api_version": "v1beta"},
        api_key=api_key,
    )

# Initialize client lazily
client = None

CONFIG = types.LiveConnectConfig(
    response_modalities=["AUDIO", "TEXT"],
    media_resolution="MEDIA_RESOLUTION_MEDIUM",
)

pya = pyaudio.PyAudio()

# Thread pool for Python 3.9 compatibility (replaces asyncio.to_thread)
thread_pool = ThreadPoolExecutor(max_workers=4)


class AudioLoop:
    def __init__(self, video_mode=DEFAULT_MODE):
        self.video_mode = video_mode

        self.audio_in_queue = None
        self.out_queue = None

        self.session = None

        self.send_text_task = None
        self.receive_audio_task = None
        self.play_audio_task = None

    async def send_text(self):
        while True:
            loop = asyncio.get_event_loop()
            text = await loop.run_in_executor(
                thread_pool,
                input,
                "message > ",
            )
            if text.lower() == "q":
                break
            await self.session.send_client_content(
                turns=types.Content(
                    role="user",
                    parts=[types.Part(text=text or ".")]
                ),
                turn_complete=True
            )

    def _get_frame(self, cap):
        # Read the frameq
        ret, frame = cap.read()
        # Check if the frame was read successfully
        if not ret:
            return None
        # Fix: Convert BGR to RGB color space
        # OpenCV captures in BGR but PIL expects RGB format
        # This prevents the blue tint in the video feed
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = PIL.Image.fromarray(frame_rgb)  # Now using RGB frame
        img.thumbnail([1024, 1024])

        image_io = io.BytesIO()
        img.save(image_io, format="jpeg")
        image_io.seek(0)

        mime_type = "image/jpeg"
        image_bytes = image_io.read()
        return {"mime_type": mime_type, "data": base64.b64encode(image_bytes).decode()}

    async def get_frames(self):
        # This takes about a second, and will block the whole program
        # causing the audio pipeline to overflow if you don't use thread pool.
        loop = asyncio.get_event_loop()
        cap = await loop.run_in_executor(
            thread_pool, cv2.VideoCapture, 0
        )  # 0 represents the default camera

        while True:
            frame = await loop.run_in_executor(thread_pool, self._get_frame, cap)
            if frame is None:
                break

            await asyncio.sleep(1.0)

            await self.out_queue.put(frame)

        # Release the VideoCapture object
        cap.release()

    def _get_screen(self):
        sct = mss.mss()
        monitor = sct.monitors[0]

        i = sct.grab(monitor)

        mime_type = "image/jpeg"
        # Convert directly to PIL Image from raw RGB data
        img = PIL.Image.frombytes("RGB", i.size, i.rgb)
        
        # Resize for faster processing (max 640px wide)
        if img.width > 640:
            aspect_ratio = img.height / img.width
            new_width = 640
            new_height = int(new_width * aspect_ratio)
            img = img.resize((new_width, new_height), PIL.Image.Resampling.LANCZOS)

        image_io = io.BytesIO()
        img.save(image_io, format="jpeg", quality=75, optimize=True)
        image_io.seek(0)

        image_bytes = image_io.read()
        return {"mime_type": mime_type, "data": base64.b64encode(image_bytes).decode()}

    async def get_screen(self):
        loop = asyncio.get_event_loop()
        while True:
            frame = await loop.run_in_executor(thread_pool, self._get_screen)
            if frame is None:
                break

            await asyncio.sleep(1.0)

            await self.out_queue.put(frame)

    async def send_realtime(self):
        while True:
            msg = await self.out_queue.get()
            if isinstance(msg, dict) and msg.get("mime_type") == "audio/pcm":
                # Send audio data for transcription
                await self.session.send_realtime_input(
                    audio=types.Blob(data=msg["data"], mime_type="audio/pcm")
                )
            else:
                # Send other media (images, etc.)
                data_bytes = base64.b64decode(msg.get("data")) if isinstance(msg, dict) else msg
                mime_type = msg.get("mime_type", "image/jpeg") if isinstance(msg, dict) else "image/jpeg"
                await self.session.send_realtime_input(
                    media=types.Blob(data=data_bytes, mime_type=mime_type)
                )

    async def listen_audio(self):
        loop = asyncio.get_event_loop()
        mic_info = pya.get_default_input_device_info()
        # Use keyword args via lambda for Python 3.9 executor
        self.audio_stream = await loop.run_in_executor(
            thread_pool,
            lambda: pya.open(
                format=FORMAT,
                channels=CHANNELS,
                rate=SEND_SAMPLE_RATE,
                input=True,
                input_device_index=mic_info["index"],
                frames_per_buffer=CHUNK_SIZE,
            ),
        )
        if __debug__:
            kwargs = {"exception_on_overflow": False}
        else:
            kwargs = {}
        while True:
            # Use lambda to pass kwargs
            data = await loop.run_in_executor(
                thread_pool,
                lambda: self.audio_stream.read(CHUNK_SIZE, **kwargs),
            )
            await self.out_queue.put({"data": data, "mime_type": "audio/pcm"})

    async def receive_audio(self):
        "Background task to reads from the websocket and write pcm chunks to the output queue"
        while True:
            turn = self.session.receive()
            async for response in turn:
                if data := response.data:
                    self.audio_in_queue.put_nowait(data)
                    continue
                if text := response.text:
                    print(text, end="")

            # If you interrupt the model, it sends a turn_complete.
            # For interruptions to work, we need to stop playback.
            # So empty out the audio queue because it may have loaded
            # much more audio than has played yet.
            while not self.audio_in_queue.empty():
                self.audio_in_queue.get_nowait()

    async def play_audio(self):
        loop = asyncio.get_event_loop()
        # Use keyword args via lambda for Python 3.9 executor
        stream = await loop.run_in_executor(
            thread_pool,
            lambda: pya.open(
                format=FORMAT,
                channels=CHANNELS,
                rate=RECEIVE_SAMPLE_RATE,
                output=True,
                frames_per_buffer=CHUNK_SIZE,
            ),
        )
        while True:
            bytestream = await self.audio_in_queue.get()
            await loop.run_in_executor(thread_pool, lambda: stream.write(bytestream))

    async def run(self):
        global client
        if client is None:
            client = get_client()
        
        try:
            async with client.aio.live.connect(model=MODEL, config=CONFIG) as session:
                self.session = session

                self.audio_in_queue = asyncio.Queue()
                self.out_queue = asyncio.Queue(maxsize=5)

                # Create tasks manually for Python 3.9 compatibility
                tasks = []
                tasks.append(asyncio.create_task(self.send_text()))
                tasks.append(asyncio.create_task(self.send_realtime()))
                tasks.append(asyncio.create_task(self.listen_audio()))
                
                if self.video_mode == "camera":
                    tasks.append(asyncio.create_task(self.get_frames()))
                elif self.video_mode == "screen":
                    tasks.append(asyncio.create_task(self.get_screen()))

                tasks.append(asyncio.create_task(self.receive_audio()))
                tasks.append(asyncio.create_task(self.play_audio()))

                # Wait for the first task to complete (send_text)
                await tasks[0]
                
                # Cancel all other tasks
                for task in tasks[1:]:
                    task.cancel()
                
                # Wait for all tasks to finish
                await asyncio.gather(*tasks, return_exceptions=True)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            if hasattr(self, 'audio_stream'):
                self.audio_stream.close()
            traceback.print_exception(type(e), e, e.__traceback__)


# ============================================
# MCP (Model Context Protocol) Integration
# ============================================

class MCPClient:
    """
    MCP Client for connecting to and executing tools on MCP servers.
    Supports stdio transport for local MCP server processes.
    """
    
    def __init__(self, server_name, server_command, server_args, server_env=None):
        self.server_name = server_name
        self.server_command = server_command
        self.server_args = server_args
        self.server_env = server_env or {}
        self.process = None
        self.tools = []
        self.connected = False
        self.request_id = 0
        
    async def connect(self):
        """Start MCP server process and establish connection"""
        try:
            import subprocess
            
            # Prepare environment
            env = os.environ.copy()
            env.update(self.server_env)
            
            # Start MCP server process
            self.process = subprocess.Popen(
                [self.server_command] + self.server_args,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                text=True,
                bufsize=1
            )
            
            # Send initialize request
            init_response = await self._send_request({
                "jsonrpc": "2.0",
                "id": self._next_request_id(),
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {
                        "name": "red-glass",
                        "version": "1.0.0"
                    }
                }
            })
            
            if init_response and "result" in init_response:
                self.connected = True
                
                # Send initialized notification
                await self._send_notification({
                    "jsonrpc": "2.0",
                    "method": "notifications/initialized"
                })
                
                # List available tools
                await self.list_tools()
                
                return True
            else:
                raise Exception(f"Failed to initialize: {init_response}")
                
        except Exception as e:
            print(f"Error connecting to MCP server {self.server_name}: {e}", file=sys.stderr)
            self.connected = False
            return False
    
    async def list_tools(self):
        """List all available tools from the MCP server"""
        try:
            response = await self._send_request({
                "jsonrpc": "2.0",
                "id": self._next_request_id(),
                "method": "tools/list"
            })
            
            if response and "result" in response:
                self.tools = response["result"].get("tools", [])
                return self.tools
            else:
                print(f"Failed to list tools from {self.server_name}", file=sys.stderr)
                return []
                
        except Exception as e:
            print(f"Error listing tools: {e}", file=sys.stderr)
            return []
    
    async def execute_tool(self, tool_name, parameters):
        """Execute a tool with given parameters"""
        try:
            response = await self._send_request({
                "jsonrpc": "2.0",
                "id": self._next_request_id(),
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": parameters
                }
            })
            
            if response and "result" in response:
                return {
                    "success": True,
                    "data": response["result"],
                    "server": self.server_name,
                    "tool": tool_name
                }
            elif response and "error" in response:
                return {
                    "success": False,
                    "error": response["error"].get("message", "Unknown error"),
                    "server": self.server_name,
                    "tool": tool_name
                }
            else:
                return {
                    "success": False,
                    "error": "Invalid response from server",
                    "server": self.server_name,
                    "tool": tool_name
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "server": self.server_name,
                "tool": tool_name
            }
    
    async def disconnect(self):
        """Disconnect from MCP server"""
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except:
                self.process.kill()
            self.process = None
        self.connected = False
    
    async def _send_request(self, request):
        """Send JSON-RPC request and wait for response"""
        if not self.process:
            raise Exception("Server process not started")
        
        try:
            # Send request
            request_json = json.dumps(request) + "\n"
            self.process.stdin.write(request_json)
            self.process.stdin.flush()
            
            # Read response (with timeout)
            loop = asyncio.get_event_loop()
            response_line = await asyncio.wait_for(
                loop.run_in_executor(None, self.process.stdout.readline),
                timeout=30.0
            )
            
            if response_line:
                return json.loads(response_line)
            else:
                raise Exception("No response from server")
                
        except asyncio.TimeoutError:
            raise Exception("Request timeout")
        except Exception as e:
            raise Exception(f"Request failed: {e}")
    
    async def _send_notification(self, notification):
        """Send JSON-RPC notification (no response expected)"""
        if not self.process:
            return
        
        try:
            notification_json = json.dumps(notification) + "\n"
            self.process.stdin.write(notification_json)
            self.process.stdin.flush()
        except Exception as e:
            print(f"Failed to send notification: {e}", file=sys.stderr)
    
    def _next_request_id(self):
        """Generate next request ID"""
        self.request_id += 1
        return self.request_id
    
    def get_status(self):
        """Get current connection status"""
        return {
            "server": self.server_name,
            "connected": self.connected,
            "tool_count": len(self.tools),
            "tools": [tool.get("name") for tool in self.tools]
        }


class MCPServerManager:
    """
    Manages multiple MCP server connections and provides unified interface
    for tool execution across all servers.
    """
    
    def __init__(self):
        self.servers = {}
        self.tool_registry = {}
    
    async def add_server(self, server_name, command, args, env=None):
        """Add and connect to a new MCP server"""
        try:
            client = MCPClient(server_name, command, args, env)
            connected = await client.connect()
            
            if connected:
                self.servers[server_name] = client
                await self._update_tool_registry()
                return {
                    "success": True,
                    "server": server_name,
                    "tools": client.tools
                }
            else:
                return {
                    "success": False,
                    "error": f"Failed to connect to {server_name}"
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    async def remove_server(self, server_name):
        """Remove and disconnect from an MCP server"""
        if server_name in self.servers:
            await self.servers[server_name].disconnect()
            del self.servers[server_name]
            await self._update_tool_registry()
            return {"success": True}
        else:
            return {
                "success": False,
                "error": f"Server {server_name} not found"
            }
    
    async def get_all_tools(self):
        """Get all tools from all connected servers"""
        return self.tool_registry
    
    async def execute_tool(self, server_name, tool_name, parameters):
        """Execute a tool on a specific server"""
        if server_name not in self.servers:
            return {
                "success": False,
                "error": f"Server {server_name} not connected"
            }
        
        client = self.servers[server_name]
        if not client.connected:
            return {
                "success": False,
                "error": f"Server {server_name} is not connected"
            }
        
        return await client.execute_tool(tool_name, parameters)
    
    def get_server_status(self, server_name=None):
        """Get status of one or all servers"""
        if server_name:
            if server_name in self.servers:
                return self.servers[server_name].get_status()
            else:
                return {"error": f"Server {server_name} not found"}
        else:
            return {
                server: client.get_status()
                for server, client in self.servers.items()
            }
    
    async def _update_tool_registry(self):
        """Update the tool registry with all available tools"""
        self.tool_registry = {}
        for server_name, client in self.servers.items():
            for tool in client.tools:
                tool_key = f"{server_name}_{tool['name']}"
                self.tool_registry[tool_key] = {
                    "server": server_name,
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                    "inputSchema": tool.get("inputSchema", {})
                }


class ElectronGeminiService(AudioLoop):
    """Gemini Live service for Electron integration with MCP support"""
    
    def __init__(self, video_mode="none"):
        super().__init__(video_mode)
        self.command_queue = Queue()
        self.electron_mode = True
        self.is_running = False
        self.transcription_mode = False
        self.transcription_buffer = []
        
        # Initialize MCP Server Manager
        self.mcp_manager = MCPServerManager()
        
    def handle_electron_commands(self):
        """Handle commands from Electron main process via stdin"""
        while True:
            try:
                line = sys.stdin.readline()
                if line:
                    command = json.loads(line.strip())
                    self.command_queue.put(command)
            except json.JSONDecodeError as e:
                self.send_to_electron("error", {"message": f"Invalid JSON command: {e}"})
            except Exception as e:
                self.send_to_electron("error", {"message": f"Error handling command: {e}"})
    
    def send_to_electron(self, event_type, data):
        """Send events back to Electron via stdout"""
        try:
            event = {
                "type": event_type,
                "data": data,
                "timestamp": time.time()
            }
            print(json.dumps(event), flush=True)
        except Exception as e:
            print(f"Error sending to Electron: {e}", file=sys.stderr)
    
    async def process_electron_commands(self):
        """Process commands from Electron in async context"""
        while True:
            try:
                if not self.command_queue.empty():
                    command = self.command_queue.get_nowait()
                    
                    if command["command"] == "start":
                        options = command.get("options", {})
                        self.video_mode = options.get("mode", "screen")
                        await self.start_session(options)
                    elif command["command"] == "stop":
                        await self.stop_session()
                    elif command["command"] == "message":
                        if self.session:
                            # Optional image payload first
                            image = command.get("image")
                            if image and isinstance(image, dict) and image.get("mime_type") and image.get("data"):
                                # queue the image for realtime send loop
                                await self.out_queue.put({
                                    "mime_type": image["mime_type"],
                                    "data": image["data"],
                                })
                            # Then send text if present
                            if command.get("text"):
                                if self.transcription_mode:
                                    # In transcription mode, send audio transcription prompt
                                    prompt = f"Please transcribe this audio to text. Only return the transcribed text, nothing else: {command['text']}"
                                    await self.session.send_client_content(
                                        turns=types.Content(
                                            role="user",
                                            parts=[types.Part(text=prompt)]
                                        ),
                                        turn_complete=True
                                    )
                                else:
                                    await self.session.send_client_content(
                                        turns=types.Content(
                                            role="user",
                                            parts=[types.Part(text=command["text"])]
                                        ),
                                        turn_complete=True
                                    )
                    elif command["command"] == "interrupt":
                        if self.session:
                            # Interrupt current AI response
                            pass
                    elif command["command"] == "start_transcription":
                        self.transcription_mode = True
                        self.transcription_buffer = []
                        if self.session:
                            self.send_to_electron("transcription_started", {"message": "Transcription mode enabled, listening for audio"})
                        else:
                            self.send_to_electron("error", {"message": "Cannot start transcription: session not ready"})
                    elif command["command"] == "stop_transcription":
                        self.transcription_mode = False
                        if self.transcription_buffer:
                            full_text = ' '.join(self.transcription_buffer)
                            self.send_to_electron("transcription_final", {"text": full_text})
                        self.transcription_buffer = []
                        self.send_to_electron("transcription_stopped", {})
                    
                    # ============================================
                    # MCP Commands
                    # ============================================
                    elif command["command"] == "mcp_add_server":
                        # Add new MCP server
                        server_name = command.get("server_name")
                        server_command = command.get("server_command")
                        server_args = command.get("server_args", [])
                        server_env = command.get("server_env", {})
                        
                        result = await self.mcp_manager.add_server(
                            server_name, server_command, server_args, server_env
                        )
                        self.send_to_electron("mcp_server_added", result)
                    
                    elif command["command"] == "mcp_remove_server":
                        # Remove MCP server
                        server_name = command.get("server_name")
                        result = await self.mcp_manager.remove_server(server_name)
                        self.send_to_electron("mcp_server_removed", result)
                    
                    elif command["command"] == "mcp_get_tools":
                        # Get all available tools
                        tools = await self.mcp_manager.get_all_tools()
                        self.send_to_electron("mcp_tools_response", {
                            "tools": tools
                        })
                    
                    elif command["command"] == "mcp_get_server_tools":
                        # Get tools from specific server
                        server_name = command.get("server_name")
                        if server_name in self.mcp_manager.servers:
                            client = self.mcp_manager.servers[server_name]
                            self.send_to_electron("mcp_server_tools_response", {
                                "server": server_name,
                                "tools": client.tools
                            })
                        else:
                            self.send_to_electron("error", {
                                "message": f"Server {server_name} not found"
                            })
                    
                    elif command["command"] == "mcp_execute_tool":
                        # Execute MCP tool
                        server_name = command.get("server")
                        tool_name = command.get("tool")
                        parameters = command.get("params", {})
                        
                        result = await self.mcp_manager.execute_tool(
                            server_name, tool_name, parameters
                        )
                        self.send_to_electron("mcp_tool_result", result)
                    
                    elif command["command"] == "mcp_get_status":
                        # Get server status
                        server_name = command.get("server_name")
                        status = self.mcp_manager.get_server_status(server_name)
                        self.send_to_electron("mcp_status_response", status)
                
                await asyncio.sleep(0.1)
            except Exception as e:
                self.send_to_electron("error", {"message": str(e)})
    
    async def start_session(self, options):
        """Start Gemini Live session"""
        try:
            self.is_running = True
            self.send_to_electron("status", {"running": True, "message": "Starting Gemini Live session"})
        except Exception as e:
            self.send_to_electron("error", {"message": f"Failed to start session: {e}"})
    
    async def stop_session(self):
        """Stop Gemini Live session"""
        try:
            self.is_running = False
            self.send_to_electron("status", {"running": False, "message": "Stopped Gemini Live session"})
        except Exception as e:
            self.send_to_electron("error", {"message": f"Failed to stop session: {e}"})
    
    async def send_text(self):
        """Override to handle Electron commands instead of stdin input"""
        await self.process_electron_commands()
    
    async def receive_audio(self):
        """Override to send audio/text to Electron"""
        try:
            while True:
                turn = self.session.receive()
                async for response in turn:
                    if data := response.data:
                        # Send audio data to Electron
                        audio_b64 = base64.b64encode(data).decode()
                        self.send_to_electron("audio", {"data": audio_b64})
                        
                        # Also queue for local playback
                        self.audio_in_queue.put_nowait(data)
                        continue
                        
                    if text := response.text:
                        if self.transcription_mode:
                            # In transcription mode, treat text as transcription result
                            self.transcription_buffer.append(text)
                            self.send_to_electron("transcription_partial", {"text": text})
                        else:
                            # Send text to Electron
                            self.send_to_electron("text", {"text": text})

                # Turn complete - notify frontend
                self.send_to_electron("turn_complete", {"completed": True})

                # Handle interruptions
                while not self.audio_in_queue.empty():
                    self.audio_in_queue.get_nowait()
        except Exception as e:
            self.send_to_electron("error", {"message": f"Error in receive_audio: {str(e)}"})
    
    async def get_screen(self):
        """Override to send screen data to Electron"""
        loop = asyncio.get_event_loop()
        while True:
            if not self.is_running:
                await asyncio.sleep(1.0)
                continue
                
            frame = await loop.run_in_executor(thread_pool, self._get_screen)
            if frame is None:
                break

            # Send screen frame to Electron for debugging/monitoring
            self.send_to_electron("screen_frame", {"size": "captured"})
            
            await asyncio.sleep(1.0)
            await self.out_queue.put(frame)
    
    async def get_frames(self):
        """Override to send camera data to Electron"""
        loop = asyncio.get_event_loop()
        cap = await loop.run_in_executor(thread_pool, cv2.VideoCapture, 0)
        
        while True:
            if not self.is_running:
                await asyncio.sleep(1.0)
                continue
                
            frame = await loop.run_in_executor(thread_pool, self._get_frame, cap)
            if frame is None:
                break

            # Send camera frame to Electron for debugging/monitoring
            self.send_to_electron("camera_frame", {"size": "captured"})
            
            await asyncio.sleep(1.0)
            await self.out_queue.put(frame)

        cap.release()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode",
        type=str,
        default=DEFAULT_MODE,
        help="pixels to stream from",
        choices=["camera", "screen", "none", "electron"],
    )
    args = parser.parse_args()
    
    if args.mode == "electron":
        # Electron service mode - default to no video capture
        service = ElectronGeminiService(video_mode="none")
        
        # Start command handler thread
        command_thread = threading.Thread(target=service.handle_electron_commands, daemon=True)
        command_thread.start()
        
        # Signal ready to Electron
        service.send_to_electron("ready", {"message": "Gemini Live service ready"})
        
        # Run the service
        asyncio.run(service.run())
    else:
        # Standalone mode
        main = AudioLoop(video_mode=args.mode)
        asyncio.run(main.run())
