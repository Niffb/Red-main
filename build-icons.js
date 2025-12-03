const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Create icon from SVG
async function createIcons() {
  // Try multiple possible SVG files
  const possibleSvgFiles = [
    'RED ICON.svg',
    'screenshot-icon.svg',
    'screenshot-tile-noroot-svgrepo-com.svg',
    'public/screenshot-icon.svg',
    'voice-svgrepo-com.svg',
    'attach-svgrepo-com.svg'
  ];
  
  let svgPath = null;
  for (const file of possibleSvgFiles) {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      svgPath = fullPath;
      console.log(`Using SVG file: ${file}`);
      break;
    }
  }
  
  if (!svgPath) {
    console.error('No SVG file found. Checked:', possibleSvgFiles);
    return;
  }
  
  const publicDir = path.join(__dirname, 'public');
  
  const svgBuffer = fs.readFileSync(svgPath);
  
  // Create different sizes for different platforms
  const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
  
  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(publicDir, `icon-${size}.png`));
  }
  
  // Create main icon.png (512x512 is good for most purposes)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon.png'));
    
  // Create icon.ico for Windows
  await sharp(svgBuffer)
    .resize(256, 256)
    .png()
    .toFile(path.join(publicDir, 'icon.ico'));
  
  console.log('Icons created successfully!');
}

createIcons().catch(console.error); 