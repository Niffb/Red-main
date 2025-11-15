async function loadSubscriptionSettingsComponent() {
  try {
    console.log('📦 Loading subscription settings component...');
    
    const subscriptionPanel = document.getElementById('subscription-panel');
    
    if (!subscriptionPanel) {
      console.warn('⚠️ Subscription panel not found in DOM');
      return;
    }

    const response = await fetch('subscription-settings.html');
    const html = await response.text();
    
    subscriptionPanel.innerHTML = html;

    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = 'subscription-settings.css';
    document.head.appendChild(cssLink);

    const script = document.createElement('script');
    script.src = 'subscription-settings.js';
    document.head.appendChild(script);
    
    console.log('✅ Subscription settings component loaded');
  } catch (error) {
    console.error('❌ Error loading subscription settings:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(loadSubscriptionSettingsComponent, 500);
  });
} else {
  setTimeout(loadSubscriptionSettingsComponent, 500);
}






