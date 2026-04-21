import { dbApi } from './localdb.js';

/**
 * Auth facade around localStorage DB. Every function intentionally matches a
 * future API-style surface so this module can later proxy server endpoints.
 */

export const register = async (username, password, displayName = '') =>
  dbApi.registerUser({ username, password, displayName });

export const login = async (username, password, { remember = false } = {}) =>
  dbApi.loginUser({ username, password, remember });

export const logout = async () => dbApi.logoutUser();

export const currentUserObject = async () => dbApi.getCurrentUser();

export const currentUser = async () => {
  const user = await dbApi.getCurrentUser();
  return user?.displayName || user?.username || null;
};

export const isAuthenticated = async () => dbApi.isAuthenticated();

export const requireAuth = async (redirect = './user.html') => {
  if (!(await isAuthenticated())) {
    location.replace(redirect);
    return false;
  }
  return true;
};
