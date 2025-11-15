#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, description) {
  return new Promise((resolve, reject) => {
    log(`\n🔄 ${description}...`, 'cyan');
    
    const process = spawn(command, [], { 
      shell: true, 
      stdio: 'inherit',
      cwd: __dirname 
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        log(`✅ ${description} completed successfully!`, 'green');
        resolve();
      } else {
        log(`❌ ${description} failed with code ${code}`, 'red');
        reject(new Error(`${description} failed`));
      }
    });
    
    process.on('error', (error) => {
      log(`❌ Error running ${description}: ${error.message}`, 'red');
      reject(error);
    });
  });
}

async function buildApp() {
  try {
    log('🚀 Starting Red Glass build process...', 'bright');
    
    // Check if we're on macOS for cross-platform builds
    const platform = process.platform;
    log(`📱 Building on ${platform}`, 'blue');
    
    // Step 1: Generate icons
    log('\n📸 Generating application icons...', 'magenta');
    try {
      await runCommand('node build-icons.js', 'Icon generation');
    } catch (error) {
      log('⚠️  Icon generation failed, continuing with build...', 'yellow');
    }
    
    // Step 2: Clean previous builds
    log('\n🧹 Cleaning previous builds...', 'magenta');
    if (fs.existsSync('dist')) {
      fs.rmSync('dist', { recursive: true, force: true });
    }
    
    // Step 3: Build frontend with webpack
    log('\n🎨 Note: Original navigation pill UI is preserved in index.html', 'cyan');
    log('   React app components are built to react-app.html', 'cyan');
    await runCommand('webpack --mode=production', 'Frontend build (webpack)');
    
    // Step 4: Build executables based on platform
    const buildTarget = process.argv[2] || 'current';
    
    switch (buildTarget) {
      case 'mac':
        await runCommand('electron-builder --mac', 'macOS build');
        break;
      case 'win':
        await runCommand('electron-builder --win', 'Windows build');
        break;
      case 'linux':
        await runCommand('electron-builder --linux', 'Linux build');
        break;
      case 'all':
        if (platform === 'darwin') {
          await runCommand('electron-builder --mac --win --linux', 'Multi-platform build');
        } else {
          log('⚠️  Multi-platform builds work best on macOS. Building for current platform...', 'yellow');
          await runCommand('electron-builder', 'Current platform build');
        }
        break;
      default:
        await runCommand('electron-builder', 'Current platform build');
    }
    
    // Step 5: Show build results
    log('\n📦 Build completed successfully!', 'green');
    log('\n📁 Build artifacts can be found in the "dist" folder:', 'bright');
    
    if (fs.existsSync('dist')) {
      const files = fs.readdirSync('dist');
      files.forEach(file => {
        const filePath = path.join('dist', file);
        const stats = fs.statSync(filePath);
        const size = (stats.size / 1024 / 1024).toFixed(2);
        log(`   • ${file} (${size} MB)`, 'cyan');
      });
    }
    
    log('\n🎉 Red Glass is ready for distribution!', 'bright');
    
  } catch (error) {
    log(`\n❌ Build failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Show usage information
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  log('Red Glass Build Script', 'bright');
  log('\nUsage:', 'cyan');
  log('  node build.js [target]', 'white');
  log('\nTargets:', 'cyan');
  log('  (none)  - Build for current platform', 'white');
  log('  mac     - Build for macOS (DMG + ZIP)', 'white');
  log('  win     - Build for Windows (NSIS installer + ZIP)', 'white');
  log('  linux   - Build for Linux (AppImage + DEB + RPM)', 'white');
  log('  all     - Build for all platforms (works best on macOS)', 'white');
  log('\nExamples:', 'cyan');
  log('  node build.js', 'white');
  log('  node build.js mac', 'white');
  log('  node build.js all', 'white');
  process.exit(0);
}

// Run the build
buildApp(); 