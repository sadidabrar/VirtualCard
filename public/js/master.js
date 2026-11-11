document.addEventListener('DOMContentLoaded', () => {
  const toastEl = document.getElementById('master-toast');
  const csrfToken = toastEl?.dataset.csrfToken || '';
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

  // Liquid Glass Delete Confirmation Modal + HTTP DELETE integration
  const modal = document.getElementById('delete-confirm-modal');
  const modalUsername = document.getElementById('delete-modal-username');
  const modalError = document.getElementById('delete-modal-error');
  const cancelBtn = document.getElementById('delete-modal-cancel');
  const confirmBtn = document.getElementById('delete-modal-confirm');

  let pendingDeleteUserId = null;
  let pendingDeleteUsername = null;

  document.querySelectorAll('.master-delete-form').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!modal || typeof modal.showModal !== 'function') {
        return; // Allow standard POST /delete fallback on legacy browsers
      }
      e.preventDefault();
      pendingDeleteUserId = form.dataset.deleteUserId || null;
      pendingDeleteUsername = form.dataset.deleteUsername || '';
      if (modalUsername) {
        modalUsername.textContent = `@${pendingDeleteUsername}`;
      }
      if (modalError) {
        modalError.textContent = '';
      }
      modal.showModal();
    });
  });

  cancelBtn?.addEventListener('click', () => {
    pendingDeleteUserId = null;
    modal?.close();
  });

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      pendingDeleteUserId = null;
      modal.close();
    }
  });

  confirmBtn?.addEventListener('click', async () => {
    if (!pendingDeleteUserId) return;
    confirmBtn.disabled = true;
    if (modalError) modalError.textContent = '';

    try {
      const res = await fetch(`/master/users/${encodeURIComponent(pendingDeleteUserId)}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'X-CSRF-Token': csrfToken,
        },
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        const msg = payload?.error?.message || 'Failed to delete account.';
        if (modalError) modalError.textContent = msg;
        confirmBtn.disabled = false;
        return;
      }

      const deletedName = payload.data?.deletedUsername || pendingDeleteUsername || '';
      window.location.href = `/master?deleted=${encodeURIComponent(deletedName)}`;
    } catch {
      if (modalError) modalError.textContent = 'Network error while deleting account.';
      confirmBtn.disabled = false;
    }
  });

  // Live password match validation for admin password reset form
  const newPassInput = document.getElementById('reset-new-password');
  const confirmPassInput = document.getElementById('reset-confirm-password');
  const matchHint = document.getElementById('reset-password-match-hint');
  const resetForm = document.getElementById('reset-password-form');

  function checkResetMatch(forceShow = false) {
    if (!newPassInput || !confirmPassInput || !matchHint) return true;
    const p1 = newPassInput.value;
    const p2 = confirmPassInput.value;

    if (!p1 && !p2 && !forceShow) {
      matchHint.textContent = '';
      matchHint.className = 'availability-hint';
      confirmPassInput.classList.remove('is-invalid');
      confirmPassInput.setCustomValidity('');
      return true;
    }

    if ((p2.length > 0 || forceShow) && p1 !== p2) {
      matchHint.textContent = '✗ Passwords do not match.';
      matchHint.className = 'availability-hint availability-err';
      confirmPassInput.classList.add('is-invalid');
      confirmPassInput.setCustomValidity('Passwords do not match.');
      return false;
    }

    if (p1.length >= 8 && p1 === p2) {
      matchHint.textContent = '✓ Passwords match.';
      matchHint.className = 'availability-hint availability-ok';
      confirmPassInput.classList.remove('is-invalid');
      confirmPassInput.setCustomValidity('');
      return true;
    }

    matchHint.textContent = '';
    matchHint.className = 'availability-hint';
    confirmPassInput.classList.remove('is-invalid');
    confirmPassInput.setCustomValidity('');
    return true;
  }

  newPassInput?.addEventListener('input', () => checkResetMatch(false));
  confirmPassInput?.addEventListener('input', () => checkResetMatch(false));
  resetForm?.addEventListener('submit', (e) => {
    if (!checkResetMatch(true)) {
      e.preventDefault();
      confirmPassInput?.reportValidity();
    }
  });
});
