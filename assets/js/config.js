import { DHAMMICS_API_BASE } from './env-config.js';

/**
 * Backend API root including `/api/v1`. Override at runtime with:
 *   window.__DHAMMICS_API_BASE__ = 'https://api.example.com/api/v1'
 */
export function getApiBase() {
  if (typeof window !== 'undefined' && window.__DHAMMICS_API_BASE__) {
    return String(window.__DHAMMICS_API_BASE__).replace(/\/$/, '');
  }
  return String(DHAMMICS_API_BASE).replace(/\/$/, '');
}
