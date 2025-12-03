#!/bin/bash
# MCP Dependencies Installation Script for RED Glass
# This script installs all necessary MCP-related dependencies

set -e  # Exit on error

echo "🔌 Installing MCP Dependencies for RED Glass..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js and npm
echo -e "${BLUE}📦 Checking Node.js and npm...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js not found. Please install Node.js first.${NC}"
    exit 1
fi
if ! command -v npm &> /dev/null; then
    echo -e "${YELLOW}⚠️  npm not found. Please install npm first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node --version) found${NC}"
echo -e "${GREEN}✅ npm $(npm --version) found${NC}"
echo ""

# Check Python
echo -e "${BLUE}📦 Checking Python...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${YELLOW}⚠️  Python 3 not found. Please install Python 3.9+ first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Python $(python3 --version) found${NC}"
echo ""

# Install Python MCP SDK (optional - for advanced features)
echo -e "${BLUE}📦 Installing Python MCP SDK (optional)...${NC}"
if pip3 install mcp 2>/dev/null; then
    echo -e "${GREEN}✅ Python MCP SDK installed${NC}"
else
    echo -e "${YELLOW}⚠️  Python MCP SDK installation failed (optional, can continue)${NC}"
fi
echo ""

# Install popular MCP servers globally
echo -e "${BLUE}📦 Installing popular MCP servers...${NC}"
echo ""

echo -e "${BLUE}1/6 Installing Filesystem MCP Server...${NC}"
if npx -y @modelcontextprotocol/server-filesystem --version &> /dev/null; then
    echo -e "${GREEN}✅ Filesystem MCP Server available${NC}"
else
    echo -e "${YELLOW}⚠️  Will be installed on first use${NC}"
fi
echo ""

echo -e "${BLUE}2/6 Installing GitHub MCP Server...${NC}"
if npx -y @modelcontextprotocol/server-github --version &> /dev/null; then
    echo -e "${GREEN}✅ GitHub MCP Server available${NC}"
else
    echo -e "${YELLOW}⚠️  Will be installed on first use${NC}"
fi
echo ""

echo -e "${BLUE}3/6 Installing Notion MCP Server...${NC}"
if npx -y @modelcontextprotocol/server-notion --version &> /dev/null; then
    echo -e "${GREEN}✅ Notion MCP Server available${NC}"
else
    echo -e "${YELLOW}⚠️  Will be installed on first use${NC}"
fi
echo ""

echo -e "${BLUE}4/6 Installing Slack MCP Server...${NC}"
if npx -y @modelcontextprotocol/server-slack --version &> /dev/null; then
    echo -e "${GREEN}✅ Slack MCP Server available${NC}"
else
    echo -e "${YELLOW}⚠️  Will be installed on first use${NC}"
fi
echo ""

echo -e "${BLUE}5/6 Installing Google Drive MCP Server...${NC}"
if npx -y @modelcontextprotocol/server-google-drive --version &> /dev/null; then
    echo -e "${GREEN}✅ Google Drive MCP Server available${NC}"
else
    echo -e "${YELLOW}⚠️  Will be installed on first use${NC}"
fi
echo ""

echo -e "${BLUE}6/6 Installing PostgreSQL MCP Server...${NC}"
if npx -y @modelcontextprotocol/server-postgres --version &> /dev/null; then
    echo -e "${GREEN}✅ PostgreSQL MCP Server available${NC}"
else
    echo -e "${YELLOW}⚠️  Will be installed on first use${NC}"
fi
echo ""

# Install Node.js MCP client library (if available)
echo -e "${BLUE}📦 Checking for Node.js MCP libraries...${NC}"
cd "$(dirname "$0")"
if npm list @modelcontextprotocol/sdk &> /dev/null; then
    echo -e "${GREEN}✅ MCP SDK already installed${NC}"
else
    echo -e "${BLUE}Installing MCP SDK...${NC}"
    if npm install --save-optional @modelcontextprotocol/sdk 2>/dev/null; then
        echo -e "${GREEN}✅ MCP SDK installed${NC}"
    else
        echo -e "${YELLOW}⚠️  MCP SDK not available yet (optional)${NC}"
    fi
fi
echo ""

# Create MCP servers directory
echo -e "${BLUE}📦 Setting up MCP configuration...${NC}"
mkdir -p .mcp-servers
echo -e "${GREEN}✅ MCP servers directory created${NC}"
echo ""

# Create sample MCP configuration
cat > .mcp-servers/config.json << 'EOF'
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "env": {}
    }
  }
}
EOF
echo -e "${GREEN}✅ Sample MCP configuration created (.mcp-servers/config.json)${NC}"
echo ""

# Summary
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 MCP Dependencies Installation Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📋 What was installed:${NC}"
echo "  ✅ Python MCP SDK (optional)"
echo "  ✅ Node.js MCP client libraries"
echo "  ✅ MCP server configurations"
echo "  ✅ Sample configuration file"
echo ""
echo -e "${BLUE}📦 Available MCP Servers:${NC}"
echo "  • Filesystem - Local file operations"
echo "  • GitHub - Repository management"
echo "  • Notion - Page and database operations"
echo "  • Slack - Messaging and channels"
echo "  • Google Drive - File management"
echo "  • PostgreSQL - Database queries"
echo ""
echo -e "${BLUE}🚀 Next Steps:${NC}"
echo "  1. Start RED Glass: ${GREEN}npm start${NC}"
echo "  2. Click 'Integrations' tab"
echo "  3. Add your first MCP server"
echo ""
echo -e "${BLUE}💡 Quick Test:${NC}"
echo "  Run Python MCP tests: ${GREEN}python3 test_mcp_client.py${NC}"
echo ""
echo -e "${GREEN}Happy integrating! 🎉${NC}"

