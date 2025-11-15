const Store = require('electron-store');
const { app } = require('electron');
const path = require('path');
const fs = require('fs').promises;

// Define the settings schema with defaults
const schema = {
  general: {
    type: 'object',
    properties: {
      theme: {
        type: 'string',
        default: 'system' // 'light', 'dark', 'system'
      },
      language: {
        type: 'string',
        default: 'en'
      },
      startOnLogin: {
        type: 'boolean',
        default: false
      },
      minimizeToTray: {
        type: 'boolean',
        default: true
      },
      closeToTray: {
        type: 'boolean',
        default: true
      },
      showNotifications: {
        type: 'boolean',
        default: true
      },
      autoUpdate: {
        type: 'boolean',
        default: true
      },
      fontSize: {
        type: 'string',
        default: 'medium' // 'small', 'medium', 'large'
      },
      windowOpacity: {
        type: 'number',
        default: 0.95,
        minimum: 0.3,
        maximum: 1.0
      },
      backgroundTransparency: {
        type: 'number',
        default: 1.0,
        minimum: 0.0,
        maximum: 1.0
      },
      backgroundBlur: {
        type: 'number',
        default: 60,
        minimum: 0,
        maximum: 100
      }
    },
    default: {}
  },
  apiKeys: {
    type: 'object',
    properties: {
      openai: {
        type: 'string',
        default: ''
      },
      deepseek: {
        type: 'string',
        default: ''
      },
      selectedProvider: {
        type: 'string',
        default: 'deepseek' // 'openai', 'deepseek'
      },
      openaiModel: {
        type: 'string',
        default: 'gpt-4'
      },
      deepseekModel: {
        type: 'string',
        default: 'deepseek-chat'
      },
      temperature: {
        type: 'number',
        default: 0.7,
        minimum: 0,
        maximum: 2
      },
      maxTokens: {
        type: 'number',
        default: 2000
      }
    },
    default: {}
  },
  audio: {
    type: 'object',
    properties: {
      inputDevice: {
        type: 'string',
        default: 'default'
      },
      outputDevice: {
        type: 'string',
        default: 'default'
      },
      inputVolume: {
        type: 'number',
        default: 100,
        minimum: 0,
        maximum: 100
      },
      outputVolume: {
        type: 'number',
        default: 100,
        minimum: 0,
        maximum: 100
      },
      noiseReduction: {
        type: 'boolean',
        default: true
      },
      echoCancellation: {
        type: 'boolean',
        default: true
      },
      autoGainControl: {
        type: 'boolean',
        default: true
      },
      transcriptionProvider: {
        type: 'string',
        default: 'deepgram' // 'deepgram', 'whisper'
      },
      sampleRate: {
        type: 'number',
        default: 16000
      }
    },
    default: {}
  },
  shortcuts: {
    type: 'object',
    properties: {
      toggleWindow: {
        type: 'string',
        default: process.platform === 'darwin' ? 'CommandOrControl+Shift+Space' : 'Control+Shift+Space'
      },
      captureScreen: {
        type: 'string',
        default: process.platform === 'darwin' ? 'CommandOrControl+Return' : 'Control+Return'
      },
      startTranscription: {
        type: 'string',
        default: process.platform === 'darwin' ? 'CommandOrControl+Shift+T' : 'Control+Shift+T'
      },
      clearChat: {
        type: 'string',
        default: process.platform === 'darwin' ? 'CommandOrControl+K' : 'Control+K'
      },
      focusInput: {
        type: 'string',
        default: process.platform === 'darwin' ? 'CommandOrControl+L' : 'Control+L'
      }
    },
    default: {}
  },
  integrations: {
    type: 'object',
    properties: {
      googleCalendar: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', default: false },
          clientId: { type: 'string', default: '' },
          clientSecret: { type: 'string', default: '' },
          refreshToken: { type: 'string', default: '' }
        },
        default: {}
      },
      googleSheets: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', default: false },
          clientId: { type: 'string', default: '' },
          clientSecret: { type: 'string', default: '' },
          refreshToken: { type: 'string', default: '' }
        },
        default: {}
      },
      notion: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', default: false },
          token: { type: 'string', default: '' }
        },
        default: {}
      },
      gmail: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', default: false },
          clientId: { type: 'string', default: '' },
          clientSecret: { type: 'string', default: '' },
          refreshToken: { type: 'string', default: '' }
        },
        default: {}
      }
    },
    default: {}
  },
  privacy: {
    type: 'object',
    properties: {
      saveConversationHistory: {
        type: 'boolean',
        default: true
      },
      saveTranscriptions: {
        type: 'boolean',
        default: true
      },
      analyticsEnabled: {
        type: 'boolean',
        default: false
      },
      crashReportsEnabled: {
        type: 'boolean',
        default: true
      },
      improveModels: {
        type: 'boolean',
        default: false
      }
    },
    default: {}
  },
  advanced: {
    type: 'object',
    properties: {
      hardwareAcceleration: {
        type: 'boolean',
        default: true
      },
      developerMode: {
        type: 'boolean',
        default: false
      },
      logLevel: {
        type: 'string',
        default: 'info' // 'debug', 'info', 'warn', 'error'
      },
      maxCacheSize: {
        type: 'number',
        default: 500 // MB
      },
      networkTimeout: {
        type: 'number',
        default: 30000 // ms
      }
    },
    default: {}
  },
  currentUser: {
    type: 'object',
    properties: {
      _id: {
        type: 'string',
        default: ''
      },
      email: {
        type: 'string',
        default: ''
      },
      fullName: {
        type: 'string',
        default: ''
      },
      isLoggedIn: {
        type: 'boolean',
        default: false
      }
    },
    default: {}
  },
  subscription: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        default: ''
      },
      tier: {
        type: 'string',
        default: 'free'
      },
      status: {
        type: 'string',
        default: 'inactive'
      },
      isActive: {
        type: 'boolean',
        default: false
      },
      lastChecked: {
        type: 'string',
        default: ''
      },
      features: {
        type: 'array',
        default: []
      },
      limits: {
        type: 'object',
        default: {}
      }
    },
    default: {}
  }
};

// Initialize the store
const store = new Store({ schema });

class SettingsManager {
  constructor() {
    this.store = store;
    this.listeners = new Map();
  }

  // Get all settings
  getAll() {
    return {
      general: this.store.get('general', schema.general.default),
      apiKeys: this.store.get('apiKeys', schema.apiKeys.default),
      audio: this.store.get('audio', schema.audio.default),
      shortcuts: this.store.get('shortcuts', schema.shortcuts.default),
      integrations: this.store.get('integrations', schema.integrations.default),
      privacy: this.store.get('privacy', schema.privacy.default),
      advanced: this.store.get('advanced', schema.advanced.default),
      currentUser: this.store.get('currentUser', schema.currentUser.default),
      subscription: this.store.get('subscription', schema.subscription.default)
    };
  }

  // Get a specific category
  get(category) {
    const defaultValue = schema[category]?.default || {};
    return this.store.get(category, defaultValue);
  }

  // Get a specific setting
  getSetting(category, key) {
    const categoryData = this.get(category);
    return categoryData[key];
  }

  // Set a specific category
  set(category, value) {
    this.store.set(category, value);
    this.notifyListeners(category, value);
  }

  // Set a specific setting
  setSetting(category, key, value) {
    const categoryData = this.get(category);
    categoryData[key] = value;
    this.set(category, categoryData);
  }

  // Update multiple settings in a category
  update(category, updates) {
    const current = this.get(category);
    const updated = { ...current, ...updates };
    this.set(category, updated);
  }

  // Reset a category to defaults
  reset(category) {
    const defaultValue = schema[category]?.default || {};
    this.set(category, defaultValue);
  }

  // Reset all settings
  resetAll() {
    Object.keys(schema).forEach(category => {
      this.reset(category);
    });
  }

  // Clear all data (conversations, cache, etc.)
  async clearData(options = {}) {
    const {
      conversations = false,
      transcriptions = false,
      cache = false,
      workflows = false
    } = options;

    const results = {
      success: true,
      cleared: []
    };

    try {
      if (conversations) {
        // Clear conversation history
        const conversationPath = path.join(app.getPath('userData'), 'conversations');
        try {
          await fs.rm(conversationPath, { recursive: true, force: true });
          results.cleared.push('conversations');
        } catch (err) {
          console.error('Error clearing conversations:', err);
        }
      }

      if (transcriptions) {
        // Clear transcription history
        const transcriptionPath = path.join(app.getPath('userData'), 'transcriptions');
        try {
          await fs.rm(transcriptionPath, { recursive: true, force: true });
          results.cleared.push('transcriptions');
        } catch (err) {
          console.error('Error clearing transcriptions:', err);
        }
      }

      if (cache) {
        // Clear cache
        const cachePath = path.join(app.getPath('userData'), 'Cache');
        try {
          await fs.rm(cachePath, { recursive: true, force: true });
          results.cleared.push('cache');
        } catch (err) {
          console.error('Error clearing cache:', err);
        }
      }

      if (workflows) {
        // Clear workflows
        const workflowPath = path.join(app.getPath('userData'), 'workflows');
        try {
          await fs.rm(workflowPath, { recursive: true, force: true });
          results.cleared.push('workflows');
        } catch (err) {
          console.error('Error clearing workflows:', err);
        }
      }

    } catch (error) {
      results.success = false;
      results.error = error.message;
    }

    return results;
  }

  // Export settings
  async exportSettings() {
    const settings = this.getAll();
    const exportData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      settings: settings
    };
    return exportData;
  }

  // Import settings
  async importSettings(data) {
    try {
      if (!data.version || !data.settings) {
        throw new Error('Invalid settings file format');
      }

      // Import each category
      Object.keys(data.settings).forEach(category => {
        if (schema[category]) {
          this.set(category, data.settings[category]);
        }
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Subscribe to settings changes
  subscribe(category, callback) {
    if (!this.listeners.has(category)) {
      this.listeners.set(category, new Set());
    }
    this.listeners.get(category).add(callback);

    // Return unsubscribe function
    return () => {
      const categoryListeners = this.listeners.get(category);
      if (categoryListeners) {
        categoryListeners.delete(callback);
      }
    };
  }

  // Notify listeners of changes
  notifyListeners(category, value) {
    const categoryListeners = this.listeners.get(category);
    if (categoryListeners) {
      categoryListeners.forEach(callback => {
        try {
          callback(value);
        } catch (error) {
          console.error('Error in settings listener:', error);
        }
      });
    }
  }

  // Validate a setting value
  validate(category, key, value) {
    const categorySchema = schema[category];
    if (!categorySchema || !categorySchema.properties) {
      return { valid: false, error: 'Invalid category' };
    }

    const propertySchema = categorySchema.properties[key];
    if (!propertySchema) {
      return { valid: false, error: 'Invalid setting key' };
    }

    // Type validation
    if (propertySchema.type === 'number') {
      if (typeof value !== 'number') {
        return { valid: false, error: 'Value must be a number' };
      }
      if (propertySchema.minimum !== undefined && value < propertySchema.minimum) {
        return { valid: false, error: `Value must be >= ${propertySchema.minimum}` };
      }
      if (propertySchema.maximum !== undefined && value > propertySchema.maximum) {
        return { valid: false, error: `Value must be <= ${propertySchema.maximum}` };
      }
    } else if (propertySchema.type === 'boolean') {
      if (typeof value !== 'boolean') {
        return { valid: false, error: 'Value must be a boolean' };
      }
    } else if (propertySchema.type === 'string') {
      if (typeof value !== 'string') {
        return { valid: false, error: 'Value must be a string' };
      }
    }

    return { valid: true };
  }

  // Get statistics about stored data
  async getDataStatistics() {
    const userDataPath = app.getPath('userData');
    const stats = {
      conversations: { count: 0, size: 0 },
      transcriptions: { count: 0, size: 0 },
      cache: { size: 0 },
      total: { size: 0 }
    };

    const getDirectorySize = async (dirPath) => {
      try {
        const files = await fs.readdir(dirPath, { withFileTypes: true });
        let size = 0;
        let count = 0;

        for (const file of files) {
          const filePath = path.join(dirPath, file.name);
          if (file.isDirectory()) {
            const subStats = await getDirectorySize(filePath);
            size += subStats.size;
            count += subStats.count;
          } else {
            const stat = await fs.stat(filePath);
            size += stat.size;
            count++;
          }
        }

        return { size, count };
      } catch (error) {
        return { size: 0, count: 0 };
      }
    };

    // Get conversations size
    const conversationPath = path.join(userDataPath, 'conversations');
    const convStats = await getDirectorySize(conversationPath);
    stats.conversations = convStats;

    // Get transcriptions size
    const transcriptionPath = path.join(userDataPath, 'transcriptions');
    const transStats = await getDirectorySize(transcriptionPath);
    stats.transcriptions = transStats;

    // Get cache size
    const cachePath = path.join(userDataPath, 'Cache');
    const cacheStats = await getDirectorySize(cachePath);
    stats.cache = { size: cacheStats.size };

    // Calculate total
    stats.total.size = stats.conversations.size + stats.transcriptions.size + stats.cache.size;

    // Format sizes in MB
    stats.conversations.sizeFormatted = (stats.conversations.size / (1024 * 1024)).toFixed(2) + ' MB';
    stats.transcriptions.sizeFormatted = (stats.transcriptions.size / (1024 * 1024)).toFixed(2) + ' MB';
    stats.cache.sizeFormatted = (stats.cache.size / (1024 * 1024)).toFixed(2) + ' MB';
    stats.total.sizeFormatted = (stats.total.size / (1024 * 1024)).toFixed(2) + ' MB';

    return stats;
  }

  updateSubscription(subscriptionData) {
    const current = this.get('subscription');
    const updated = {
      ...current,
      ...subscriptionData,
      lastChecked: new Date().toISOString()
    };
    this.set('subscription', updated);
    return updated;
  }

  getSubscription() {
    return this.get('subscription');
  }

  getCurrentUser() {
    return this.get('currentUser');
  }

  setCurrentUser(userData) {
    this.set('currentUser', {
      _id: userData._id ? userData._id.toString() : '',
      email: userData.email || '',
      fullName: userData.fullName || userData.name || '',
      isLoggedIn: true
    });
  }

  clearCurrentUser() {
    this.set('currentUser', {
      _id: '',
      email: '',
      fullName: '',
      isLoggedIn: false
    });
  }
}

// Create singleton instance
const settingsManager = new SettingsManager();

module.exports = settingsManager;


