// Main entry point for Electron renderer process
// This file is bundled by webpack for optimization

// Import core styles if any
// import './styles/main.css';

// Polyfills for older browsers (if needed)
if (!window.Promise) {
  window.Promise = require('promise-polyfill').default;
}

// Initialize renderer process
console.log('Renderer process initialized via webpack');

// Export any global utilities if needed
window.appVersion = '1.0.0';

// Application is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded and parsed');
});

