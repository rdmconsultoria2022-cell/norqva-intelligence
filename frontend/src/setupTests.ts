import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Test-only dummy environment variables for Supabase SDK initialization during test execution
process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'placeholder-anon-key';

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = {};
}
(import.meta as any).env.VITE_SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
(import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY || 'placeholder-anon-key';

// Mock window.matchMedia if needed by UI
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
