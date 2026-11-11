document.addEventListener('DOMContentLoaded', () => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cardPanel = document.getElementById('public-card-panel');
  const qrDetails = document.getElementById('qr-corner-details');
  const copyBtn = document.getElementById('copy-card-link-btn');
  const toast = document.getElementById('card-toast');

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('is-visible');
    setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 2200);
  }

  // Subtle interactive 3D tilt (desktop pointer only)
  if (cardPanel && !prefersReducedMotion && window.matchMedia('(hover: hover)').matches) {
    cardPanel.addEventListener('mousemove', (e) => {
      if (qrDetails && qrDetails.hasAttribute('open')) return;
      const rect = cardPanel.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -6;
      const rotateY = ((x - centerX) / centerX) * 6;

      cardPanel.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
    });

    cardPanel.addEventListener('mouseleave', () => {
      cardPanel.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
    });
  }

  // Close QR popover when clicking outside
  document.addEventListener('click', (e) => {
    if (qrDetails && qrDetails.hasAttribute('open') && !qrDetails.contains(e.target)) {
      qrDetails.removeAttribute('open');
    }
  });

  // Copy card URL button
  copyBtn?.addEventListener('click', async () => {
    const url = copyBtn.getAttribute('data-copy-url');
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Card link copied to clipboard!');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Card link copied!');
    }
  });
});
