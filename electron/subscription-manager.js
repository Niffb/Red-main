 const mongoDBService = require('./mongodb-service');

class SubscriptionManager {
  constructor() {
    this.currentUser = null;
  }

  setCurrentUser(user) {
    this.currentUser = user;
    console.log('✅ Current user set:', user.email);
  }

  getCurrentUser() {
    return this.currentUser;
  }

  clearCurrentUser() {
    this.currentUser = null;
    console.log('🔓 User logged out');
  }

  isUserLoggedIn() {
    return this.currentUser !== null;
  }

  /**
   * Check if user can use a specific feature
   * @param {string} featureName - Feature to check
   * @returns {object} { allowed: boolean, reason?: string }
   */
  canUseFeature(featureName) {
    if (!this.currentUser) {
      return { allowed: false, reason: 'User not logged in' };
    }

    const tier = this.currentUser.subscription.tier;
    const tierInfo = mongoDBService.getTierInfo(tier);

    switch (featureName) {
      case 'chat':
        return this.canSendMessage();
      
      case 'transcription':
        if (tierInfo.transcriptionHours === 0) {
          return { allowed: false, reason: 'Transcription not available in your tier. Upgrade to Super-Red or Ultra-Red.' };
        }
        return this.canUseTranscription();
      
      case 'mcp':
        if (tierInfo.mcpConnections === 0) {
          return { allowed: false, reason: 'MCP connections not available in your tier. Upgrade to Super-Red or Ultra-Red.' };
        }
        return { allowed: true };
      
      case 'workflows':
        return { allowed: true };
      
      case 'behavioral-analysis':
        if (tier !== 'ultra-red') {
          return { allowed: false, reason: 'Behavioral analysis only available in Ultra-Red tier.' };
        }
        return { allowed: true };
      
      default:
        return { allowed: true };
    }
  }

  /**
   * Check if user can send a message
   * @returns {object} { allowed: boolean, reason?: string, remaining?: number }
   */
  canSendMessage() {
    if (!this.currentUser) {
      return { allowed: false, reason: 'User not logged in' };
    }

    const tier = this.currentUser.subscription.tier;
    const tierInfo = mongoDBService.getTierInfo(tier);
    const messagesUsed = this.currentUser.usage.messagesUsedToday || 0;

    if (tierInfo.messagesPerDay === Infinity) {
      return { allowed: true, remaining: 'unlimited' };
    }

    if (messagesUsed >= tierInfo.messagesPerDay) {
      return {
        allowed: false,
        reason: `You've used all ${tierInfo.messagesPerDay} messages for today`,
        remaining: 0,
        limit: tierInfo.messagesPerDay,
        used: messagesUsed
      };
    }

    return {
      allowed: true,
      remaining: tierInfo.messagesPerDay - messagesUsed
    };
  }

  /**
   * Check if user can create a workflow
   * @param {number} stepCount - Number of steps in the workflow
   * @returns {object} { allowed: boolean, reason?: string }
   */
  canCreateWorkflow(stepCount = 1) {
    if (!this.currentUser) {
      return { allowed: false, reason: 'User not logged in' };
    }

    const tier = this.currentUser.subscription.tier;
    const tierInfo = mongoDBService.getTierInfo(tier);
    const activeWorkflows = this.currentUser.usage.activeWorkflows || 0;

    // Check workflow count limit
    if (tierInfo.workflows.max !== Infinity && activeWorkflows >= tierInfo.workflows.max) {
      return {
        allowed: false,
        reason: `Workflow limit reached (${tierInfo.workflows.max} workflows). Delete existing workflows or upgrade your plan.`
      };
    }

    // Check workflow complexity (step count)
    if (tierInfo.workflows.maxSteps !== Infinity && stepCount > tierInfo.workflows.maxSteps) {
      return {
        allowed: false,
        reason: `Workflow too complex. Your tier allows max ${tierInfo.workflows.maxSteps} step(s). This workflow has ${stepCount} step(s). Upgrade to create more complex workflows.`
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can add an MCP connection
   * @returns {object} { allowed: boolean, reason?: string, remaining?: number }
   */
  canAddMCPConnection(currentConnectionCount = 0) {
    if (!this.currentUser) {
      return { allowed: false, reason: 'User not logged in' };
    }

    const tier = this.currentUser.subscription.tier;
    const tierInfo = mongoDBService.getTierInfo(tier);

    if (tierInfo.mcpConnections === 0) {
      return {
        allowed: false,
        reason: 'MCP servers are not available on the Free plan. Upgrade to unlock this feature.'
      };
    }

    if (tierInfo.mcpConnections === Infinity) {
      return { allowed: true, remaining: 'unlimited' };
    }

    if (currentConnectionCount >= tierInfo.mcpConnections) {
      return {
        allowed: false,
        reason: `You've reached the limit of ${tierInfo.mcpConnections} MCP servers. Remove one or upgrade your plan.`,
        remaining: 0,
        limit: tierInfo.mcpConnections,
        current: currentConnectionCount
      };
    }

    return {
      allowed: true,
      remaining: tierInfo.mcpConnections - currentConnectionCount
    };
  }

  /**
   * Check if user can use transcription
   * @returns {object} { allowed: boolean, reason?: string, remaining?: number }
   */
  canUseTranscription() {
    if (!this.currentUser) {
      return { allowed: false, reason: 'User not logged in' };
    }

    const tier = this.currentUser.subscription.tier;
    const tierInfo = mongoDBService.getTierInfo(tier);
    const minutesUsed = this.currentUser.usage.transcriptionMinutesUsed || 0;

    if (tierInfo.transcriptionHours === 0) {
      return {
        allowed: false,
        reason: 'Transcription is not available on the Free plan. Upgrade to unlock this feature.'
      };
    }

    if (tierInfo.transcriptionHours === Infinity) {
      return { allowed: true, remaining: 'unlimited' };
    }

    const totalMinutesAllowed = tierInfo.transcriptionHours * 60;
    if (minutesUsed >= totalMinutesAllowed) {
      return {
        allowed: false,
        reason: `You've used all ${tierInfo.transcriptionHours} hours of transcription this month`,
        remaining: 0,
        limit: totalMinutesAllowed,
        used: minutesUsed
      };
    }

    return {
      allowed: true,
      remaining: totalMinutesAllowed - minutesUsed,
      remainingHours: ((totalMinutesAllowed - minutesUsed) / 60).toFixed(1)
    };
  }

  /**
   * Get usage statistics for current user
   * @returns {object} Usage stats with limits
   */
  getUsageStats() {
    if (!this.currentUser) {
      return null;
    }

    const tier = this.currentUser.subscription.tier;
    const tierInfo = mongoDBService.getTierInfo(tier);
    const usage = this.currentUser.usage;

    return {
      tier: tier,
      tierName: tierInfo.name,
      messages: {
        used: usage.messagesUsedToday || 0,
        limit: tierInfo.messagesPerDay,
        remaining: tierInfo.messagesPerDay === Infinity 
          ? 'unlimited' 
          : tierInfo.messagesPerDay - (usage.messagesUsedToday || 0)
      },
      workflows: {
        active: usage.activeWorkflows || 0,
        limit: tierInfo.workflows.max,
        maxSteps: tierInfo.workflows.maxSteps
      },
      mcpConnections: {
        limit: tierInfo.mcpConnections
      },
      transcription: {
        used: usage.transcriptionMinutesUsed || 0,
        limit: tierInfo.transcriptionHours === Infinity 
          ? 'unlimited' 
          : tierInfo.transcriptionHours * 60,
        remaining: tierInfo.transcriptionHours === Infinity 
          ? 'unlimited' 
          : (tierInfo.transcriptionHours * 60) - (usage.transcriptionMinutesUsed || 0)
      },
      features: tierInfo.features
    };
  }

  /**
   * Increment message usage for current user
   */
  async incrementMessageUsage() {
    if (!this.currentUser) {
      return { success: false, error: 'User not logged in' };
    }

    const result = await mongoDBService.incrementMessageUsage(this.currentUser._id);
    
    if (result.success) {
      // Update local cache
      if (!this.currentUser.usage) {
        this.currentUser.usage = {};
      }
      this.currentUser.usage.messagesUsedToday = (this.currentUser.usage.messagesUsedToday || 0) + 1;
    }

    return result;
  }

  /**
   * Update transcription usage for current user
   */
  async updateTranscriptionUsage(minutesUsed) {
    if (!this.currentUser) {
      return { success: false, error: 'User not logged in' };
    }

    const result = await mongoDBService.updateTranscriptionUsage(this.currentUser._id, minutesUsed);
    
    if (result.success) {
      // Update local cache
      if (!this.currentUser.usage) {
        this.currentUser.usage = {};
      }
      this.currentUser.usage.transcriptionMinutesUsed = 
        (this.currentUser.usage.transcriptionMinutesUsed || 0) + minutesUsed;
    }

    return result;
  }

  /**
   * Update workflow count for current user
   */
  async updateWorkflowCount(count) {
    if (!this.currentUser) {
      return { success: false, error: 'User not logged in' };
    }

    const result = await mongoDBService.updateWorkflowCount(this.currentUser._id, count);
    
    if (result.success) {
      // Update local cache
      if (!this.currentUser.usage) {
        this.currentUser.usage = {};
      }
      this.currentUser.usage.activeWorkflows = count;
    }

    return result;
  }

  /**
   * Refresh current user data from database
   */
  async refreshUserData() {
    if (!this.currentUser) {
      return { success: false, error: 'User not logged in' };
    }

    const result = await mongoDBService.getUserByEmail(this.currentUser.email);
    
    if (result.success) {
      this.currentUser = result.user;
    }

    return result;
  }
}

// Create singleton instance
const subscriptionManager = new SubscriptionManager();

module.exports = subscriptionManager;


