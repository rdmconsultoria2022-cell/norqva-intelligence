// NORQVA-0003: production builds have no DEMO mode. The DEMO view (and its toggle) only
// exists in automated tests or when explicitly enabled for local development.
const env = (import.meta as any).env || {};
export const DEMO_MODE_ENABLED: boolean =
  env.MODE === 'test' || env.VITE_ENABLE_DEMO_MODE === 'true';
