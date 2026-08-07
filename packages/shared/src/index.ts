export * from './types.js';
export const API_VERSION = 'v1';
export const apiVersion = API_VERSION;

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  userId: string;
};
