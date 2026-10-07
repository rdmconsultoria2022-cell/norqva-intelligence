/// <reference types="vite/client" />
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProxyChainDiagnosticsPanel, PROXY_DIAGNOSTICS_PATH } from '../features/diagnostics/ProxyChainDiagnosticsPanel';
import panelSource from '../features/diagnostics/ProxyChainDiagnosticsPanel.tsx?raw';

// H1.1 — TEMPORÁRIO: painel de diagnóstico da cadeia de proxies (remover após a certificação do H1.1).

const sample = { temporary: 'H1.1 — remover após a certificação', trust_proxy_effective: '2', req_ip: '203.0.113.7', x_forwarded_for_count: 2 };

describe('H1.1 — painel temporário de diagnóstico (frontend)', () => {
  it('ADMIN: one explicit GET to /diagnostics/proxy-chain via the app client, shows only the returned JSON', async () => {
    const apiFetch = vi.fn(async () => sample);
    render(<ProxyChainDiagnosticsPanel currentUser={{ role: 'ADMIN' }} apiFetch={apiFetch} />);
    expect(screen.getByTestId('proxy-diagnostics-panel')).toHaveTextContent('TEMPORÁRIO');
    expect(apiFetch).not.toHaveBeenCalled(); // nothing runs on render

    fireEvent.click(screen.getByRole('button', { name: /Executar diagnóstico/ }));
    await waitFor(() => expect(screen.getByTestId('proxy-diagnostics-json')).toBeInTheDocument());

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = apiFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(PROXY_DIAGNOSTICS_PATH);
    expect(url).toBe('/diagnostics/proxy-chain');
    expect(opts).toEqual({ method: 'GET' }); // read-only: no body, no custom headers
    expect(JSON.parse(screen.getByTestId('proxy-diagnostics-json').textContent || '{}')).toEqual(sample);
  });

  it('non-ADMIN roles see nothing and never call the API', () => {
    for (const role of ['INTELLIGENCE', 'PERFORMANCE', 'CREATIVE', 'OPERATIONS', 'PRODUCT', undefined]) {
      const apiFetch = vi.fn();
      const { container, unmount } = render(<ProxyChainDiagnosticsPanel currentUser={role ? { role } : null} apiFetch={apiFetch} />);
      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByRole('button', { name: /Executar diagnóstico/ })).toBeNull();
      expect(apiFetch).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('shows the API error message without retrying', async () => {
    const apiFetch = vi.fn(async () => {
      throw new Error('Acesso negado');
    });
    render(<ProxyChainDiagnosticsPanel currentUser={{ role: 'ADMIN' }} apiFetch={apiFetch} />);
    fireEvent.click(screen.getByRole('button', { name: /Executar diagnóstico/ }));
    await waitFor(() => expect(screen.getByTestId('proxy-diagnostics-error')).toHaveTextContent('Acesso negado'));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('source is read-only and never touches the token or storage', () => {
    const src: string = panelSource;
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); // ignore comments
    expect(code).not.toMatch(/localStorage|sessionStorage|access_token|Authorization|Bearer|supabase|getSession|document\.cookie/);
    expect(code).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/);
    expect(code).not.toMatch(/\bfetch\(/); // only the app's apiFetch client
    expect(code).not.toMatch(/console\.(log|info|debug)/);
    expect(src).toMatch(/TEMPORÁRIO — H1\.1\. REMOVER APÓS A CERTIFICAÇÃO/);
  });
});
