import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer-core';

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

async function loadChromium(serverless) {
  if (serverless) {
    // @sparticuz/chromium detects Lambda's AL2023 runtime while the module is
    // evaluated and adds its library directory to LD_LIBRARY_PATH then.
    const major = process.versions.node.split('.')[0];
    process.env.AWS_LAMBDA_JS_RUNTIME ||= `nodejs${major}.x`;
    if (!process.env.AWS_EXECUTION_ENV?.includes('AWS_Lambda_nodejs')) process.env.AWS_EXECUTION_ENV = `AWS_Lambda_nodejs${major}.x`;
  }
  const { default: chromium } = await import('@sparticuz/chromium');
  return chromium;
}

async function verifyServerlessLibraries(chromium) {
  const libDir = path.join(os.tmpdir(), 'al2023', 'lib');
  const nssPath = path.join(libDir, 'libnss3.so');
  if (fs.existsSync(nssPath) && (process.env.LD_LIBRARY_PATH || '').split(':').includes(libDir)) return;

  // Recover if the package's import-time runtime detection did not extract or
  // register the AL2023 libraries for an unusual Vercel runtime environment.
  const normalizedArchive = path.resolve(process.cwd(), 'node_modules', '@sparticuz', 'chromium', 'bin', 'al2023.tar.br');
  if (fs.existsSync(normalizedArchive)) {
    await chromium.inflate(normalizedArchive);
    const current = (process.env.LD_LIBRARY_PATH || '').split(':').filter(Boolean);
    if (!current.includes(libDir)) process.env.LD_LIBRARY_PATH = [libDir, ...current].join(':');
  }
  if (!fs.existsSync(nssPath)) throw new Error(`Bundled Chromium libraries are missing: ${nssPath}`);
}

function logServerlessDiagnostics(error) {
  const dirs = ['/tmp/al2/lib', '/tmp/al2023/lib', '/tmp/aws/lib'];
  const libraries = Object.fromEntries(dirs.map(dir => {
    let files = [];
    try { files = fs.readdirSync(dir).slice(0, 20); } catch {}
    return [dir, { exists: fs.existsSync(dir), files }];
  }));
  console.error('[browser] serverless Chromium launch failed', {
    error: error.message,
    node: process.version,
    arch: process.arch,
    env: Object.fromEntries(['VERCEL', 'AWS_LAMBDA_JS_RUNTIME', 'AWS_EXECUTION_ENV', 'AWS_LAMBDA_FUNCTION_NAME', 'LD_LIBRARY_PATH'].map(key => [key, process.env[key] || null])),
    chromiumExists: fs.existsSync('/tmp/chromium'),
    libraries,
  });
}

export async function launchBrowser(deviceViewport) {
  // Vercel's local emulator may set VERCEL on Windows/macOS. Those hosts must
  // still use their installed desktop browser and local launch flags.
  const serverless = isServerless() && process.platform === 'linux';
  let executablePath;
  let source;
  let chromium;

  if (serverless) {
    chromium = await loadChromium(true);
    executablePath = await chromium.executablePath();
    await verifyServerlessLibraries(chromium);
    source = '@sparticuz/chromium';
  } else if (process.platform !== 'linux' && process.env.CHROME_PATH) {
    executablePath = process.env.CHROME_PATH;
    if (!fs.existsSync(executablePath)) throw new Error(`CHROME_PATH is set but the browser executable does not exist: ${executablePath}`);
    source = 'CHROME_PATH';
  } else {
    executablePath = localBrowserCandidates().find(candidate => fs.existsSync(candidate));
    source = 'local browser';
    if (!executablePath && process.env.CHROME_PATH) {
      executablePath = process.env.CHROME_PATH;
      if (!fs.existsSync(executablePath)) throw new Error(`CHROME_PATH is set but the browser executable does not exist: ${executablePath}`);
      source = 'CHROME_PATH';
    }
    if (!executablePath && process.platform === 'linux') {
      try {
        chromium = await loadChromium(false);
        executablePath = await chromium.executablePath();
        source = '@sparticuz/chromium';
      } catch (error) {
        console.warn('[browser] packaged Chromium unavailable:', error.message);
      }
    }
  }

  if (!executablePath) throw new Error('Chrome, Edge, or Chromium was not found. Install Google Chrome, or set CHROME_PATH to its executable (for example: C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe).');
  console.info(`[browser] using ${source} at ${executablePath}`);
  const options = {
    args: serverless
      ? [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      : ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--hide-scrollbars'],
    defaultViewport: deviceViewport,
    executablePath,
    headless: serverless ? 'shell' : true,
  };
  try {
    return await puppeteer.launch(options);
  } catch (error) {
    if (serverless) logServerlessDiagnostics(error);
    throw error;
  }
}
