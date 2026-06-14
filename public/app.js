// Simple front-end logic for the Media Downloader.

const form = document.getElementById('form');
const urlInput = document.getElementById('url');
const formatRow = document.getElementById('format-row');
const formatSelect = document.getElementById('format');
const submitBtn = document.getElementById('submit');

const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const barFill = document.querySelector('.bar-fill');

const errorBox = document.getElementById('error');
const errorText = document.getElementById('error-text');

const success = document.getElementById('success');
const downloadLink = document.getElementById('download');
const resetBtn = document.getElementById('reset');

// Show the audio-format picker only when "Audio" is selected.
form.type.forEach((radio) =>
  radio.addEventListener('change', () => {
    const isAudio = getType() === 'audio';
    formatRow.classList.toggle('hidden', !isAudio);
  })
);

function getType() {
  return form.querySelector('input[name="type"]:checked').value;
}

function show(el) {
  el.classList.remove('hidden');
}
function hide(el) {
  el.classList.add('hidden');
}

/**
 * Turn a Cloudinary delivery URL into one that forces a file download
 * by inserting the `fl_attachment` flag right after `/upload/`.
 */
function toDownloadUrl(url) {
  if (url.includes('/upload/') && !url.includes('fl_attachment')) {
    return url.replace('/upload/', '/upload/fl_attachment/');
  }
  return url;
}

// Fake but reassuring progress while the (single) request runs. The server
// does the work in one call, so we animate toward 90% and finish on response.
let progressTimer = null;
function startProgress() {
  const steps = [
    [15, 'Fetching media…'],
    [40, 'Downloading source…'],
    [70, 'Converting & uploading…'],
    [90, 'Almost done…'],
  ];
  let i = 0;
  barFill.style.width = '5%';
  loadingText.textContent = 'Starting…';
  progressTimer = setInterval(() => {
    if (i >= steps.length) return;
    const [pct, text] = steps[i++];
    barFill.style.width = pct + '%';
    loadingText.textContent = text;
  }, 1200);
}
function finishProgress() {
  clearInterval(progressTimer);
  barFill.style.width = '100%';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  hide(errorBox);
  hide(success);
  show(loading);
  submitBtn.disabled = true;
  startProgress();

  const type = getType();
  const endpoint = type === 'video' ? '/api/video' : '/api/audio';
  const body = { url: urlInput.value.trim() };
  if (type === 'audio') body.format = formatSelect.value;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Something went wrong. Please try again.');
    }

    const fileUrl = type === 'video' ? json.data.cloudinaryUrl : json.data.audioUrl;

    finishProgress();
    downloadLink.href = toDownloadUrl(fileUrl);
    setTimeout(() => {
      hide(loading);
      show(success);
    }, 400);
  } catch (err) {
    finishProgress();
    hide(loading);
    errorText.textContent = err.message;
    show(errorBox);
  } finally {
    submitBtn.disabled = false;
  }
});

resetBtn.addEventListener('click', () => {
  hide(success);
  hide(errorBox);
  urlInput.value = '';
  urlInput.focus();
});
