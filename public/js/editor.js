document.addEventListener('DOMContentLoaded', () => {
  // 1. Toast notification controller
  const toastEl = document.getElementById('editor-toast');
  let toastTimer = null;

  function showToast(message) {
    if (!toastEl || !message) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('is-visible');
    }, 3600);
  }

  const initialToast = toastEl?.dataset.toastMessage?.trim();
  if (initialToast) {
    showToast(initialToast);
  }

  // 2. Copy Public Card URL
  const copyBtn = document.getElementById('copy-card-url-btn');
  copyBtn?.addEventListener('click', async () => {
    const url = copyBtn.dataset.copyUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Card URL copied to clipboard!');
    } catch {
      showToast(url);
    }
  });

  // 3. Live Preview Bindings
  const liveBindings = [
    { inputId: 'edit-full-name', targetId: 'preview-name', fallback: 'Your Full Name' },
    { inputId: 'edit-job-title', targetId: 'preview-role', fallback: 'Your Job Title' },
    { inputId: 'edit-company', targetId: 'preview-company', fallback: 'Your Company' },
    {
      inputId: 'edit-tagline',
      targetId: 'preview-tagline',
      fallback: 'A brief tagline or bio appears here',
    },
    { inputId: 'edit-phone', targetId: 'preview-phone', fallback: 'Call Contact' },
    { inputId: 'edit-public-email', targetId: 'preview-email', fallback: 'Email Contact' },
    { inputId: 'edit-address', targetId: 'preview-address', fallback: '' },
  ];

  liveBindings.forEach(({ inputId, targetId, fallback }) => {
    const input = document.getElementById(inputId);
    const target = document.getElementById(targetId);
    if (!input || !target) return;
    input.addEventListener('input', () => {
      target.textContent = input.value.trim() || fallback;
    });
  });

  // Publish toggle badge live update
  const publishedToggle = document.getElementById('edit-is-published');
  const visibilityText = document.getElementById('preview-visibility-text');
  if (publishedToggle && visibilityText) {
    publishedToggle.addEventListener('change', () => {
      visibilityText.textContent = publishedToggle.checked
        ? 'Live Public Card'
        : 'Private Draft (404 to Visitors)';
    });
  }

  // 4. Accent Color Live Tint
  const accentRadios = document.querySelectorAll('[data-accent-choice]');
  function applyAccent(hex) {
    document.documentElement.style.setProperty('--accent', hex);
    document.documentElement.style.setProperty(
      '--accent-glow',
      `color-mix(in srgb, ${hex} 40%, transparent)`
    );
  }

  accentRadios.forEach((radio) => {
    if (radio.checked) applyAccent(radio.value);
    radio.addEventListener('change', () => {
      if (radio.checked) applyAccent(radio.value);
    });
  });

  // 5. Avatar File Selection Preview & Ripple Micro-Interaction
  const avatarInput = document.getElementById('editor-avatar-input');
  const currentAvatarImg = document.getElementById('editor-current-avatar-img');
  const previewAvatarImg = document.getElementById('preview-avatar-img');
  const avatarRipple = document.getElementById('editor-avatar-ripple');

  if (avatarInput) {
    avatarInput.addEventListener('change', () => {
      const file = avatarInput.files && avatarInput.files[0];
      if (!file) return;

      const objectUrl = URL.createObjectURL(file);
      if (currentAvatarImg) currentAvatarImg.src = objectUrl;
      if (previewAvatarImg) previewAvatarImg.src = objectUrl;

      if (avatarRipple) {
        avatarRipple.classList.remove('is-rippling');
        // Force reflow so rapid consecutive picks replay the ripple cleanly
        void avatarRipple.offsetWidth;
        avatarRipple.classList.add('is-rippling');
      }
    });
  }

  // 6. Drag-to-Reorder + Accessible Move Buttons for Social Profiles
  const socialList = document.getElementById('social-drag-list');
  const socialOrderInput = document.getElementById('social-order-input');
  const previewSocialsContainer = document.getElementById('preview-socials-pills');
  let draggedRow = null;

  function syncSocialOrderAndPreview() {
    if (!socialList) return;
    const rows = Array.from(socialList.querySelectorAll('.social-drag-row'));
    const platforms = rows.map((row) => row.dataset.platform).filter(Boolean);

    if (socialOrderInput) {
      socialOrderInput.value = platforms.join(',');
    }

    rows.forEach((row, index) => {
      const upBtn = row.querySelector('[data-move="up"]');
      const downBtn = row.querySelector('[data-move="down"]');
      if (upBtn) upBtn.disabled = index === 0;
      if (downBtn) downBtn.disabled = index === rows.length - 1;
    });

    if (previewSocialsContainer) {
      previewSocialsContainer.replaceChildren();
      rows.forEach((row) => {
        const platform = row.dataset.platform;
        const input = row.querySelector('input[data-social-input]');
        const val = input ? input.value.trim() : '';
        if (platform && val) {
          const badge = document.createElement('span');
          badge.className = 'glass-badge';
          badge.style.textTransform = 'capitalize';
          badge.textContent = platform;
          previewSocialsContainer.appendChild(badge);
        }
      });
    }
  }

  if (socialList) {
    socialList.addEventListener('input', (e) => {
      if (e.target && e.target.matches('input[data-social-input]')) {
        syncSocialOrderAndPreview();
      }
    });

    socialList.addEventListener('click', (e) => {
      const btn = e.target.closest('.social-move-btn');
      if (!btn) return;
      const row = btn.closest('.social-drag-row');
      if (!row) return;

      const direction = btn.dataset.move;
      if (direction === 'up' && row.previousElementSibling) {
        socialList.insertBefore(row, row.previousElementSibling);
        syncSocialOrderAndPreview();
        btn.focus();
      } else if (direction === 'down' && row.nextElementSibling) {
        socialList.insertBefore(row.nextElementSibling, row);
        syncSocialOrderAndPreview();
        btn.focus();
      }
    });

    socialList.addEventListener('dragstart', (e) => {
      // Do not initiate row drag while selecting text inside the URL input
      if (document.activeElement && document.activeElement.tagName === 'INPUT') {
        e.preventDefault();
        return;
      }
      const row = e.target.closest('.social-drag-row');
      if (!row) return;
      draggedRow = row;
      row.classList.add('is-dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', row.dataset.platform || '');
      }
    });

    socialList.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedRow) return;
      const targetRow = e.target.closest('.social-drag-row');
      if (!targetRow || targetRow === draggedRow) return;

      const rect = targetRow.getBoundingClientRect();
      const insertAfter = e.clientY > rect.top + rect.height / 2;

      socialList.querySelectorAll('.social-drag-row.is-drag-over').forEach((el) => {
        if (el !== targetRow) el.classList.remove('is-drag-over');
      });
      targetRow.classList.add('is-drag-over');

      if (insertAfter) {
        socialList.insertBefore(draggedRow, targetRow.nextSibling);
      } else {
        socialList.insertBefore(draggedRow, targetRow);
      }
    });

    socialList.addEventListener('dragleave', (e) => {
      const targetRow = e.target.closest('.social-drag-row');
      if (targetRow && !targetRow.contains(e.relatedTarget)) {
        targetRow.classList.remove('is-drag-over');
      }
    });

    socialList.addEventListener('dragend', () => {
      if (draggedRow) {
        draggedRow.classList.remove('is-dragging');
      }
      socialList.querySelectorAll('.social-drag-row.is-drag-over').forEach((el) => {
        el.classList.remove('is-drag-over');
      });
      draggedRow = null;
      syncSocialOrderAndPreview();
    });

    socialList.addEventListener('drop', (e) => {
      e.preventDefault();
      syncSocialOrderAndPreview();
    });

    syncSocialOrderAndPreview();
  }
});
