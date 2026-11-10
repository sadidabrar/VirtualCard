// Liquid Glass Interactive Demo Controller

document.addEventListener('DOMContentLoaded', () => {
  // 1. Live Accent Switcher
  const accentButtons = document.querySelectorAll('[data-accent]');
  accentButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const hex = btn.getAttribute('data-accent');
      const rgb = btn.getAttribute('data-rgb');
      document.documentElement.style.setProperty('--accent', hex);
      document.documentElement.style.setProperty('--accent-rgb', rgb);
      document.documentElement.style.setProperty('--accent-glow', `rgba(${rgb}, 0.4)`);

      accentButtons.forEach(b => b.style.outline = 'none');
      btn.style.outline = `3px solid ${hex}`;
      btn.style.outlineOffset = '2px';
    });
  });

  // 2. Interactive 3D Card Tilt with Specular Glare
  const tiltCard = document.getElementById('interactive-tilt-card');
  if (tiltCard) {
    tiltCard.addEventListener('mousemove', (e) => {
      const rect = tiltCard.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -10;
      const rotateY = ((x - centerX) / centerX) * 10;

      tiltCard.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;
    });

    tiltCard.addEventListener('mouseleave', () => {
      tiltCard.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)';
    });
  }

  // 3. Live Preview Binding
  const inputName = document.getElementById('demo-name-input');
  const inputRole = document.getElementById('demo-role-input');
  const inputCompany = document.getElementById('demo-company-input');
  const inputTagline = document.getElementById('demo-tagline-input');

  const cardName = document.getElementById('preview-name');
  const cardRole = document.getElementById('preview-role');
  const cardCompany = document.getElementById('preview-company');
  const cardTagline = document.getElementById('preview-tagline');

  if (inputName && cardName) {
    inputName.addEventListener('input', (e) => {
      cardName.textContent = e.target.value || 'Mahbub Khan';
    });
  }
  if (inputRole && cardRole) {
    inputRole.addEventListener('input', (e) => {
      cardRole.textContent = e.target.value || 'Founder & Principal Architect';
    });
  }
  if (inputCompany && cardCompany) {
    inputCompany.addEventListener('input', (e) => {
      cardCompany.textContent = e.target.value || 'Apex Cloud Systems';
    });
  }
  if (inputTagline && cardTagline) {
    inputTagline.addEventListener('input', (e) => {
      cardTagline.textContent = e.target.value || 'Scaling distributed cloud systems with elegant interfaces';
    });
  }

  // 4. Accessibility Simulation Toggles
  const simReducedTransparency = document.getElementById('sim-reduced-transparency');
  if (simReducedTransparency) {
    simReducedTransparency.addEventListener('change', (e) => {
      document.body.classList.toggle('force-reduced-transparency', e.target.checked);
    });
  }

  const simNoBlur = document.getElementById('sim-no-blur');
  if (simNoBlur) {
    simNoBlur.addEventListener('change', (e) => {
      document.body.classList.toggle('force-no-blur', e.target.checked);
    });
  }
});
