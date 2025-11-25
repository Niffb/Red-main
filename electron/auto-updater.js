const { autoUpdater } = require('electron-updater');
const { app, dialog, BrowserWindow } = require('electron');

class AppUpdater {
  constructor() {
    this.updateAvailable = false;
    this.updateDownloaded = false;
    this.updateInfo = null;
    this.mainWindow = null;
    
    this.configureUpdater();
    this.setupEventHandlers();
  }

  configureUpdater() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    
    autoUpdater.logger = {
      info: (msg) => console.log('[AutoUpdater]', msg),
      warn: (msg) => console.warn('[AutoUpdater]', msg),
      error: (msg) => console.error('[AutoUpdater]', msg),
      debug: (msg) => console.log('[AutoUpdater Debug]', msg)
    };

    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
      autoUpdater.forceDevUpdateConfig = true;
    }
  }

  setupEventHandlers() {
    autoUpdater.on('checking-for-update', () => {
      console.log('[AutoUpdater] Checking for updates...');
      this.sendStatusToRenderer('checking-for-update');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('[AutoUpdater] Update available:', info.version);
      this.updateAvailable = true;
      this.updateInfo = info;
      this.sendStatusToRenderer('update-available', info);
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('[AutoUpdater] No update available');
      this.updateAvailable = false;
      this.sendStatusToRenderer('update-not-available', info);
    });

    autoUpdater.on('download-progress', (progress) => {
      console.log(`[AutoUpdater] Download progress: ${Math.round(progress.percent)}%`);
      this.sendStatusToRenderer('download-progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[AutoUpdater] Update downloaded:', info.version);
      this.updateDownloaded = true;
      this.sendStatusToRenderer('update-downloaded', info);
    });

    autoUpdater.on('error', (error) => {
      console.error('[AutoUpdater] Error:', error.message);
      this.sendStatusToRenderer('error', { message: error.message });
    });
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  sendStatusToRenderer(status, data = null) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update-status', { status, data });
    }
  }

  async checkForUpdates() {
    if (!app.isPackaged) {
      console.log('[AutoUpdater] Skipping update check in development mode');
      return { updateAvailable: false, isDev: true };
    }

    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        updateAvailable: this.updateAvailable,
        currentVersion: app.getVersion(),
        latestVersion: result?.updateInfo?.version || null
      };
    } catch (error) {
      console.error('[AutoUpdater] Check for updates failed:', error);
      throw error;
    }
  }

  async downloadUpdate() {
    if (!this.updateAvailable) {
      throw new Error('No update available to download');
    }

    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      console.error('[AutoUpdater] Download failed:', error);
      throw error;
    }
  }

  quitAndInstall() {
    if (!this.updateDownloaded) {
      throw new Error('No update downloaded to install');
    }

    autoUpdater.quitAndInstall(false, true);
  }

  async promptUserForUpdate() {
    if (!this.updateInfo) return;

    const response = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${this.updateInfo.version}) is available.`,
      detail: 'Would you like to download and install it now?',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    });

    if (response.response === 0) {
      await this.downloadUpdate();
    }
  }

  async promptUserToRestart() {
    const response = await dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update has been downloaded.',
      detail: 'The application will restart to apply the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    });

    if (response.response === 0) {
      this.quitAndInstall();
    }
  }

  getStatus() {
    return {
      updateAvailable: this.updateAvailable,
      updateDownloaded: this.updateDownloaded,
      currentVersion: app.getVersion(),
      updateInfo: this.updateInfo
    };
  }
}

let updaterInstance = null;

function getUpdater() {
  if (!updaterInstance) {
    updaterInstance = new AppUpdater();
  }
  return updaterInstance;
}

module.exports = {
  AppUpdater,
  getUpdater
};

