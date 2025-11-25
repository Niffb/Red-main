# Red Glass AI Assistant 🔴

A powerful, multi-modal AI desktop assistant built with Electron, featuring real-time transcription, workflow automation, and MCP (Model Context Protocol) integration.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)
![License](https://img.shields.io/badge/license-ISC-green.svg)

## ✨ Features

### 🤖 AI-Powered Chat
- **Gemini 2.0 Live API** integration for real-time conversational AI
- Multi-modal support (text, vision, audio)
- Screen analysis and context awareness
- Typewriter-style response rendering

### 🎙️ Real-Time Transcription
- **Deepgram** integration for high-accuracy speech-to-text
- Live transcription with <300ms latency
- AI-powered workflow generation from transcripts
- Goal-based transcription analysis

### ⚡ Workflow Automation
- Visual workflow builder with drag-and-drop interface
- Scheduled workflow execution (one-time, daily, weekly, monthly)
- MCP tool integration for real-world actions
- Workflow history and analytics

### 🔌 MCP Integration
- Native support for Model Context Protocol
- Pre-configured servers (GitHub, Notion, Google Drive, Slack)
- Custom MCP server support
- Tool discovery and execution

### 🔐 Authentication & Security
- MongoDB-based user authentication
- Deep linking authentication (`redglass://` protocol)
- Browser-based OAuth flow for desktop apps
- Subscription tier management (Free, Pro, Enterprise)
- Usage tracking and limits
- Input validation and sanitization
- Secure IPC communication

### 🎨 Professional UI/UX
- Glassmorphic design language
- Dark mode optimized
- Spotlight-like interface
- Smooth animations and transitions
- FontAwesome icons

## 📦 Tech Stack

- **Frontend**: Electron 30.5.1, HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, MongoDB
- **AI**: Google Gemini 2.0, Deepgram API
- **Build Tools**: Webpack 5, electron-builder
- **Python Integration**: Gemini Live API service
- **Security**: bcrypt, dotenv, IPC whitelisting

## 🚀 Getting Started

### Prerequisites

- Node.js 16+ and npm
- Python 3.9+ (for Gemini Live service)
- MongoDB (local or Atlas)
- API Keys:
  - `GEMINI_API_KEY` (Google AI Studio)
  - `DEEPGRAM_API_KEY` (Deepgram)
  - `MONGODB_URI` (MongoDB connection string)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/UsefAly/RED-AI-APP.git
   cd RED-AI-APP
   ```

2. **Install Node.js dependencies**
   ```bash
   npm install
   ```

3. **Install Python dependencies**
   ```bash
   pip install google-genai opencv-python pyaudio pillow mss
   ```

4. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env and add your API keys
   ```

5. **Run the app**
   ```bash
   npm start
   ```

### Demo Mode

For quick testing without database setup:
- **Email**: `demo@redglass.ai`
- **Password**: `demo123`

## 🏗️ Building for Production

### Build for current platform
```bash
npm run build
```

### Build for specific platform
```bash
npm run build:mac     # macOS (DMG + ZIP)
npm run build:win     # Windows (NSIS + ZIP)
npm run build:linux   # Linux (AppImage + DEB + RPM)
npm run build:all     # All platforms (macOS recommended)
```

Build output will be in the `dist/` directory.

## 📁 Project Structure

```
red-glass/
├── electron/               # Electron main process
│   ├── main.js            # Main entry point
│   ├── preload.js         # Preload script
│   ├── ipc-security.js    # IPC security layer
│   ├── mongodb-service.js # Database operations
│   ├── subscription-manager.js
│   ├── workflow-executor.js
│   └── realtime-transcription-service.js
├── public/                # Frontend UI
│   ├── frontend.html      # Main app UI
│   ├── signin-screen.html # Authentication
│   ├── transcription-window.html
│   ├── workflow-builder.html
│   └── mcp-settings.html
├── src/                   # Webpack entry
├── data/                  # User data
├── live.py               # Gemini Live API service
├── build.js              # Build script
├── package.json          # Dependencies
└── .env                  # Environment variables (gitignored)
```

## 🔧 Configuration

### Environment Variables (.env)
```env
# Required
GEMINI_API_KEY=your_gemini_api_key_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here
MONGODB_URI=mongodb://localhost:27017/redglass

# Optional
NODE_ENV=development
```

### Subscription Tiers

| Tier | Messages/Day | Transcription | Workflows | MCP Servers |
|------|--------------|---------------|-----------|-------------|
| Free | 50 | 30 min/day | 5 active | 2 |
| Pro | 500 | 300 min/day | 25 active | 10 |
| Enterprise | Unlimited | Unlimited | Unlimited | Unlimited |

## 🧪 Testing

### Run security tests
```bash
node test-security.js
```

### Run transcription tests
```bash
node test-transcription.js
```

## 🛠️ Development

### Start with auto-reload
```bash
npm run dev
```

### Run with transcription
```bash
npm run start:with-transcription
```

## 📝 API Documentation

### IPC Handlers

#### Authentication
- `mongodb-authenticate` - Authenticate user
- `mongodb-register` - Register new user
- `mongodb-logout` - Logout current user
- `refresh-user-data` - Refresh user subscription data

#### AI Chat
- `call-deepseek-api` - Send message to AI
- `call-deepseek-api-with-screen` - Send message with screen context

#### Transcription
- `transcription-start` - Start recording
- `transcription-stop` - Stop recording
- `transcription-send-audio` - Send audio chunk
- `transcription-create-workflow` - Generate workflow from transcript

#### Workflows
- `save-workflow` - Save workflow
- `load-workflows` - Load all workflows
- `execute-workflow` - Execute workflow
- `create-scheduled-workflow` - Schedule workflow

#### MCP
- `mcp-add-server` - Add MCP server
- `mcp-remove-server` - Remove MCP server
- `mcp-get-tools` - Get available tools
- `mcp-execute-tool` - Execute MCP tool

## 🚧 Known Issues

- [ ] Auth tokens stored in plain text (needs encryption)
- [ ] No token refresh mechanism (30-day hard expiration)
- [ ] No auto-updater implementation
- [ ] No deep linking for OAuth

## 🗺️ Roadmap

- [ ] Implement secure token storage (Electron safeStorage)
- [ ] Add token refresh logic
- [ ] Set up GitHub Actions for CI/CD
- [ ] Implement auto-updater
- [ ] Add OAuth support (Google, GitHub)
- [ ] Mobile companion app
- [ ] Browser extension
- [ ] Voice commands
- [ ] Offline mode

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

ISC License - see LICENSE file for details

## 🙏 Acknowledgments

- Google Gemini API
- Deepgram Speech Recognition
- Model Context Protocol (Anthropic)
- Electron Framework
- MongoDB

## 📧 Contact

For questions or support, please open an issue on GitHub.

---

**Made with ❤️ by the Red Glass Team**

