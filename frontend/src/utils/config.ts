/**
 * Application URL and Environment configuration.
 * Resolves the public-facing URL for TikTak, handling custom domains,
 * localhost development environments, and explicit environment variables.
 */
export const getPublicAppUrl = (): string => {
  // Explicit environment variable override takes precedence
  if (import.meta.env.VITE_APP_URL) {
    return import.meta.env.VITE_APP_URL.replace(/\/+$/, '');
  }

  // In the browser, use current origin unless running locally
  if (typeof window !== 'undefined' && window.location.origin) {
    const origin = window.location.origin;
    // For outbound links (e.g. WhatsApp shares, contractor links), localhost links cannot be visited by external users
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      return origin;
    }
  }

  // Canonical production custom domain
  return 'https://mytiktak.com';
};
