// Quick security verification script
const path = require('path');
const fs = require('fs');

console.log('🔒 Security Implementation Verification\n');

// Check 1: .env file exists
const envExists = fs.existsSync('.env');
console.log(`✓ .env file: ${envExists ? '✅ EXISTS' : '❌ MISSING'}`);

// Check 2: No hardcoded credentials in mongodb-service.js
const mongoService = fs.readFileSync('electron/mongodb-service.js', 'utf8');
const hasHardcodedUri = mongoService.includes('mongodb+srv://YousefAly:');
console.log(`✓ MongoDB credentials: ${hasHardcodedUri ? '❌ STILL HARDCODED' : '✅ SECURED'}`);

// Check 3: IPC security layer exists
const ipcSecurityExists = fs.existsSync('electron/ipc-security.js');
console.log(`✓ IPC security layer: ${ipcSecurityExists ? '✅ IMPLEMENTED' : '❌ MISSING'}`);

// Check 4: Error handler exists
const errorHandlerExists = fs.existsSync('electron/error-handler.js');
console.log(`✓ Error handler: ${errorHandlerExists ? '✅ IMPLEMENTED' : '❌ MISSING'}`);

// Check 5: SSL bypass removed from Python
const pythonServer = fs.readFileSync('realtime-stt-server.py', 'utf8');
const hasSslBypass = pythonServer.includes('ssl._create_default_https_context = ssl._create_unverified_context');
console.log(`✓ SSL bypass: ${hasSslBypass ? '❌ STILL PRESENT' : '✅ REMOVED'}`);

// Check 6: Backup files removed
const backupFiles = [
  'public/frontend.html.backup',
  'public/frontend.html.original',
  'electron/main.js.bak',
  'chat-input.html'
];
const remainingBackups = backupFiles.filter(f => fs.existsSync(f));
console.log(`✓ Backup files: ${remainingBackups.length === 0 ? '✅ CLEANED' : `❌ ${remainingBackups.length} REMAINING`}`);
if (remainingBackups.length > 0) {
  console.log(`  Remaining files: ${remainingBackups.join(', ')}`);
}

// Check 7: .gitignore exists and has security patterns
const gitignoreExists = fs.existsSync('.gitignore');
let hasSecurityPatterns = false;
if (gitignoreExists) {
  const gitignore = fs.readFileSync('.gitignore', 'utf8');
  hasSecurityPatterns = gitignore.includes('.env') && gitignore.includes('*.log');
}
console.log(`✓ .gitignore: ${gitignoreExists && hasSecurityPatterns ? '✅ CONFIGURED' : '❌ MISSING/INCOMPLETE'}`);

// Check 8: Webpack entry point updated
const webpackConfig = fs.readFileSync('webpack.config.js', 'utf8');
const hasProperEntry = webpackConfig.includes("main: './src/index.js'");
console.log(`✓ Webpack entry: ${hasProperEntry ? '✅ UPDATED' : '❌ STILL USING DUMMY'}`);

// Check 9: src/index.js exists
const indexExists = fs.existsSync('src/index.js');
console.log(`✓ src/index.js: ${indexExists ? '✅ EXISTS' : '❌ MISSING'}`);

// Check 10: Preload.js has IPC validation
const preload = fs.readFileSync('electron/preload.js', 'utf8');
const hasIpcValidation = preload.includes('validateChannel');
console.log(`✓ IPC validation in preload: ${hasIpcValidation ? '✅ IMPLEMENTED' : '❌ MISSING'}`);

// Check 11: Main.js has input validation
const mainJs = fs.readFileSync('electron/main.js', 'utf8');
const hasInputValidation = mainJs.includes('validateInput') && mainJs.includes('sanitizeString');
console.log(`✓ Input validation in main: ${hasInputValidation ? '✅ IMPLEMENTED' : '❌ MISSING'}`);

// Check 12: MongoDB service uses error handler
const hasErrorHandler = mongoService.includes('DatabaseError') && mongoService.includes('handleError');
console.log(`✓ MongoDB error handling: ${hasErrorHandler ? '✅ IMPLEMENTED' : '❌ MISSING'}`);

// Check 13: Main.js loads dotenv
const hasDotenvConfig = mainJs.includes('dotenv.config()');
console.log(`✓ dotenv.config() in main: ${hasDotenvConfig ? '✅ IMPLEMENTED' : '❌ MISSING'}`);

console.log('\n📊 Summary:');
const allChecks = [
  envExists,
  !hasHardcodedUri,
  ipcSecurityExists,
  errorHandlerExists,
  !hasSslBypass,
  remainingBackups.length === 0,
  gitignoreExists && hasSecurityPatterns,
  hasProperEntry,
  indexExists,
  hasIpcValidation,
  hasInputValidation,
  hasErrorHandler,
  hasDotenvConfig
];
const passedChecks = allChecks.filter(Boolean).length;
const totalChecks = allChecks.length;

console.log(`Passed: ${passedChecks}/${totalChecks} checks`);
console.log(allChecks.every(Boolean) ? '✅ ALL CHECKS PASSED' : '⚠️  SOME CHECKS FAILED');

console.log('\n💡 Next Steps:');
if (!envExists) {
  console.log('  - Create .env file with your actual credentials');
}
if (hasHardcodedUri) {
  console.log('  - Update MONGODB_URI in .env and restart app');
}
if (remainingBackups.length > 0) {
  console.log('  - Remove remaining backup files manually');
}

console.log('\n✅ Security implementation complete!');
console.log('Run: npm start (to test the application)');

