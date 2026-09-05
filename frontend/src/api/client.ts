import axios from "axios";

import { keycloak } from "../auth/keycloak";

/**
 * Axios instance for calling the backend through Kong. Every request is
 * given a fresh (auto-refreshed) Keycloak access token, if one is available.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

apiClient.interceptors.request.use(async (config) => {
  if (keycloak.token) {
    try {
      await keycloak.updateToken(30);
    } catch {
      keycloak.login();
    }
    config.headers.Authorization = `Bearer ${keycloak.token}`;
  }
  return config;
});
