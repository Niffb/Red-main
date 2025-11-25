# Red Glass Distribution Guide

This guide covers how to build, sign, and distribute Red Glass with automatic updates.

## Prerequisites

1. **Node.js** (v18 or later)
2. **npm** or **yarn**
3. **GitHub account** with a repository for releases
4. **GitHub Personal Access Token** with `repo` scope

## Quick Start

```bash
# Install dependencies
npm install

# Build for current platform
npm run build

# Build and publish a release
GH_TOKEN=your_github_token npm run release
```

## Configuration

### 1. Update package.json

Before your first release, update the `publish` section in `package.json`:

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "YOUR_GITHUB_USERNAME",
      "repo": "red-glass",
      "releaseType": "release"
    }
  }
}
```

Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username and `red-glass` with your repository name.

### 2. GitHub Token

Create a GitHub Personal Access Token:

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a descriptive name (e.g., "Red Glass Releases")
4. Select the `repo` scope (full control of private repositories)
5. Click "Generate token"
6. Copy the token and save it securely

Set the token as an environment variable:

```bash
# For a single session
export GH_TOKEN=your_github_token

# Or add to your shell profile (~/.zshrc or ~/.bashrc)
export GH_TOKEN=your_github_token
```

## Building & Publishing

### Build Commands

```bash
# Build for current platform only (no publishing)
npm run build

# Build for specific platforms
npm run build:mac     # macOS (DMG + ZIP)
npm run build:win     # Windows (NSIS installer + ZIP)
npm run build:linux   # Linux (AppImage + DEB + RPM)
npm run build:all     # All platforms

# Build and publish releases
npm run release       # Current platform
npm run release:mac   # macOS
npm run release:win   # Windows
npm run release:linux # Linux

# Using build.js directly with options
node build.js mac --publish
node build.js publish
```

### Version Bumping

Before releasing a new version, update the version in `package.json`:

```bash
# Patch release (1.0.0 → 1.0.1)
npm version patch

# Minor release (1.0.0 → 1.1.0)
npm version minor

# Major release (1.0.0 → 2.0.0)
npm version major
```

Then build and publish:

```bash
npm run release
```

## Code Signing

Code signing is essential for distributing your app without security warnings.

### macOS Code Signing

#### Requirements
- Apple Developer account ($99/year)
- Developer ID Application certificate
- Developer ID Installer certificate (for PKG files)
- Xcode Command Line Tools

#### Setup

1. **Enrol in Apple Developer Programme**
   - Visit https://developer.apple.com/programs/
   - Complete enrolment ($99/year)

2. **Create Certificates**
   - Open Keychain Access
   - Go to Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority
   - Visit https://developer.apple.com/account/resources/certificates
   - Create "Developer ID Application" and "Developer ID Installer" certificates
   - Download and install them in Keychain

3. **Configure electron-builder**
   
   Add to `package.json`:
   ```json
   {
     "build": {
       "mac": {
         "identity": "Developer ID Application: Your Name (TEAM_ID)",
         "hardenedRuntime": true,
         "gatekeeperAssess": false,
         "entitlements": "build/entitlements.mac.plist",
         "entitlementsInherit": "build/entitlements.mac.plist"
       },
       "afterSign": "scripts/notarize.js"
     }
   }
   ```

4. **Create Entitlements File**
   
   Create `build/entitlements.mac.plist`:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
     <dict>
       <key>com.apple.security.cs.allow-jit</key>
       <true/>
       <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
       <true/>
       <key>com.apple.security.cs.disable-library-validation</key>
       <true/>
       <key>com.apple.security.automation.apple-events</key>
       <true/>
     </dict>
   </plist>
   ```

5. **Notarisation (Required for macOS Catalina+)**
   
   Create `scripts/notarize.js`:
   ```javascript
   const { notarize } = require('@electron/notarize');

   exports.default = async function notarizing(context) {
     const { electronPlatformName, appOutDir } = context;
     if (electronPlatformName !== 'darwin') return;

     const appName = context.packager.appInfo.productFilename;

     return await notarize({
       appBundleId: 'com.redglass.app',
       appPath: `${appOutDir}/${appName}.app`,
       appleId: process.env.APPLE_ID,
       appleIdPassword: process.env.APPLE_APP_PASSWORD,
       teamId: process.env.APPLE_TEAM_ID
     });
   };
   ```

   Set environment variables:
   ```bash
   export APPLE_ID=your@email.com
   export APPLE_APP_PASSWORD=your-app-specific-password
   export APPLE_TEAM_ID=YOUR_TEAM_ID
   ```

### Windows Code Signing

#### Requirements
- Code signing certificate (EV or OV)
- Windows SDK (for signtool)

#### Setup

1. **Purchase a Code Signing Certificate**
   - Recommended providers: DigiCert, Sectigo, GlobalSign
   - EV certificates provide immediate SmartScreen reputation
   - OV certificates require building reputation over time

2. **Configure electron-builder**
   
   Add to `package.json`:
   ```json
   {
     "build": {
       "win": {
         "certificateFile": "path/to/certificate.pfx",
         "certificatePassword": "${WIN_CSC_KEY_PASSWORD}"
       }
     }
   }
   ```

   Or use environment variables:
   ```bash
   export WIN_CSC_LINK=path/to/certificate.pfx
   export WIN_CSC_KEY_PASSWORD=your_certificate_password
   ```

## Auto-Updates

The app is configured for automatic updates using `electron-updater`.

### How It Works

1. On app launch, it checks for updates from GitHub Releases
2. If an update is available, users are prompted to download
3. After download, users can restart to install the update

### Frontend Integration

You can use the exposed APIs in your frontend:

```javascript
// Check for updates manually
const result = await window.electronAPI.checkForUpdates();
console.log('Update available:', result.updateAvailable);

// Download an available update
await window.electronAPI.downloadUpdate();

// Install a downloaded update (restarts the app)
await window.electronAPI.installUpdate();

// Get current update status
const status = await window.electronAPI.getUpdateStatus();
console.log('Current version:', status.currentVersion);
console.log('Update downloaded:', status.updateDownloaded);

// Listen for update events
const cleanup = window.electronAPI.onUpdateStatus((data) => {
  switch (data.status) {
    case 'checking-for-update':
      console.log('Checking for updates...');
      break;
    case 'update-available':
      console.log('Update available:', data.data.version);
      break;
    case 'download-progress':
      console.log('Download progress:', data.data.percent + '%');
      break;
    case 'update-downloaded':
      console.log('Update ready to install');
      break;
    case 'error':
      console.error('Update error:', data.data.message);
      break;
  }
});

// Clean up listener when done
cleanup();
```

### Update Server Alternatives

Instead of GitHub Releases, you can use:

1. **Amazon S3**
   ```json
   {
     "publish": {
       "provider": "s3",
       "bucket": "your-bucket-name"
     }
   }
   ```

2. **Generic HTTPS Server**
   ```json
   {
     "publish": {
       "provider": "generic",
       "url": "https://your-server.com/updates"
     }
   }
   ```

## Release Checklist

Before each release:

- [ ] Update version in `package.json`
- [ ] Test the app thoroughly
- [ ] Update changelog/release notes
- [ ] Ensure all secrets are set (GH_TOKEN, signing certificates)
- [ ] Build and test locally first
- [ ] Publish the release
- [ ] Verify the update works by installing previous version and updating

## Troubleshooting

### "Code signature invalid" on macOS
- Ensure certificates are properly installed in Keychain
- Check that the identity name matches exactly
- Verify entitlements file exists and is valid

### "SmartScreen blocked this app" on Windows
- Use an EV certificate for immediate trust
- With OV certificates, reputation builds over time as more users install

### Updates not detected
- Ensure the GitHub release is not a draft
- Check that version in package.json is higher than current
- Verify GH_TOKEN has correct permissions
- Check network connectivity

### Build fails with signing errors
- Verify all environment variables are set
- Check certificate hasn't expired
- Ensure the correct SDK/tools are installed

## Support

For issues with distribution:
1. Check electron-builder docs: https://www.electron.build/
2. Check electron-updater docs: https://www.electron.build/auto-update
3. Review GitHub Actions logs if using CI/CD

