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

  // =========================================================================
  // Google Maps Link Builder Helper
  // =========================================================================
  const generateMapsBtn = document.getElementById('generate-maps-url-btn');
  const addressInput = document.getElementById('edit-address');
  const mapsUrlInput = document.getElementById('edit-maps-url');
  if (generateMapsBtn && addressInput && mapsUrlInput) {
    generateMapsBtn.addEventListener('click', () => {
      const addr = addressInput.value.trim();
      if (!addr) {
        addressInput.focus();
        return;
      }
      mapsUrlInput.value = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
      mapsUrlInput.focus();
    });
  }

  // =========================================================================
  // Multi-Phone Manager (#phone-rows-container <-> #phones-json-input)
  // =========================================================================
  const phoneRowsContainer = document.getElementById('phone-rows-container');
  const phonesJsonInput = document.getElementById('phones-json-input');
  const addPhoneRowBtn = document.getElementById('add-phone-row-btn');
  const primaryPhoneInput = document.getElementById('edit-phone');
  const whatsappInput = document.getElementById('edit-whatsapp');
  const previewPhoneEl = document.getElementById('preview-phone');
  const previewExtraPhonesEl = document.getElementById('preview-extra-phones');

  function makeTempId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${prefix}-${window.crypto.randomUUID().slice(0, 8)}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function createTrashIconSvg() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '15');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.innerHTML =
      '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>';
    return svg;
  }

  if (phoneRowsContainer && phonesJsonInput) {
    let phoneEntries = [];
    try {
      const parsed = JSON.parse(phoneRowsContainer.dataset.initialPhones || '[]');
      if (Array.isArray(parsed)) {
        phoneEntries = parsed.map((entry, idx) => ({
          id: String(entry.id || (idx === 0 ? 'primary' : makeTempId('ph'))),
          label: String(entry.label || (entry.is_whatsapp ? 'WhatsApp' : 'Mobile')),
          number: String(entry.number || ''),
          is_whatsapp: Boolean(entry.is_whatsapp),
        }));
      }
    } catch {
      phoneEntries = [];
    }

    function syncPhonesHiddenAndPreview() {
      const cleaned = phoneEntries
        .map((p) => ({
          id: p.id,
          label: (p.label || '').trim() || (p.is_whatsapp ? 'WhatsApp' : 'Phone'),
          number: (p.number || '').trim(),
          is_whatsapp: Boolean(p.is_whatsapp),
        }))
        .filter((p) => p.number.length > 0);

      phonesJsonInput.value = JSON.stringify(cleaned);

      if (previewPhoneEl) {
        const firstNonEmpty = cleaned.find((p) => !p.is_whatsapp) || cleaned[0];
        previewPhoneEl.textContent = (firstNonEmpty && firstNonEmpty.number) || 'Call Contact';
      }
      if (previewExtraPhonesEl) {
        previewExtraPhonesEl.textContent =
          cleaned.length > 1
            ? `+${cleaned.length - 1} additional number${cleaned.length - 1 === 1 ? '' : 's'} · Direct Save-to-Phone enabled`
            : '';
      }
    }

    function renderPhoneRows() {
      phoneRowsContainer.textContent = '';
      if (phoneEntries.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'glass-label-sub';
        hint.style.margin = '0.25rem 0';
        hint.textContent = 'No labeled numbers yet. Enter your primary phone above or click "Add Phone Number".';
        phoneRowsContainer.appendChild(hint);
        syncPhonesHiddenAndPreview();
        return;
      }

      phoneEntries.forEach((entry, index) => {
        const row = document.createElement('div');
        row.className = 'dynamic-row dynamic-row-grid-phone row-slide-in';
        row.dataset.phoneRowId = entry.id;

        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.className = 'glass-input';
        labelInput.placeholder = 'Label (e.g. Office)';
        labelInput.maxLength = 30;
        labelInput.value = entry.label;
        labelInput.setAttribute('aria-label', `Phone ${index + 1} label`);
        labelInput.addEventListener('input', () => {
          entry.label = labelInput.value;
          syncPhonesHiddenAndPreview();
        });

        const numInput = document.createElement('input');
        numInput.type = 'tel';
        numInput.className = 'glass-input';
        numInput.placeholder = '+880 1711 000000';
        numInput.maxLength = 32;
        numInput.value = entry.number;
        numInput.setAttribute('aria-label', `Phone ${index + 1} number`);
        numInput.addEventListener('input', () => {
          entry.number = numInput.value;
          if (entry.id === 'primary' && primaryPhoneInput) {
            primaryPhoneInput.value = numInput.value;
          } else if (entry.id === 'whatsapp' && whatsappInput) {
            whatsappInput.value = numInput.value;
          }
          syncPhonesHiddenAndPreview();
        });

        const waWrap = document.createElement('label');
        waWrap.className = 'compact-check-label';
        const waCheck = document.createElement('input');
        waCheck.type = 'checkbox';
        waCheck.checked = Boolean(entry.is_whatsapp);
        waCheck.addEventListener('change', () => {
          entry.is_whatsapp = waCheck.checked;
          syncPhonesHiddenAndPreview();
        });
        const waText = document.createElement('span');
        waText.textContent = 'WhatsApp';
        waWrap.appendChild(waCheck);
        waWrap.appendChild(waText);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'icon-btn-danger';
        removeBtn.setAttribute('aria-label', `Remove phone ${entry.label || index + 1}`);
        removeBtn.appendChild(createTrashIconSvg());
        removeBtn.addEventListener('click', () => {
          phoneEntries.splice(index, 1);
          if (entry.id === 'primary' && primaryPhoneInput) {
            primaryPhoneInput.value = '';
          } else if (entry.id === 'whatsapp' && whatsappInput) {
            whatsappInput.value = '';
          }
          renderPhoneRows();
        });

        row.appendChild(labelInput);
        row.appendChild(numInput);
        row.appendChild(waWrap);
        row.appendChild(removeBtn);
        phoneRowsContainer.appendChild(row);
      });

      syncPhonesHiddenAndPreview();
    }

    if (addPhoneRowBtn) {
      addPhoneRowBtn.addEventListener('click', () => {
        phoneEntries.push({
          id: makeTempId('ph'),
          label: phoneEntries.length === 0 ? 'Mobile' : 'Office',
          number: '',
          is_whatsapp: false,
        });
        renderPhoneRows();
        const rows = phoneRowsContainer.querySelectorAll('.dynamic-row');
        const lastRow = rows[rows.length - 1];
        const firstInput = lastRow && lastRow.querySelector('input[type="text"]');
        if (firstInput) firstInput.focus();
      });
    }

    if (primaryPhoneInput) {
      primaryPhoneInput.addEventListener('input', () => {
        const val = primaryPhoneInput.value;
        let primaryEntry = phoneEntries.find((p) => p.id === 'primary') || phoneEntries.find((p) => !p.is_whatsapp);
        if (!primaryEntry && val.trim()) {
          primaryEntry = { id: 'primary', label: 'Mobile', number: val, is_whatsapp: false };
          phoneEntries.unshift(primaryEntry);
          renderPhoneRows();
          return;
        }
        if (primaryEntry) {
          primaryEntry.number = val;
          const rowEl = phoneRowsContainer.querySelector(`[data-phone-row-id="${CSS.escape(primaryEntry.id)}"] input[type="tel"]`);
          if (rowEl && document.activeElement !== rowEl) {
            rowEl.value = val;
          }
          syncPhonesHiddenAndPreview();
        }
      });
    }

    if (whatsappInput) {
      whatsappInput.addEventListener('input', () => {
        const val = whatsappInput.value;
        let waEntry = phoneEntries.find((p) => p.id === 'whatsapp') || phoneEntries.find((p) => p.is_whatsapp);
        if (!waEntry && val.trim()) {
          waEntry = { id: 'whatsapp', label: 'WhatsApp', number: val, is_whatsapp: true };
          phoneEntries.push(waEntry);
          renderPhoneRows();
          return;
        }
        if (waEntry) {
          waEntry.number = val;
          const rowEl = phoneRowsContainer.querySelector(`[data-phone-row-id="${CSS.escape(waEntry.id)}"] input[type="tel"]`);
          if (rowEl && document.activeElement !== rowEl) {
            rowEl.value = val;
          }
          syncPhonesHiddenAndPreview();
        }
      });
    }

    renderPhoneRows();
  }

  // =========================================================================
  // Additional Social Accounts & Messaging Numbers
  // =========================================================================
  const extraSocialsContainer = document.getElementById('extra-socials-container');
  const extraSocialsJsonInput = document.getElementById('extra-socials-json-input');
  const addExtraSocialBtn = document.getElementById('add-extra-social-btn');
  const previewExtraSocialsEl = document.getElementById('preview-extra-socials-pills');

  if (extraSocialsContainer && extraSocialsJsonInput) {
    let extraSocials = [];
    let platformOptions = [];
    try {
      const parsedSocials = JSON.parse(extraSocialsContainer.dataset.initialExtraSocials || '[]');
      if (Array.isArray(parsedSocials)) {
        extraSocials = parsedSocials.map((s) => ({
          id: String(s.id || makeTempId('soc')),
          platform: String(s.platform || 'telegram'),
          label: String(s.label || ''),
          value: String(s.value || ''),
          kind: String(s.kind || 'handle'),
        }));
      }
    } catch {
      extraSocials = [];
    }

    try {
      const parsedOpts = JSON.parse(extraSocialsContainer.dataset.platformOptions || '[]');
      if (Array.isArray(parsedOpts)) {
        platformOptions = parsedOpts;
      }
    } catch {
      platformOptions = [];
    }

    function findPlatformMeta(platformId) {
      return platformOptions.find((opt) => opt.id === platformId) || {
        id: platformId,
        label: 'Custom',
        defaultKind: 'handle',
        placeholder: 'URL, @handle, or number',
      };
    }

    function syncExtraSocialsHiddenAndPreview() {
      const cleaned = extraSocials
        .map((s) => {
          const meta = findPlatformMeta(s.platform);
          return {
            id: s.id,
            platform: s.platform || 'custom',
            label: (s.label || '').trim() || meta.label,
            value: (s.value || '').trim(),
            kind: s.kind || meta.defaultKind || 'handle',
          };
        })
        .filter((s) => s.value.length > 0);

      extraSocialsJsonInput.value = JSON.stringify(cleaned);

      if (previewExtraSocialsEl) {
        previewExtraSocialsEl.textContent = '';
        cleaned.forEach((item) => {
          const pill = document.createElement('span');
          pill.className = 'glass-badge';
          pill.dataset.previewExtra = '1';
          pill.textContent = item.label || item.platform;
          previewExtraSocialsEl.appendChild(pill);
        });
      }
    }

    function renderExtraSocialRows() {
      extraSocialsContainer.textContent = '';
      if (extraSocials.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'glass-label-sub';
        hint.style.margin = '0.25rem 0';
        hint.textContent = 'Add Telegram, Viber, IMO, TikTok, Discord, Messenger, or hotline accounts here.';
        extraSocialsContainer.appendChild(hint);
        syncExtraSocialsHiddenAndPreview();
        return;
      }

      extraSocials.forEach((entry, index) => {
        const row = document.createElement('div');
        row.className = 'dynamic-row dynamic-row-grid-social row-slide-in';

        const select = document.createElement('select');
        select.className = 'glass-input glass-select';
        select.setAttribute('aria-label', `Additional account ${index + 1} platform`);
        platformOptions.forEach((opt) => {
          const optionEl = document.createElement('option');
          optionEl.value = opt.id;
          optionEl.textContent = opt.label;
          if (opt.id === entry.platform) optionEl.selected = true;
          select.appendChild(optionEl);
        });

        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.className = 'glass-input';
        labelInput.placeholder = 'Label (optional)';
        labelInput.maxLength = 40;
        labelInput.value = entry.label;
        labelInput.setAttribute('aria-label', `Additional account ${index + 1} label`);

        const valInput = document.createElement('input');
        valInput.type = 'text';
        valInput.className = 'glass-input';
        valInput.maxLength = 300;
        valInput.value = entry.value;
        valInput.placeholder = findPlatformMeta(entry.platform).placeholder;
        valInput.setAttribute('aria-label', `Additional account ${index + 1} value`);

        select.addEventListener('change', () => {
          entry.platform = select.value;
          const meta = findPlatformMeta(entry.platform);
          entry.kind = meta.defaultKind || 'handle';
          valInput.placeholder = meta.placeholder;
          syncExtraSocialsHiddenAndPreview();
        });

        labelInput.addEventListener('input', () => {
          entry.label = labelInput.value;
          syncExtraSocialsHiddenAndPreview();
        });

        valInput.addEventListener('input', () => {
          entry.value = valInput.value;
          syncExtraSocialsHiddenAndPreview();
        });

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'icon-btn-danger';
        removeBtn.setAttribute('aria-label', `Remove additional account ${index + 1}`);
        removeBtn.appendChild(createTrashIconSvg());
        removeBtn.addEventListener('click', () => {
          extraSocials.splice(index, 1);
          renderExtraSocialRows();
        });

        row.appendChild(select);
        row.appendChild(labelInput);
        row.appendChild(valInput);
        row.appendChild(removeBtn);
        extraSocialsContainer.appendChild(row);
      });

      syncExtraSocialsHiddenAndPreview();
    }

    if (addExtraSocialBtn) {
      addExtraSocialBtn.addEventListener('click', () => {
        const defaultOpt = platformOptions[1] || platformOptions[0] || { id: 'telegram', defaultKind: 'handle', label: 'Telegram' };
        extraSocials.push({
          id: makeTempId('soc'),
          platform: defaultOpt.id,
          label: '',
          value: '',
          kind: defaultOpt.defaultKind || 'handle',
        });
        renderExtraSocialRows();
        const rows = extraSocialsContainer.querySelectorAll('.dynamic-row');
        const lastRow = rows[rows.length - 1];
        const valueEl = lastRow && lastRow.querySelectorAll('input')[1];
        if (valueEl) valueEl.focus();
      });
    }

    renderExtraSocialRows();
  }
});
