/**
 * Login page controller.
 */

import { login, isAuthenticated } from './auth.js';
import { $, toast } from './utils.js';

const init = () => {
  if (isAuthenticated()) {
    location.replace('./admin.html');
    return;
  }

  const form = $('#login-form');
  const errorEl = $('#login-error');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    errorEl.textContent = '';
    const data = new FormData(form);
    const username = String(data.get('username') || '').trim();
    const password = String(data.get('password') || '');
    const remember = Boolean(data.get('remember'));

    const result = login(username, password, { remember });
    if (!result.ok) {
      errorEl.textContent = result.error;
      toast(result.error, { type: 'error' });
      return;
    }
    toast('Welcome back.', { type: 'success' });
    setTimeout(() => location.assign('./admin.html'), 250);
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
