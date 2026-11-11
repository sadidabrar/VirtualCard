document.addEventListener('DOMContentLoaded', () => {
  const copyBtn = document.getElementById('copy-url-btn');
  const copyLabel = document.getElementById('copy-btn-label');
  const toast = document.getElementById('copy-toast');

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('is-visible');
    setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 2400);
  }

  copyBtn?.addEventListener('click', async () => {
    const url = copyBtn.getAttribute('data-copy-url');
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      if (copyLabel) copyLabel.textContent = 'Copied!';
      showToast('Public card URL copied to clipboard!');
      setTimeout(() => {
        if (copyLabel) copyLabel.textContent = 'Copy Link';
      }, 2000);
    } catch {
      // Fallback copy method
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('Public card URL copied!');
    }
  });
});
