/**
 * Health Vibe AI - Image Converter (PNG/JPG -> WebP)
 * Uses native Chromium engine to compress PNG/JPEG assets into high-performance WebP.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

function getChromiumExecutable() {
  const candidates = [
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.CHROME_BIN,
    process.env.PUPPETEER_EXECUTABLE_PATH
  ].filter(Boolean);

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('No Chromium-compatible browser found.');
}

async function convertImageToWebp(browser, inputPath, outputPath, quality = 0.85) {
  const page = await browser.newPage();
  const fileBuffer = fs.readFileSync(inputPath);
  const ext = path.extname(inputPath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  const base64Data = fileBuffer.toString('base64');
  const dataUri = `data:${mime};base64,${base64Data}`;

  const webpDataUri = await page.evaluate(async (uri, q) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/webp', q));
      };
      img.onerror = () => reject(new Error('Failed to load image into canvas'));
      img.src = uri;
    });
  }, dataUri, quality);

  await page.close();

  const base64Content = webpDataUri.replace(/^data:image\/webp;base64,/, '');
  fs.writeFileSync(outputPath, Buffer.from(base64Content, 'base64'));

  const origSize = fs.statSync(inputPath).size;
  const newSize = fs.statSync(outputPath).size;
  const reduction = Math.round((1 - newSize / origSize) * 100);
  console.log(`  ✓ ${path.basename(inputPath)} (${(origSize/1024).toFixed(1)} KB) → ${path.basename(outputPath)} (${(newSize/1024).toFixed(1)} KB) [Saved ${reduction}%]`);
}

async function main() {
  console.log('==================================================================');
  console.log('🖼️  HEALTH VIBE AI: WEBP IMAGE CONVERTER & OPTIMIZER');
  console.log('==================================================================\n');

  const chromePath = getChromiumExecutable();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const appDir = path.resolve(__dirname, '../app');
  const images = [
    'logo-dark.png',
    'logo-dark-mark.png',
    'logo-light.png',
    'logo-light-mark.png',
    'logo.jpg',
    'logo-dark.jpg',
    'logo-light.jpg'
  ];

  for (const imgName of images) {
    const inputPath = path.join(appDir, imgName);
    if (fs.existsSync(inputPath)) {
      const outputName = imgName.replace(/\.(png|jpg|jpeg)$/i, '.webp');
      const outputPath = path.join(appDir, outputName);
      await convertImageToWebp(browser, inputPath, outputPath, 0.85);
    }
  }

  await browser.close();
  console.log('\n==================================================================');
  console.log('🎉 ALL IMAGES CONVERTED TO WEBP SUCCESSFULLY');
  console.log('==================================================================\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
