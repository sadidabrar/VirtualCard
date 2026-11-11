document.addEventListener('DOMContentLoaded', () => {
  const step1Panel = document.getElementById('step-1-panel');
  const step2Panel = document.getElementById('step-2-panel');
  const dot1 = document.getElementById('dot-step-1');
  const dot2 = document.getElementById('dot-step-2');
  const btnNext = document.getElementById('btn-next-step');
  const btnPrev = document.getElementById('btn-prev-step');
  const form = document.getElementById('signup-form');

  function showStep(stepNumber) {
    if (!step1Panel || !step2Panel) return;
    if (stepNumber === 1) {
      step1Panel.classList.remove('is-collapsed');
      step2Panel.classList.add('is-collapsed');
      dot1?.classList.add('is-active');
      dot2?.classList.remove('is-active');
    } else {
      step1Panel.classList.add('is-collapsed');
      step2Panel.classList.remove('is-collapsed');
      dot1?.classList.remove('is-active');
      dot2?.classList.add('is-active');
    }
  }

  // Step 1 validation before advancing
  btnNext?.addEventListener('click', () => {
    const step1Inputs = step1Panel.querySelectorAll('input');
    for (const input of step1Inputs) {
      if (!input.checkValidity()) {
        input.reportValidity();
        return;
      }
    }
    const pass = document.getElementById('signup-password');
    const confirm = document.getElementById('signup-confirm-password');
    if (pass && confirm && pass.value !== confirm.value) {
      confirm.setCustomValidity('Passwords do not match.');
      confirm.reportValidity();
      confirm.setCustomValidity('');
      return;
    }
    showStep(2);
  });

  btnPrev?.addEventListener('click', () => showStep(1));
  dot1?.addEventListener('click', () => showStep(1));
  dot2?.addEventListener('click', () => showStep(2));

  // Ensure any hidden step 1 validation errors reveal step 1 on submit
  form?.addEventListener(
    'invalid',
    (e) => {
      if (step1Panel && step1Panel.contains(e.target)) {
        showStep(1);
      }
    },
    true
  );

  // Live Card Preview Binding
  const usernameInput = document.getElementById('signup-username');
  const previewSubdomain = document.getElementById('preview-subdomain');
  const availabilityEl = document.getElementById('username-availability');

  const previewBindings = [
    { inputId: 'card-full-name', targetId: 'preview-name', fallback: 'Your Full Name' },
    { inputId: 'card-job-title', targetId: 'preview-role', fallback: 'Your Job Title' },
    { inputId: 'card-company', targetId: 'preview-company', fallback: 'Your Company' },
    { inputId: 'card-tagline', targetId: 'preview-tagline', fallback: 'A brief tagline or bio appears here' },
    { inputId: 'card-phone', targetId: 'preview-phone', fallback: 'Call Contact' },
    { inputId: 'card-public-email', targetId: 'preview-email', fallback: 'Email Contact' },
  ];

  previewBindings.forEach(({ inputId, targetId, fallback }) => {
    const inputEl = document.getElementById(inputId);
    const targetEl = document.getElementById(targetId);
    if (inputEl && targetEl) {
      inputEl.addEventListener('input', () => {
        targetEl.textContent = inputEl.value.trim() || fallback;
      });
    }
  });

  // Live Avatar Preview
  const avatarInput = document.getElementById('card-avatar');
  const previewAvatarImg = document.getElementById('preview-avatar-img');
  if (avatarInput && previewAvatarImg) {
    avatarInput.addEventListener('change', () => {
      const file = avatarInput.files && avatarInput.files[0];
      if (file) {
        const objectUrl = URL.createObjectURL(file);
        previewAvatarImg.src = objectUrl;
      }
    });
  }

  // Live Accent Tint Binding
  const accentRadios = document.querySelectorAll('[data-accent-choice]');
  function applyAccent(hex) {
    document.documentElement.style.setProperty('--accent', hex);
    document.documentElement.style.setProperty('--accent-glow', `color-mix(in srgb, ${hex} 40%, transparent)`);
  }

  accentRadios.forEach((radio) => {
    if (radio.checked) applyAccent(radio.value);
    radio.addEventListener('change', () => {
      if (radio.checked) applyAccent(radio.value);
    });
  });

  // Debounced AJAX Username Availability Check
  let debounceTimer = null;
  async function checkUsernameAvailability(rawVal) {
    const val = rawVal.trim().toLowerCase();
    if (previewSubdomain) {
      previewSubdomain.textContent = val || 'username';
    }
    if (!availabilityEl) return;

    if (!val) {
      availabilityEl.textContent = '';
      availabilityEl.className = 'availability-hint';
      return;
    }

    availabilityEl.textContent = 'Checking availability...';
    availabilityEl.className = 'availability-hint';

    try {
      const res = await fetch(`/api/username-available?u=${encodeURIComponent(val)}`);
      const data = await res.json();
      if (data.available) {
        availabilityEl.textContent = `✓ ${data.username} is available!`;
        availabilityEl.className = 'availability-hint availability-ok';
      } else {
        availabilityEl.textContent = `✗ ${data.reason || 'This username is unavailable.'}`;
        availabilityEl.className = 'availability-hint availability-err';
      }
    } catch {
      availabilityEl.textContent = '';
    }
  }

  if (usernameInput) {
    if (usernameInput.value.trim()) {
      checkUsernameAvailability(usernameInput.value);
    }
    usernameInput.addEventListener('input', () => {
      const cleaned = usernameInput.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (usernameInput.value !== cleaned) {
        usernameInput.value = cleaned;
      }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => checkUsernameAvailability(cleaned), 280);
    });
  }
});
