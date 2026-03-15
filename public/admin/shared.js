export const storageKey = 'barber-central-admin-token';

export function getToken() {
  return localStorage.getItem(storageKey);
}

export function clearToken() {
  localStorage.removeItem(storageKey);
}

export async function request(url, options = {}, includeAuth = true) {
  const headers = { ...(options.headers || {}) };
  let body = options.body;

  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) {
    headers['Content-Type'] ||= 'application/json';
    body = JSON.stringify(body);
  }

  if (includeAuth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Errore di rete');
  return data;
}

export async function logoutToLogin() {
  try {
    await request('/api/admin/logout', { method: 'POST' });
  } catch {
    // ignore logout errors
  }
  clearToken();
  window.location.href = '/admin';
}

export function ensureAuthenticated() {
  const token = getToken();
  if (!token) {
    window.location.href = '/admin';
    return false;
  }
  return true;
}

function ensurePasswordDialog() {
  let dialog = document.querySelector('[data-change-password-dialog]');
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.className = 'admin-password-dialog';
  dialog.dataset.changePasswordDialog = 'true';
  dialog.innerHTML = `
    <form class="admin-password-card card-surface" data-change-password-form method="dialog">
      <div class="admin-password-head">
        <div>
          <span class="section-kicker">Sicurezza account</span>
          <h2>Cambia password</h2>
        </div>
        <button class="icon-btn" type="button" data-close-change-password>Chiudi</button>
      </div>
      <label><span>Password attuale</span><input type="password" name="currentPassword" required /></label>
      <label><span>Nuova password</span><input type="password" name="newPassword" minlength="6" required /></label>
      <label><span>Conferma nuova password</span><input type="password" name="confirmPassword" minlength="6" required /></label>
      <p class="form-status" data-change-password-status></p>
      <div class="admin-password-actions">
        <button class="btn btn-secondary" type="button" data-close-change-password>Annulla</button>
        <button class="btn btn-primary" type="submit">Salva password</button>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);
  return dialog;
}

export function initChangePassword() {
  const trigger = document.querySelector('[data-change-password]');
  if (!trigger) return;

  const dialog = ensurePasswordDialog();
  const form = dialog.querySelector('[data-change-password-form]');
  const status = dialog.querySelector('[data-change-password-status]');
  const closeButtons = dialog.querySelectorAll('[data-close-change-password]');

  const closeDialog = () => {
    form.reset();
    status.textContent = '';
    status.classList.remove('is-success', 'is-error');
    dialog.close();
  };

  if (!trigger.dataset.passwordBound) {
    trigger.dataset.passwordBound = 'true';
    trigger.addEventListener('click', () => dialog.showModal());
  }

  closeButtons.forEach((button) => {
    if (button.dataset.passwordBound) return;
    button.dataset.passwordBound = 'true';
    button.addEventListener('click', closeDialog);
  });

  if (!form.dataset.passwordBound) {
    form.dataset.passwordBound = 'true';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.textContent = '';
      status.classList.remove('is-success', 'is-error');

      const formData = new FormData(form);
      const currentPassword = `${formData.get('currentPassword') || ''}`;
      const newPassword = `${formData.get('newPassword') || ''}`;
      const confirmPassword = `${formData.get('confirmPassword') || ''}`;

      if (newPassword !== confirmPassword) {
        status.textContent = 'Le nuove password non coincidono';
        status.classList.add('is-error');
        return;
      }

      try {
        const result = await request('/api/admin/change-password', {
          method: 'POST',
          body: { currentPassword, newPassword }
        });
        status.textContent = result.message || 'Password aggiornata con successo';
        status.classList.add('is-success');
        window.setTimeout(closeDialog, 900);
      } catch (error) {
        status.textContent = error.message || 'Impossibile aggiornare la password';
        status.classList.add('is-error');
      }
    });
  }
}
