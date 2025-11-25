const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const { DatabaseError, handleError } = require('./error-handler');

// Subscription tier definitions
const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    messagesPerDay: 20,
    workflows: { max: 2, complexity: 'simple', maxSteps: 1 },
    mcpConnections: 0,
    transcriptionHours: 0,
    features: [
      'Basic chat functionality',
      'Up to 2 simple workflows',
      'Community support'
    ],
    limits: {
      messages_per_day: 20,
      workflows: 2,
      workflow_steps: 1,
      mcp_connections: 0,
      transcription_hours: 0
    }
  },
  'super-red': {
    name: 'Super-Red',
    messagesPerDay: 300,
    workflows: { max: Infinity, maxSteps: 3 },
    mcpConnections: 3,
    transcriptionHours: 3,
    features: [
      '300 messages per day',
      'Unlimited multi-step workflows (up to 3 steps)',
      '3 MCP connections',
      '3 hours transcription per month',
      'Priority support'
    ],
    limits: {
      messages_per_day: 300,
      workflows: 'unlimited',
      workflow_steps: 3,
      mcp_connections: 3,
      transcription_hours: 3
    }
  },
  'ultra-red': {
    name: 'Ultra-Red',
    messagesPerDay: Infinity,
    workflows: { max: Infinity, maxSteps: Infinity },
    mcpConnections: Infinity,
    transcriptionHours: Infinity,
    features: [
      'Unlimited messages',
      'Unlimited workflows & integrations',
      'Full transcription access',
      'Behavioral analysis',
      'Dedicated support'
    ],
    limits: {
      messages_per_day: 'unlimited',
      workflows: 'unlimited',
      workflow_steps: 'unlimited',
      mcp_connections: 'unlimited',
      transcription_hours: 'unlimited'
    }
  }
};

class MongoDBService {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;
    this.uri = process.env.MONGODB_URI;
    this.isConfigured = !!this.uri;
    if (!this.uri) {
      console.warn('⚠️ MONGODB_URI not set - MongoDB features will be disabled');
      console.warn('💡 To enable MongoDB, add MONGODB_URI to your .env file');
    }
    this.dbName = 'red-ai-app';
    this.SUBSCRIPTION_TIERS = SUBSCRIPTION_TIERS;
  }

  async connect() {
    try {
      if (!this.isConfigured) {
        return { success: false, message: 'MongoDB not configured' };
      }
      if (this.isConnected) {
        return { success: true, message: 'Already connected' };
      }

      this.client = new MongoClient(this.uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
      });

      await this.client.connect();
      this.db = this.client.db(this.dbName);
      this.isConnected = true;

      console.log('✅ MongoDB connected successfully');
      return { success: true, message: 'MongoDB connected successfully' };
    } catch (error) {
      this.isConnected = false;
      console.error('❌ MongoDB connection error:', error.message);
      return { 
        success: false, 
        error: error.message,
        details: 'Failed to connect to MongoDB. Please check your connection.' 
      };
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.close();
        this.client = null;
        this.db = null;
        this.isConnected = false;
        console.log('MongoDB disconnected');
      }
      return { success: true };
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error);
      return { success: false, error: error.message };
    }
  }

  async getUserById(userId) {
    try {
      if (!this.isConnected) {
        const connectResult = await this.connect();
        if (!connectResult.success) {
          return connectResult;
        }
      }

      const collection = this.db.collection('users');
      const user = await collection.findOne({ _id: userId });

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      return { 
        success: true, 
        user: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
          subscription: user.subscription || {
            tier: 'free',
            status: 'active',
            expiresAt: null
          },
          preferences: user.preferences || {},
          usage: user.usage || {
            totalMessages: 0,
            totalTranscriptions: 0,
            storageUsed: 0
          }
        }
      };
    } catch (error) {
      console.error('Error fetching user:', error);
      return { success: false, error: error.message };
    }
  }

  async getUserByEmail(email) {
    try {
      if (!this.isConnected) {
        const connectResult = await this.connect();
        if (!connectResult.success) {
          return connectResult;
        }
      }

      const collection = this.db.collection('users');
      const user = await collection.findOne({ email: email });

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // COMPATIBILITY: Support both landing page and app user formats
      // Landing page uses 'name' field, app uses 'fullName'
      const fullName = user.fullName || user.name || '';
      
      // Map landing page 'plan' to app 'subscription.tier'
      const landingPageTier = this.mapPlanToTier(user.plan);
      const tier = user.subscription?.tier || landingPageTier || 'free';

      // Initialize usage object if it doesn't exist (landing page users)
      if (!user.usage || !user.usage.lastResetDate) {
        await this.initializeUsageTracking(user._id);
        user.usage = {
          messagesUsedToday: 0,
          lastResetDate: new Date(),
          transcriptionMinutesUsed: 0,
          activeWorkflows: 0
        };
      }

      // Reset daily usage if needed
      const today = new Date().toISOString().split('T')[0];
      const lastResetDate = user.usage?.lastResetDate 
        ? new Date(user.usage.lastResetDate).toISOString().split('T')[0] 
        : null;

      if (lastResetDate !== today) {
        await this.resetDailyUsage(user._id);
        user.usage.messagesUsedToday = 0;
        user.usage.lastResetDate = new Date();
      }

      const tierInfo = this.SUBSCRIPTION_TIERS[tier];

      return { 
        success: true, 
        user: {
          _id: user._id,
          fullName: fullName,
          email: user.email,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin || user.createdAt,
          subscription: {
            tier: tier,
            status: user.subscription?.status || 'active',
            expiresAt: user.subscription?.expiresAt || null,
            features: tierInfo?.features || [],
            limits: tierInfo?.limits || {}
          },
          preferences: user.preferences || {},
          usage: user.usage || {
            messagesUsedToday: 0,
            lastResetDate: new Date(),
            transcriptionMinutesUsed: 0,
            activeWorkflows: 0
          }
        }
      };
    } catch (error) {
      const dbError = new DatabaseError('Failed to fetch user', error);
      return handleError(dbError, 'getUserByEmail');
    }
  }

  // Map landing page plan names to app tier names
  mapPlanToTier(planName) {
    if (!planName) return 'free';
    
    const planMap = {
      'Free': 'free',
      'free': 'free',
      'Test Plan': 'free',  // $1 test plan maps to free tier
      'Super Red': 'super-red',
      'super red': 'super-red',
      'Ultimate Red': 'ultra-red',
      'ultimate red': 'ultra-red'
    };

    return planMap[planName] || 'free';
  }

  // Initialize usage tracking for landing page users who don't have it
  async initializeUsageTracking(userId) {
    try {
      if (!this.isConnected) {
        const connectResult = await this.connect();
        if (!connectResult.success) {
          return connectResult;
        }
      }

      const collection = this.db.collection('users');
      await collection.updateOne(
        { _id: userId },
        {
          $set: {
            usage: {
              messagesUsedToday: 0,
              lastResetDate: new Date(),
              transcriptionMinutesUsed: 0,
              activeWorkflows: 0
            }
          }
        }
      );

      console.log('✅ Initialized usage tracking for user:', userId);
      return { success: true };
    } catch (error) {
      console.error('Error initializing usage tracking:', error);
      return { success: false, error: error.message };
    }
  }

  async authenticateUser(email, password) {
    try {
      if (!this.isConnected) {
        const connectResult = await this.connect();
        if (!connectResult.success) {
          return connectResult;
        }
      }

      const collection = this.db.collection('users');
      const user = await collection.findOne({ email: email });

      if (!user) {
        return { success: false, error: 'Invalid email or password' };
      }

      // Compare password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      
      if (!isPasswordValid) {
        return { success: false, error: 'Invalid email or password' };
      }

      // Update last login
      await collection.updateOne(
        { _id: user._id },
        { $set: { lastLogin: new Date() } }
      );

      // COMPATIBILITY: Support both landing page and app user formats
      const fullName = user.fullName || user.name || '';
      const landingPageTier = this.mapPlanToTier(user.plan);
      const tier = user.subscription?.tier || landingPageTier || 'free';

      // Initialize usage tracking for landing page users
      if (!user.usage || !user.usage.lastResetDate) {
        await this.initializeUsageTracking(user._id);
        user.usage = {
          messagesUsedToday: 0,
          lastResetDate: new Date(),
          transcriptionMinutesUsed: 0,
          activeWorkflows: 0
        };
      }

      // Reset daily usage if needed
      const today = new Date().toISOString().split('T')[0];
      const lastResetDate = user.usage?.lastResetDate 
        ? new Date(user.usage.lastResetDate).toISOString().split('T')[0] 
        : null;

      if (lastResetDate !== today) {
        await this.resetDailyUsage(user._id);
        user.usage = user.usage || {};
        user.usage.messagesUsedToday = 0;
        user.usage.lastResetDate = new Date();
      }

      const tierInfo = this.SUBSCRIPTION_TIERS[tier];

      console.log(`✅ User authenticated: ${email} (Tier: ${tier})`);

      return {
        success: true,
        user: {
          _id: user._id,
          fullName: fullName,
          email: user.email,
          createdAt: user.createdAt,
          lastLogin: new Date(),
          subscription: {
            tier: tier,
            status: user.subscription?.status || 'active',
            expiresAt: user.subscription?.expiresAt || null,
            features: tierInfo?.features || [],
            limits: tierInfo?.limits || {}
          },
          preferences: user.preferences || {},
          usage: user.usage || {
            messagesUsedToday: 0,
            lastResetDate: new Date(),
            transcriptionMinutesUsed: 0,
            activeWorkflows: 0
          }
        }
      };
    } catch (error) {
      const dbError = new DatabaseError('Authentication failed', error);
      return handleError(dbError, 'authenticateUser');
    }
  }

  async registerUser(userData) {
    try {
      if (!this.isConnected) {
        const connectResult = await this.connect();
        if (!connectResult.success) {
          return connectResult;
        }
      }

      const collection = this.db.collection('users');
      
      // Check if user already exists
      const existingUser = await collection.findOne({ email: userData.email });
      if (existingUser) {
        return { success: false, error: 'User with this email already exists' };
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      const newUser = {
        email: userData.email,
        password: hashedPassword,
        fullName: userData.fullName || '',
        createdAt: new Date(),
        lastLogin: new Date(),
        subscription: {
          tier: 'free',
          status: 'active',
          expiresAt: null
        },
        preferences: {},
        usage: {
          messagesUsedToday: 0,
          lastResetDate: new Date(),
          transcriptionMinutesUsed: 0,
          activeWorkflows: 0
        }
      };

      const result = await collection.insertOne(newUser);
      
      const tierInfo = this.SUBSCRIPTION_TIERS.free;

      return {
        success: true,
        user: {
          _id: result.insertedId,
          fullName: newUser.fullName,
          email: newUser.email,
          createdAt: newUser.createdAt,
          lastLogin: newUser.lastLogin,
          subscription: {
            tier: 'free',
            status: 'active',
            expiresAt: null,
            features: tierInfo.features,
            limits: tierInfo.limits
          },
          preferences: newUser.preferences,
          usage: newUser.usage
        }
      };
    } catch (error) {
      const dbError = new DatabaseError('User registration failed', error);
      return handleError(dbError, 'registerUser');
    }
  }

  async updateSubscriptionTier(userId, tierData) {
    try {
      if (!this.isConnected) {
        const connectResult = await this.connect();
        if (!connectResult.success) {
          return connectResult;
        }
      }

      const { tier, expiresAt } = tierData;

      if (!this.SUBSCRIPTION_TIERS[tier]) {
        return { success: false, error: 'Invalid subscription tier' };
      }

      const collection = this.db.collection('users');
      const result = await collection.updateOne(
        { _id: userId },
        {
          $set: {
            'subscription.tier': tier,
            'subscription.status': 'active',
            'subscription.expiresAt': expiresAt || null,
            updatedAt: new Date()
          }
        }
      );

      if (result.matchedCount === 0) {
        return { success: false, error: 'User not found' };
      }

      const tierInfo = this.SUBSCRIPTION_TIERS[tier];

      return {
        success: true,
        subscription: {
          tier: tier,
          status: 'active',
          expiresAt: expiresAt || null,
          features: tierInfo.features,
          limits: tierInfo.limits
        }
      };
    } catch (error) {
      console.error('Error updating subscription tier:', error);
      return { success: false, error: error.message };
    }
  }

  async resetDailyUsage(userId) {
    try {
      if (!this.isConnected) {
        const connectResult = await this.connect();
        if (!connectResult.success) {
          return connectResult;
        }
      }

      const collection = this.db.collection('users');
      await collection.updateOne(
        { _id: userId },
        {
          $set: {
            'usage.messagesUsedToday': 0,
            'usage.lastResetDate': new Date()
          }
        }
      );

      return { success: true };
    } catch (error) {
      console.error('Error resetting daily usage:', error);
      return { success: false, error: error.message };
    }
  }

  async incrementMessageUsage(userId) {
    try {
      if (!this.isConnected) {
        const connectResult = await this.connect();
        if (!connectResult.success) {
          return connectResult;
        }
      }

      const collection = this.db.collection('users');
      await collection.updateOne(
        { _id: userId },
        { $inc: { 'usage.messagesUsedToday': 1 } }
      );

      return { success: true };
    } catch (error) {
      console.error('Error incrementing message usage:', error);
      return { success: false, error: error.message };
    }
  }

  async updateTranscriptionUsage(userId, minutesUsed) {
    try {
      if (!this.isConnected) {
        const connectResult = await this.connect();
        if (!connectResult.success) {
          return connectResult;
        }
      }

      const collection = this.db.collection('users');
      await collection.updateOne(
        { _id: userId },
        { $inc: { 'usage.transcriptionMinutesUsed': minutesUsed } }
      );

      return { success: true };
    } catch (error) {
      console.error('Error updating transcription usage:', error);
      return { success: false, error: error.message };
    }
  }

  async updateWorkflowCount(userId, count) {
    try {
      if (!this.isConnected) {
        const connectResult = await this.connect();
        if (!connectResult.success) {
          return connectResult;
        }
      }

      const collection = this.db.collection('users');
      await collection.updateOne(
        { _id: userId },
        { $set: { 'usage.activeWorkflows': count } }
      );

      return { success: true };
    } catch (error) {
      console.error('Error updating workflow count:', error);
      return { success: false, error: error.message };
    }
  }

  getTierInfo(tier) {
    return this.SUBSCRIPTION_TIERS[tier] || this.SUBSCRIPTION_TIERS.free;
  }

  async updateUser(userId, updateData) {
    try {
      if (!this.isConnected) {
        const connectResult = await this.connect();
        if (!connectResult.success) {
          return connectResult;
        }
      }

      const collection = this.db.collection('users');
      const result = await collection.updateOne(
        { _id: userId },
        { 
          $set: {
            ...updateData,
            updatedAt: new Date()
          }
        }
      );

      if (result.matchedCount === 0) {
        return { success: false, error: 'User not found' };
      }

      return { success: true, message: 'User updated successfully' };
    } catch (error) {
      console.error('Error updating user:', error);
      return { success: false, error: error.message };
    }
  }

  async createUser(userData) {
    try {
      if (!this.isConnected) {
        const connectResult = await this.connect();
        if (!connectResult.success) {
          return connectResult;
        }
      }

      const collection = this.db.collection('users');
      const newUser = {
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLogin: new Date(),
        subscription: {
          tier: 'free',
          status: 'active',
          expiresAt: null
        },
        preferences: {},
        usage: {
          totalMessages: 0,
          totalTranscriptions: 0,
          storageUsed: 0
        }
      };

      const result = await collection.insertOne(newUser);
      
      return { 
        success: true, 
        user: {
          _id: result.insertedId,
          ...newUser
        }
      };
    } catch (error) {
      console.error('Error creating user:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteUser(userId) {
    try {
      if (!this.isConnected) {
        const connectResult = await this.connect();
        if (!connectResult.success) {
          return connectResult;
        }
      }

      const collection = this.db.collection('users');
      const result = await collection.deleteOne({ _id: userId });

      if (result.deletedCount === 0) {
        return { success: false, error: 'User not found' };
      }

      return { success: true, message: 'User deleted successfully' };
    } catch (error) {
      console.error('Error deleting user:', error);
      return { success: false, error: error.message };
    }
  }

  async testConnection() {
    try {
      const connectResult = await this.connect();
      if (!connectResult.success) {
        return connectResult;
      }

      await this.db.admin().ping();
      return { success: true, message: 'MongoDB connection test successful' };
    } catch (error) {
      console.error('MongoDB connection test failed:', error);
      return { success: false, error: error.message };
    }
  }

  // ================================
  // TRANSCRIPTION MANAGEMENT
  // ================================

  async saveTranscription(userId, transcriptionData) {
    const db = await this.connectToDB();
    const transcription = {
      userId: new ObjectId(userId),
      title: transcriptionData.title,
      context: transcriptionData.context || '',
      text: transcriptionData.text,
      segments: transcriptionData.segments || [],
      duration: transcriptionData.duration || 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      workflow: transcriptionData.workflow || null, // AI-generated workflow with steps
      workflowCompleted: transcriptionData.workflowCompleted || false
    };
    
    const result = await db.collection('transcriptions').insertOne(transcription);
    return { ...transcription, _id: result.insertedId };
  }

  async getTranscriptions(userId, limit = 50) {
    const db = await this.connectToDB();
    return await db.collection('transcriptions')
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  async getTranscriptionById(transcriptionId) {
    const db = await this.connectToDB();
    return await db.collection('transcriptions')
      .findOne({ _id: new ObjectId(transcriptionId) });
  }

  async updateTranscriptionWorkflow(transcriptionId, workflow) {
    const db = await this.connectToDB();
    return await db.collection('transcriptions').updateOne(
      { _id: new ObjectId(transcriptionId) },
      { 
        $set: { 
          workflow,
          updatedAt: new Date()
        }
      }
    );
  }

  async deleteTranscription(transcriptionId, userId) {
    const db = await this.connectToDB();
    return await db.collection('transcriptions').deleteOne({
      _id: new ObjectId(transcriptionId),
      userId: new ObjectId(userId)
    });
  }
}

// Create singleton instance
const mongoDBService = new MongoDBService();

module.exports = mongoDBService;
