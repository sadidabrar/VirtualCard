document.documentElement.classList.add('js-enabled');

// Close any open mobile navigation details when clicking outside
document.addEventListener('click', (event) => {
  const openNavs = document.querySelectorAll('details.glass-nav-mobile[open]');
  openNavs.forEach((details) => {
    if (!details.contains(event.target)) {
      details.removeAttribute('open');
    }
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    document.querySelectorAll('details.glass-nav-mobile[open]').forEach((d) => d.removeAttribute('open'));
  }
});
