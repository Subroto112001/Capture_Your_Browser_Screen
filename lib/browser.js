import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

function localBrowserCandidates() {
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    return roots.flatMap(root => [
      path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ]);
  }
  if (process.platform === 'darwin') return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  if (process.platform === 'linux') return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']
    .flatMap(name => ['/usr/bin', '/usr/local/bin', '/snap/bin'].map(dir => path.join(dir, name)));
  return [];
}

function isServerless() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV);
}

export async function launchBrowser(deviceViewport) {
  // Vercel's local emulator may set VERCEL on Windows/macOS. Those hosts must
  // still use their installed desktop browser and local launch flags.
  const serverless = isServerless() && process.platform === 'linux';
  let executablePath;
  let source;

  if (process.env.CHROME_PATH) {
    executablePath = process.env.CHROME_PATH;
    if (!fs.existsSync(executablePath)) throw new Error(`CHROME_PATH is set but the browser executable does not exist: ${executablePath}`);
    source = 'CHROME_PATH';
  } else if (serverless) {
    executablePath = await chromium.executablePath();
    source = '@sparticuz/chromium';
  } else {
    executablePath = localBrowserCandidates().find(candidate => fs.existsSync(candidate));
    source = 'local browser';
    if (!executablePath && process.platform === 'linux') {
      try {
        executablePath = await chromium.executablePath();
        source = '@sparticuz/chromium';
      } catch (error) {
        console.warn('[browser] packaged Chromium unavailable:', error.message);
      }
    }
  }

  if (!executablePath) throw new Error('Chrome, Edge, or Chromium was not found. Install Google Chrome, or set CHROME_PATH to its executable (for example: C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe).');
  console.info(`[browser] using ${source} at ${executablePath}`);
  return puppeteer.launch({
    args: serverless
      ? [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      : ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--hide-scrollbars'],
    defaultViewport: deviceViewport,
    executablePath,
    headless: serverless ? chromium.headless : true,
  });
}
