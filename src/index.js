// Main entry point for Electron renderer process
// This file is bundled by webpack for optimisation

// Initialize renderer process
console.log('Renderer process initialized via webpack');

// Export any global utilities if needed
window.appVersion = '1.0.0';

// Application is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded and parsed');
});

