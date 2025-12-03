#!/bin/bash

# Red Glass AI App Startup Script with RealtimeSTT
# Starts both the STT server and Electron app together

set -e  # Exit on error

echo "🚀 Starting Red Glass AI App with RealtimeSTT..."

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "📝 Please create a .env file with: GEMINI_API_KEY=your_api_key_here"
    exit 1
fi

echo "📝 .env file found"

# Cleanup function to kill background processes
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    
    # Kill RealtimeSTT server
    if [ ! -z "$STT_PID" ]; then
        echo "🛑 Stopping RealtimeSTT server (PID: $STT_PID)..."
        kill $STT_PID 2>/dev/null || true
    fi
    
    # Kill any remaining processes on port 8765
    lsof -ti:8765 | xargs kill -9 2>/dev/null || true
    
    echo "✅ Cleanup complete"
    exit 0
}

# Set up trap to cleanup on exit
trap cleanup EXIT INT TERM

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found! Please install Python 3.7+"
    exit 1
fi

# Check if RealtimeSTT is installed
if ! python3 -c "import RealtimeSTT" 2>/dev/null; then
    echo "❌ RealtimeSTT not installed!"
    echo "📦 Installing dependencies..."
    pip3 install -r requirements-transcription.txt
fi

# Kill any existing RealtimeSTT server on port 8765
echo "🧹 Checking for existing STT server..."
lsof -ti:8765 | xargs kill -9 2>/dev/null || true

# Start RealtimeSTT server in background
echo "🎙️ Starting RealtimeSTT server..."
python3 realtime-stt-server.py > /tmp/realtimestt.log 2>&1 &
STT_PID=$!

echo "⏳ Waiting for RealtimeSTT server to be ready..."

# Wait for server to be ready (check for up to 10 seconds)
MAX_WAIT=10
WAITED=0
SERVER_READY=false

while [ $WAITED -lt $MAX_WAIT ]; do
    if lsof -ti:8765 > /dev/null 2>&1; then
        SERVER_READY=true
        echo "✅ RealtimeSTT server is ready (PID: $STT_PID)"
        break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
    echo -n "."
done

echo ""

if [ "$SERVER_READY" = false ]; then
    echo "❌ RealtimeSTT server failed to start within ${MAX_WAIT} seconds"
    echo "📋 Check the log: tail -f /tmp/realtimestt.log"
    exit 1
fi

# Start the Electron application
echo "🎯 Starting Electron app..."
echo "════════════════════════════════════════════"
npm start

# Cleanup will be called automatically on exit
