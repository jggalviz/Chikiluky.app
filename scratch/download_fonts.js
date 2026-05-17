import fs from 'fs';
import path from 'path';
import https from 'https';

const FONTS_DIR = path.resolve('public/fonts');
if (!fs.existsSync(FONTS_DIR)) {
  fs.mkdirSync(FONTS_DIR, { recursive: true });
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
    }).on('error', reject);
  });
}

async function processStylesheet(cssUrl, outputCssFilename) {
  console.log(`fetching stylesheet: ${cssUrl}`);
  let cssContent = await fetchUrl(cssUrl);

  // Regex to find all url(...) in the CSS
  const urlRegex = /url\((https:\/\/[^)]+)\)/g;
  let match;
  const urlsToDownload = [];

  while ((match = urlRegex.exec(cssContent)) !== null) {
    urlsToDownload.push(match[1]);
  }

  // Deduplicate URLs
  const uniqueUrls = [...new Set(urlsToDownload)];
  console.log(`Found ${uniqueUrls.length} unique font files to download.`);

  for (let i = 0; i < uniqueUrls.length; i++) {
    const remoteUrl = uniqueUrls[i];
    // extract a clean name from the url
    const parsedUrl = new URL(remoteUrl);
    const basename = path.basename(parsedUrl.pathname);
    const localFilename = `${i}_${basename}`;
    const localPath = path.join(FONTS_DIR, localFilename);

    console.log(`Downloading (${i + 1}/${uniqueUrls.length}): ${basename}`);
    await downloadFile(remoteUrl, localPath);

    // Replace the remote URL in the stylesheet with the local path
    // Under Astro, absolute public paths start with /fonts/
    cssContent = cssContent.replaceAll(remoteUrl, `/fonts/${localFilename}`);
  }

  const outputCssPath = path.resolve(`src/styles/${outputCssFilename}`);
  fs.mkdirSync(path.dirname(outputCssPath), { recursive: true });
  fs.writeFileSync(outputCssPath, cssContent, 'utf-8');
  console.log(`Saved local stylesheet to: ${outputCssPath}`);
}

async function main() {
  try {
    // 1. Process Google fonts
    const googleFontsUrl = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;600;700&display=swap';
    await processStylesheet(googleFontsUrl, 'google-fonts.css');

    // 2. Process Material Symbols
    const materialSymbolsUrl = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap';
    await processStylesheet(materialSymbolsUrl, 'material-symbols.css');

    console.log('🎉 Font download and self-hosting preparation completed successfully!');
  } catch (error) {
    console.error('Error downloading fonts:', error);
  }
}

main();
