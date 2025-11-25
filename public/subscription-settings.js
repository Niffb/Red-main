let subscriptionState = {
  isLoggedIn: false,
  currentUser: null,
  subscription: null,
  usage: null
};

async function initSubscriptionSettings() {
  console.log('💳 Initialising subscription settings...');
  
  setupEventListeners();
  await checkExistingSession();
  
  console.log('✅ Subscription settings initialised');
}

function setupEventListeners() {
  // Login form
  const loginBtn = document.getElementById('login-btn');
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');

  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
  }

  // Allow Enter key to submit login
  if (loginEmail) {
    loginEmail.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
  }
  if (loginPassword) {
    loginPassword.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
  }

  // Registration form
  const registerBtn = document.getElementById('register-btn');
  if (registerBtn) {
    registerBtn.addEventListener('click', handleRegister);
  }

  // Toggle between login and register
  const showRegisterLink = document.getElementById('show-register-link');
  const showLoginLink = document.getElementById('show-login-link');

  if (showRegisterLink) {
    showRegisterLink.addEventListener('click', (e) => {
      e.preventDefault();
      showRegistrationForm();
    });
  }

  if (showLoginLink) {
    showLoginLink.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginForm();
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Refresh usage button
  const refreshUsageBtn = document.getElementById('refresh-usage-btn');
  if (refreshUsageBtn) {
    refreshUsageBtn.addEventListener('click', refreshUsageStats);
  }
}

function showLoginForm() {
  document.getElementById('login-section').style.display = 'block';
  document.getElementById('register-section').style.display = 'none';
  clearErrors();
}

function showRegistrationForm() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('register-section').style.display = 'block';
  clearErrors();
}

function clearErrors() {
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');
  if (loginError) {
    loginError.style.display = 'none';
    loginError.textContent = '';
  }
  if (registerError) {
    registerError.style.display = 'none';
    registerError.textContent = '';
  }
}

async function checkExistingSession() {
  try {
    const result = await window.electronAPI.subscriptionGet();
    
    if (result.success && result.user) {
      subscriptionState.isLoggedIn = true;
      subscriptionState.currentUser = result.user;
      subscriptionState.subscription = result.subscription;
      
      await loadUsageStats();
      showLoggedInView();
    } else {
      showLoginForm();
    }
  } catch (error) {
    console.error('Error checking session:', error);
    showLoginForm();
  }
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');

  if (!email || !password) {
    showError(errorDiv, 'Please enter both email and password');
    return;
  }

  showNotification('Signing in...', 'info');
  
  try {
    const result = await window.electronAPI.mongodbAuthenticate(email, password);
    
    if (result.success) {
      subscriptionState.isLoggedIn = true;
      subscriptionState.currentUser = result.user;
      subscriptionState.subscription = result.user.subscription;
      
      showNotification('Successfully signed in!', 'success');
      await loadUsageStats();
      showLoggedInView();
    } else {
      showError(errorDiv, result.error || 'Login failed');
      showNotification(result.error || 'Login failed', 'error');
    }
  } catch (error) {
    console.error('Login error:', error);
    showError(errorDiv, 'An error occurred during login');
    showNotification('Login error', 'error');
  }
}

async function handleRegister() {
  const fullName = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-confirm-password').value;
  const errorDiv = document.getElementById('register-error');

  if (!fullName || !email || !password || !confirmPassword) {
    showError(errorDiv, 'Please fill in all fields');
    return;
  }

  if (password !== confirmPassword) {
    showError(errorDiv, 'Passwords do not match');
    return;
  }

  if (password.length < 6) {
    showError(errorDiv, 'Password must be at least 6 characters');
    return;
  }

  showNotification('Creating account...', 'info');
  
  try {
    const result = await window.electronAPI.mongodbRegister({
      fullName,
      email,
      password
    });
    
    if (result.success) {
      subscriptionState.isLoggedIn = true;
      subscriptionState.currentUser = result.user;
      subscriptionState.subscription = result.user.subscription;
      
      showNotification('Account created successfully!', 'success');
      await loadUsageStats();
      showLoggedInView();
    } else {
      showError(errorDiv, result.error || 'Registration failed');
      showNotification(result.error || 'Registration failed', 'error');
    }
  } catch (error) {
    console.error('Registration error:', error);
    showError(errorDiv, 'An error occurred during registration');
    showNotification('Registration error', 'error');
  }
}

async function handleLogout() {
  try {
    await window.electronAPI.mongodbLogout();
    
    subscriptionState.isLoggedIn = false;
    subscriptionState.currentUser = null;
    subscriptionState.subscription = null;
    subscriptionState.usage = null;
    
    showNotification('Logged out successfully', 'success');
    showLoginForm();
    
    // Hide logged in sections
    document.getElementById('subscription-info-section').style.display = 'none';
    document.getElementById('usage-stats-section').style.display = 'none';
    
    // Clear form fields
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
  } catch (error) {
    console.error('Logout error:', error);
    showNotification('Logout error', 'error');
  }
}

function showLoggedInView() {
  // Hide login/register forms
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('register-section').style.display = 'none';
  
  // Show subscription and usage sections
  document.getElementById('subscription-info-section').style.display = 'block';
  document.getElementById('usage-stats-section').style.display = 'block';
  
  // Update subscription display
  updateSubscriptionDisplay();
  updateUsageDisplay();
}

function updateSubscriptionDisplay() {
  if (!subscriptionState.subscription) return;

  const subscription = subscriptionState.subscription;
  const tierText = document.getElementById('subscription-tier-text');
  const tierBadge = document.getElementById('subscription-tier-badge');
  const statusBadge = document.getElementById('subscription-status-badge');
  const userEmailDisplay = document.getElementById('user-email-display');
  const featuresContainer = document.getElementById('subscription-features');
  const limitsContainer = document.getElementById('subscription-limits');

  // Update tier display
  const tierNames = {
    'free': 'Free Tier',
    'super-red': 'Super-Red',
    'ultra-red': 'Ultra-Red'
  };
  
  const tier = subscription.tier || 'free';
  if (tierText) {
    tierText.textContent = tierNames[tier] || 'Free Tier';
  }

  // Update tier badge
  if (tierBadge) {
    tierBadge.className = `subscription-tier-badge tier-${tier}`;
    tierBadge.textContent = tier.toUpperCase().replace('-', ' ');
  }

  // Update status badge
  if (statusBadge) {
    const status = subscription.status || 'active';
    statusBadge.className = `subscription-status-badge status-${status}`;
    statusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  }

  // Update user email
  if (userEmailDisplay && subscriptionState.currentUser) {
    userEmailDisplay.textContent = subscriptionState.currentUser.email;
  }

  // Update features list
  if (featuresContainer && subscription.features) {
    if (subscription.features.length > 0) {
      featuresContainer.innerHTML = subscription.features
        .map(feature => `<li class="feature-item">${feature}</li>`)
        .join('');
    } else {
      featuresContainer.innerHTML = '<li class="feature-item">No features available</li>';
    }
  }

  // Update limits display
  if (limitsContainer && subscription.limits) {
    const limits = subscription.limits;
    if (Object.keys(limits).length > 0) {
      limitsContainer.innerHTML = Object.entries(limits)
        .map(([key, value]) => `
          <div class="limit-item">
            <span class="limit-label">${formatLimitKey(key)}:</span>
            <span class="limit-value">${value}</span>
          </div>
        `)
        .join('');
    } else {
      limitsContainer.innerHTML = '<div class="limit-item">No limits set</div>';
    }
  }
}

async function loadUsageStats() {
  try {
    const result = await window.electronAPI.subscriptionGetUsage();
    
    if (result.success) {
      subscriptionState.usage = result.usage;
    }
  } catch (error) {
    console.error('Error loading usage stats:', error);
  }
}

async function refreshUsageStats() {
  showNotification('Refreshing usage stats...', 'info');
  
  try {
    const result = await window.electronAPI.refreshUserData();
    
    if (result.success) {
      subscriptionState.currentUser = result.user;
      subscriptionState.subscription = result.user.subscription;
      
      await loadUsageStats();
      updateSubscriptionDisplay();
      updateUsageDisplay();
      
      showNotification('Usage stats updated', 'success');
    } else {
      showNotification('Failed to refresh stats', 'error');
    }
  } catch (error) {
    console.error('Error refreshing usage stats:', error);
    showNotification('Error refreshing stats', 'error');
  }
}

function updateUsageDisplay() {
  if (!subscriptionState.usage) return;

  const usage = subscriptionState.usage;
  
  // Messages
  const messagesElem = document.getElementById('usage-messages');
  if (messagesElem) {
    const used = usage.messages.used || 0;
    const limit = usage.messages.limit;
    const limitText = limit === Infinity ? 'unlimited' : limit;
    messagesElem.textContent = `${used} / ${limitText}`;
  }

  // Workflows
  const workflowsElem = document.getElementById('usage-workflows');
  if (workflowsElem) {
    const active = usage.workflows.active || 0;
    const limit = usage.workflows.limit;
    const limitText = limit === Infinity ? 'unlimited' : limit;
    const maxSteps = usage.workflows.maxSteps === Infinity ? 'unlimited' : usage.workflows.maxSteps;
    workflowsElem.textContent = `${active} / ${limitText} (max ${maxSteps} steps)`;
  }

  // Transcription
  const transcriptionElem = document.getElementById('usage-transcription');
  if (transcriptionElem) {
    const used = usage.transcription.used || 0;
    const limit = usage.transcription.limit;
    const usedHours = (used / 60).toFixed(1);
    const limitHours = limit === 'unlimited' ? 'unlimited' : (limit / 60).toFixed(1);
    transcriptionElem.textContent = `${usedHours} / ${limitHours} hrs`;
  }

  // MCP Connections
  const mcpElem = document.getElementById('usage-mcp');
  if (mcpElem) {
    const limit = usage.mcpConnections.limit;
    const limitText = limit === Infinity ? 'unlimited' : `max ${limit}`;
    mcpElem.textContent = limitText;
  }
}

function formatLimitKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

function showError(element, message) {
  if (element) {
    element.textContent = message;
    element.style.display = 'block';
  }
}

function showNotification(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);
  
  if (window.showToast) {
    window.showToast(message, type);
  } else if (window.showNotification) {
    window.showNotification(message, type);
  }
}

// Initialize when document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSubscriptionSettings);
} else {
  setTimeout(initSubscriptionSettings, 100);
}

window.subscriptionSettings = {
  init: initSubscriptionSettings,
  loadUsageStats,
  updateSubscriptionDisplay,
  updateUsageDisplay,
  refreshUsageStats
};


