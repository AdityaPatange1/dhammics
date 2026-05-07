import { DHAMMICS_ENV } from './env-config.js';

/**
 * Merged environment: build-time DHAMMICS_ENV, then runtime overrides from
 *   window.__DHAMMICS_ENV__ = { DHAMMICS_API_BASE: '…', … }
 * Later keys win. Use only for non-secret, client-safe values.
 */
export function getMergedEnv() {
  const base = { ...DHAMMICS_ENV };
  if (typeof window !== 'undefined' && window.__DHAMMICS_ENV__ && typeof window.__DHAMMICS_ENV__ === 'object') {
    for (const [k, v] of Object.entries(window.__DHAMMICS_ENV__)) {
      if (v !== undefined && v !== null) base[k] = String(v);
    }
  }
  return base;
}

/**
 * Read one variable by name (e.g. DHAMMICS_API_BASE).
 * @param {string} key
 * @param {string} [fallback]
 */
export function getEnv(key, fallback = '') {
  const v = getMergedEnv()[key];
  if (v !== undefined) return String(v);
  return fallback;
}

/**
 * Backend API root including `/api/v1`.
 * Legacy override: window.__DHAMMICS_API_BASE__ (string) still supported.
 */
export function getApiBase() {
  if (typeof window !== 'undefined' && window.__DHAMMICS_API_BASE__) {
    return String(window.__DHAMMICS_API_BASE__).replace(/\/$/, '');
  }
  return getEnv('DHAMMICS_API_BASE', 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '');
}
