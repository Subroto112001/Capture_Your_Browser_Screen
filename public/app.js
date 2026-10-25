/**
 * @file app.js
 * Frontend application logic for Website Screenshot Tool.
 * Plain vanilla JavaScript with zero dependencies and no build step.
 */

(() => {
  'use strict';

  // DOM Elements
  const form = document.getElementById('screenshot-form');
  const urlInput = document.getElementById('url-input');
  const clearBtn = document.getElementById('clear-btn');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = submitBtn.querySelector('.btn-text');

  const loadingState = document.getElementById('loading-state');
  const errorCard = document.getElementById('error-card');
  const errorTitle = document.getElementById('error-title');
  const errorMsg = document.getElementById('error-msg');

  const resultSection = document.getElementById('result-section');
  const previewImage = document.getElementById('preview-image');
  const downloadBtn = document.getElementById('download-btn');
  const copyBtn = document.getElementById('copy-btn');
  const copyText = document.getElementById('copy-text');
  const browserAddress = document.getElementById('browser-address');

  const metaUrl = document.getElementById('meta-url');
  const metaSize = document.getElementById('meta-size');
  const metaFormat = document.getElementById('meta-format');
  const captureNotes = document.getElementById('capture-notes');

  // Track active object URL to prevent memory leaks
  let currentObjectUrl = null;
  let activeAbortController = null;

  /**
   * Normalizes input URL by trimming and prepending https:// if protocol is missing.
   * @param {string} raw
   * @returns {string}
   */
  function normalizeUrl(raw) {
    let clean = (raw || '').trim();
    if (!clean) return '';

    if (!/^https?:\/\//i.test(clean)) {
      clean = 'https://' + clean;
    }
    return clean;
  }

  /**
   * Formats byte size into human-readable string (KB or MB).
   * @param {number} bytes
   * @returns {string}
   */
  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /**
   * Extracts clean hostname from URL string for filenames.
   * @param {string} urlString
   * @returns {string}
   */
  function extractHostname(urlString) {
    try {
      const u = new URL(urlString);
      return u.hostname.replace(/[^a-z0-9.-]/gi, '_');
    } catch {
      return 'webpage';
    }
  }

  /**
   * Displays an error message in the aria-live region.
   * @param {string} title
   * @param {string} message
   */
  function showError(title, message) {
    errorTitle.textContent = title || 'Capture Failed';
    errorMsg.textContent = message || 'An unexpected error occurred.';
    errorCard.classList.remove('hidden');
    loadingState.classList.add('hidden');
    submitBtn.disabled = false;
    btnText.textContent = 'Take Screenshot';
  }

  /**
   * Clears any active error state.
   */
  function clearError() {
    errorCard.classList.add('hidden');
  }

  /**
   * Quick URL chips handler
   */
  document.querySelectorAll('.chip-btn').forEach(button => {
    button.addEventListener('click', () => {
      const targetUrl = button.getAttribute('data-url');
      if (targetUrl) {
        urlInput.value = targetUrl;
        urlInput.focus();
        clearError();
      }
    });
  });

  /**
   * Clear input button
   */
  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    urlInput.focus();
    clearError();
  });

  /**
   * Form submission handler
   */
  form.addEventListener('submit', async event => {
    event.preventDefault();
    clearError();

    const rawUrl = urlInput.value;
    const finalUrl = normalizeUrl(rawUrl);

    if (!finalUrl) {
      showError('Input Required', 'Please enter a valid website URL to capture.');
      urlInput.focus();
      return;
    }

    // Reflect prepended https:// back to the input box for visual clarity
    urlInput.value = finalUrl;

    // Gather user options
    const formData = new FormData(form);
    const device = formData.get('device') || 'desktop';
    const fullPage = form.elements['fullPage'].checked;
    const format = formData.get('format') || 'jpeg';
    const delay = Number(formData.get('delay') || 0);
    const popupWaitValue = formData.get('popupWait');
    const captureOptions = {
      url: finalUrl,
      device,
      fullPage,
      format,
      delay,
      hidePopups: form.elements['hidePopups'].checked,
      platform: formData.get('platform') || 'auto',
      hideWixBanner: form.elements['hideWixBanner'].checked,
      forceReveal: form.elements['forceReveal'].checked,
    };
    if (popupWaitValue !== '') captureOptions.popupWait = Number(popupWaitValue);

    // Update UI for loading state
    submitBtn.disabled = true;
    btnText.textContent = 'Capturing...';
    loadingState.classList.remove('hidden');

    // Abort previous in-flight request if user quickly re-submits
    if (activeAbortController) {
      activeAbortController.abort();
    }
    activeAbortController = new AbortController();

    // Setup client-side abort timer (55 seconds)
    const timeoutId = setTimeout(() => {
      activeAbortController.abort('CLIENT_TIMEOUT');
    }, 55000);

    try {
      const response = await fetch('/api/screenshot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'image/jpeg, image/png, image/webp, application/json',
        },
        body: JSON.stringify({
          ...captureOptions,
        }),
        signal: activeAbortController.signal,
      });

      clearTimeout(timeoutId);

      // Handle non-OK HTTP responses
      if (!response.ok) {
        let errMessage = '';
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
          try {
            const data = await response.json();
            errMessage = data.error || `Server returned error (${response.status})`;
          } catch {
            errMessage = `Server returned status code ${response.status}.`;
          }
        } else {
          // Fallback for HTML error pages (e.g. Vercel 504 / 502 gateway error)
          if (response.status === 504) {
            errMessage = 'The request timed out (504 Gateway Timeout). The target website took too long to load or blocked automated access.';
          } else if (response.status === 413) {
            errMessage = 'Screenshot exceeds Vercel\'s 4.5 MB payload limit. Please uncheck "Full Page" or select a smaller viewport.';
          } else if (response.status === 429) {
            errMessage = 'Too many requests. Please wait a few moments before trying again.';
          } else {
            errMessage = `Server returned HTTP status ${response.status} (${response.statusText || 'Error'}).`;
          }
        }

        if (response.status === 429 && !/wait .* seconds/i.test(errMessage)) {
          const retryAfter = Number(response.headers.get('retry-after'));
          errMessage = `Too many requests. Please try again in ${retryAfter > 0 ? `${retryAfter} seconds` : 'a few moments'}.`;
        } else if (response.status === 413 && !errMessage) {
          errMessage = 'The screenshot is too large. Turn off Full Page or choose a smaller viewport.';
        } else if (response.status === 504 && !errMessage) {
          errMessage = 'The capture timed out. The target website took too long to load; try again without Full Page.';
        }

        const titleMap = {
          400: 'Invalid Parameters',
          403: 'Security Check: Address Blocked',
          413: 'Payload Too Large',
          429: 'Rate Limit Exceeded',
          502: 'Target Unreachable',
          504: 'Gateway Timeout',
        };

        showError(titleMap[response.status] || 'Screenshot Failed', errMessage);
        return;
      }

      // Successful capture: process image blob
      const blob = await response.blob();
      const rawNotes = response.headers.get('X-Screenshot-Notes') || '';
      const dismissed = Number(rawNotes.match(/popups-dismissed=(\d+)/)?.[1] || 0);
      const hidden = Number(rawNotes.match(/popups-hidden=(\d+)/)?.[1] || 0);
      const usedPlatform = rawNotes.match(/platform=([^;]+)/)?.[1] || 'generic';
      const notes = [];
      if (dismissed || hidden) notes.push(`${dismissed + hidden} popup${dismissed + hidden === 1 ? '' : 's'} dismissed or hidden`);
      notes.push(`${usedPlatform === 'wix' ? 'Wix' : 'Generic'} profile used`);
      if (rawNotes.includes('truncated=true')) notes.push('page truncated at 16,000px');
      captureNotes.textContent = notes.join(' · ');
      captureNotes.classList.remove('hidden');

      // Revoke previous blob URL to prevent memory leaks
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
      }

      currentObjectUrl = URL.createObjectURL(blob);

      // Update image preview
      previewImage.src = currentObjectUrl;
      browserAddress.textContent = finalUrl;

      // Prepare download filename: screenshot-<hostname>-<timestamp>.<ext>
      const host = extractHostname(finalUrl);
      const now = new Date();
      const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const ext = format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg';
      const filename = `${host}-${device}-${timestamp}.${ext}`;

      downloadBtn.href = currentObjectUrl;
      downloadBtn.download = filename;

      // Update metadata tags
      metaUrl.textContent = host;
      metaSize.textContent = formatBytes(blob.size);
      const resolution = device === 'desktop' ? '1920×1080' : device === 'laptop' ? '1440×900' : device === 'tablet' ? '768×1024' : '390×844';
      metaFormat.textContent = `${format.toUpperCase()} (${resolution}${fullPage ? ', full page' : ''})`;

      // Setup Copy to Clipboard functionality
      copyBtn.onclick = async () => {
        try {
          if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
            copyText.textContent = 'Unsupported';
            setTimeout(() => { copyText.textContent = 'Copy'; }, 2000);
            return;
          }

          // Modern clipboard write accepts PNG blobs
          let copyBlob = blob;
          if (blob.type !== 'image/png') {
            // Convert to PNG via canvas for clipboard compatibility
            const img = new Image();
            img.src = currentObjectUrl;
            await new Promise(res => { img.onload = res; });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            copyBlob = await new Promise(res => canvas.toBlob(res, 'image/png'));
          }

          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': copyBlob }),
          ]);

          copyText.textContent = 'Copied!';
          setTimeout(() => { copyText.textContent = 'Copy'; }, 2000);
        } catch (clipErr) {
          console.warn('Clipboard write failed:', clipErr);
          copyText.textContent = 'Error';
          setTimeout(() => { copyText.textContent = 'Copy'; }, 2000);
        }
      };

      // Show result section and smooth scroll
      loadingState.classList.add('hidden');
      resultSection.classList.remove('hidden');
      resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError' || activeAbortController?.signal?.reason === 'CLIENT_TIMEOUT') {
        showError(
          'Request Timeout',
          'The capture took longer than 55 seconds and was canceled. Complex pages with heavy scripts or video take longer; try capturing without Full Page.'
        );
      } else {
        showError('Network Error', err.message || 'Failed to communicate with screenshot service.');
      }
    } finally {
      submitBtn.disabled = false;
      btnText.textContent = 'Take Screenshot';
    }
  });

  // Clean up object URLs on page unload
  window.addEventListener('beforeunload', () => {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
    }
  });
})();
