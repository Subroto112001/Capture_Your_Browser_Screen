# Website Screenshot Tool

Designed and developed by **Subroto Kumar Barman**, Full Stack Developer. Visit [skbarman.com](https://skbarman.com).

A fast, lightweight, and production-ready on-demand website screenshot service designed to run on the **Vercel Serverless Free Hobby Plan**.

- **Zero Database & Zero Storage**: Generates screenshots in-memory and immediately streams the raw image binary back to the client. Nothing is saved to disk or third-party buckets.
- **Strict SSRF Defense**: Comprehensive pre-flight and runtime request-interception checks blocking loopback, link-local (AWS/GCP metadata `169.254.169.254`), private RFC1918 subnets, non-standard IP notations (hex/octal/dword), internal DNS names, and unsupported schemes.
- **Multiple Device Viewports**: Desktop (1920×1080), Laptop (1440×900), Tablet (768×1024), and Mobile (390×844) with appropriate device pixel ratios and mobile user agents.
- **Full-Page Capture**: Automated scrolling reveals lazy-loaded images, with captures capped at 16,000px.
- **Adaptive Image Output**: Serverless images use a compression and scaling fallback under 4.4 MB; local captures support up to 30 MB.

---

## 1. Project Structure

```text
├── api/screenshot.js      # Vercel HTTP handler
├── lib/                   # Browser, secure URL checks, capture pipeline, and rate limiting
├── src/                   # React UI, tiled preview, lightbox, and screenshot state hook
├── index.html             # Vite entry and author metadata
├── vercel.json            # Function duration, bundled browser, and CSP headers
└── package.json           # App scripts and dependencies
```

---

## 2. Local Setup & Development

### Prerequisites
- Node.js 24.x (the configured Vercel runtime)
- Google Chrome or Chromium installed on your local machine (macOS/Windows)

### Installation
Clone the repository and install dependencies:

```bash
git clone https://github.com/your-username/website-screenshot-tool.git
cd website-screenshot-tool
npm install
```

### Setting `CHROME_PATH`
In local development, `@sparticuz/chromium` is built for AWS Lambda Linux. On macOS or Windows, point the `CHROME_PATH` environment variable to your local browser executable:

- **macOS**:
  ```bash
  export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ```
- **Windows (Command Prompt)**:
  ```cmd
  set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
  ```
- **Windows (PowerShell)**:
  ```powershell
  $env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
  ```
- **Linux (Ubuntu/Debian)**:
  ```bash
  export CHROME_PATH="/usr/bin/google-chrome"
  # or
  export CHROME_PATH="/usr/bin/chromium-browser"
  ```

*(Note: In Linux environments like Docker or cloud containers, `@sparticuz/chromium` extracts its packaged binary automatically if `CHROME_PATH` is omitted).*

### Running Locally with Vercel CLI
To simulate the exact Vercel Serverless environment locally:

```bash
npx vercel dev
```
Open your browser at `http://localhost:3000`.

Alternatively, run Vite dev mode:
```bash
npm run dev
```

---

### Cross-platform local development

The screenshot service uses installed Chrome/Edge/Chromium on Windows and macOS. On Linux, it uses an installed browser when available and falls back to bundled `@sparticuz/chromium`. You can copy `.env.example` to `.env`; leave `CHROME_PATH` blank for automatic detection, or set it to the browser executable. For example, in PowerShell:

```powershell
Copy-Item .env.example .env
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm install
npm run dev
```

On macOS/Linux, run `cp .env.example .env`, then `npm install` and `npm run dev`. To override detection, set `CHROME_PATH` to the Chrome/Edge/Chromium executable path for that platform. The Vite development server serves `POST /api/screenshot` through the same handler as Vercel. `npx vercel dev` is also supported.

## 3. Deploying to Vercel (Free Hobby Plan)

Vercel selects the bundled Linux Chromium automatically. The project pins compatible Chromium/Puppeteer versions and uses Node.js 24.x. Do not set `CHROME_PATH` or `ALLOW_LOCAL_URLS` in Vercel project environment variables. The screenshot function has a 120-second maximum duration and a 115-second hard watchdog. Its processing-time default is 100 seconds on serverless and 90 seconds locally; `SCREENSHOT_MAX_SECONDS` can change that cap, still clamped to 105 seconds (15 seconds below the function limit). Browser launch/cold start is measured separately and does not consume the page-processing budget.

For slow targets, choose **Capture time limit** under Advanced options; the server clamps the requested 60/90/120 seconds to `SCREENSHOT_MAX_SECONDS` and the function safety margin. The default **Block common analytics trackers** setting skips known analytics endpoints while allowing site scripts, consent UI, fonts, images, video, and content CDNs. A 504 watchdog response is sent before the platform limit. Full-page requests can take close to two minutes; Cancel aborts the browser request from the client.

Vercel deployments can be benchmarked against local results using `node scripts/benchmark.mjs https://www.example.com`. Set **Project Settings → Functions → Function Region** near the team or the sites you capture most often. Hobby has a single function region, so choose the closest practical location; no region is hard-coded in `vercel.json`.

If Vercel's runtime detection needs an override, set `AWS_LAMBDA_JS_RUNTIME=nodejs24.x` in the project's environment variables. Leave `AWS_EXECUTION_ENV` unset so the function can provide its matching Lambda runtime marker automatically.

### Option A: Via GitHub (Recommended)
1. Push your repository to GitHub.
2. Log in to [Vercel](https://vercel.com/) and click **"Add New..." > "Project"**.
3. Import your GitHub repository.
4. Leave Build & Output settings default (Framework Preset: **Other**).
5. Click **Deploy**. Vercel will bundle the serverless functions in `/api` and serve static assets in `/public` at the root domain.

### Option B: Via Vercel CLI
```bash
npm install -g vercel
vercel login
vercel --prod
```

---

## 4. Capture quality and local fixtures

Desktop captures use a 1920 x 1080 viewport. Auto mode detects Wix and applies slower scrolling, extended popup observation, lazy-image loading, and a 16,000px full-page cap. The response's `X-Screenshot-Notes` header reports popup handling, detected profile, and any truncation. Popup dismissal is heuristic; semantic site headers, navigation, main content, and the page heading are protected. The advanced **Force reveal** option can change page styling and is experimental.

Run the no-network browser fixtures with:

```bash
npm run test:capture
```

Outputs are written to the ignored `test/output/` directory. To run an optional real Wix smoke capture, first set `TEST_WIX_URL` to a public Wix URL; the test validates the URL and every subresource with the same SSRF checks used by the API. On PowerShell:

```powershell
$env:TEST_WIX_URL = 'https://your-public-wix-site.example'
npm run test:capture
```

The Wix smoke run uses the local capture budget. Remove the environment variable after the test if you do not want later test runs to contact that site.

## 5. Rate Limiting in Serverless Environments

The app includes an in-memory sliding-window limiter in `/lib/rateLimit.js` configured for **10 requests per 10 minutes** per client IP.

### Serverless Reality & Limitation
In serverless functions, each container instance runs in an isolated runtime environment with its own memory heap. When multiple concurrent requests cause Vercel to spin up new instances, each instance maintains its own in-memory table. Therefore, in-memory rate limiting is **best-effort per instance**.

### Recommended: Configuring Vercel WAF Rate Limiting
To enforce a global, edge-level rate limit across all serverless instances:
1. Open your project in the **Vercel Dashboard**.
2. Navigate to **Security** > **Firewall** (or **WAF**).
3. Click **Add Rule** under **Rate Limiting**.
4. Configure the rule:
   - **Path**: Equals `/api/screenshot`
   - **Method**: Equals `POST`
   - **Rate Limit**: `10 requests per 10 minutes` (or your preferred quota)
   - **Action**: `Deny (429 Too Many Requests)`
5. Click **Save and Deploy**. Requests exceeding this threshold will now be denied at Vercel's global edge network before invoking the serverless function.

---

## 6. Known Limitations on Vercel Hobby Plan

1. **Function Duration**: `vercel.json` configures 120 seconds. A 115-second watchdog leaves time for a JSON response; page processing defaults to 100 seconds on serverless, with separate reserves for the final capture, size fallback, and response.
2. **Response Payload Limits**: Serverless captures are kept below 4.4 MB by lowering JPEG quality to 75 then 65 before scaling to 0.75× or 0.5×. Local/other-host captures allow up to 30 MB.
3. **Cold Starts**: Serverless instances shut down when idle. The first request after an idle period may take 2–5 seconds longer while the container initializes and extracts Chromium into `/tmp`.
4. **Bot Detection & CAPTCHAs**: Sites protected by Cloudflare Under Attack mode, Akamai Bot Manager, or mandatory CAPTCHA challenges may render a verification screen rather than the target webpage content.
5. **Vercel Hobby Terms**: Vercel's Hobby tier is designated for personal, non-commercial use.

---

## 7. Troubleshooting

| Issue | Cause | Solution |
|---|---|---|
| **Chromium executable not found** | Running locally without `CHROME_PATH` set on macOS or Windows. | Export `CHROME_PATH` pointing to your local Chrome installation (see Section 2). |
| **Serverless Function execution timed out (504)** | Target website is extremely slow, has video ads, or full-page scrolling took too long. | Disable "Full Page" or choose a shorter render delay (0s or 1s). |
| **Screenshot payload exceeds 4.5 MB (413)** | Massive webpage height (> 5,000px) in lossless PNG format. | Switch format to **JPEG** and uncheck **Full Page**. |
| **Blank or white screenshot** | Page uses client-side rendering (SPA) that takes 1–2 seconds to mount. | Select a **Render Delay** of 2 or 3 seconds in the options panel. |
| **403 Address Blocked** | Destination resolves to an internal, private, or loopback IP address. | The tool blocks internal network requests to protect against SSRF. Enter a public URL. |

---

## 8. Manual Security Test Checklist

Use this checklist to verify that SSRF and input validation mechanisms work properly:

| Test Input URL | Description | Expected HTTP Status & Result |
|---|---|---|
| `http://localhost` | Standard local loopback | **403 Forbidden** (`Access to internal/private hostname 'localhost' is forbidden`) |
| `http://127.0.0.1` | IPv4 loopback literal | **403 Forbidden** (`Access to private/reserved IPv4 address '127.0.0.1' is forbidden`) |
| `http://169.254.169.254` | AWS / GCP cloud metadata service | **403 Forbidden** (`Access to private/reserved IPv4 address '169.254.169.254' is forbidden`) |
| `http://2130706433` | Dword numeric bypass trick for `127.0.0.1` | **403 Forbidden** (`Access to private/reserved IPv4 address '127.0.0.1' is forbidden`) |
| `http://0x7f.1` | Hexadecimal/partial IP bypass trick | **403 Forbidden** (`Access to private/reserved IPv4 address '127.0.0.1' is forbidden`) |
| `file:///etc/passwd` | Non-HTTP scheme local file access | **400 Bad Request** (`Protocol 'file:' is forbidden. Only HTTP and HTTPS are permitted`) |
| `http://user:pass@example.com` | Embedded credentials | **400 Bad Request** (`URLs with embedded credentials (user:pass@host) are forbidden`) |
| `http://example.com:8080` | Non-standard port probing | **400 Bad Request** (`Port '8080' is blocked. Only standard web ports (80 and 443) are allowed`) |
| Redirect to `127.0.0.1` | External URL redirecting to private IP | Request Interception aborts with `accessdenied`, preventing the browser from querying loopback. |
| `https://news.ycombinator.com` | Valid public HTTPS webpage | **200 OK** (Returns binary image stream) |

---

## 9. License

MIT License. Designed and engineered for secure, serverless operation.
