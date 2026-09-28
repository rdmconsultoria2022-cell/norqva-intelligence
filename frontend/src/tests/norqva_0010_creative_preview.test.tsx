import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreativePreview, previewKind, isHttpUrl } from '../components/CreativePreview';

// NORQVA-0010: creative shown inline (video player / image) with an expanded view on the same screen.
describe('NORQVA-0010 — creative preview', () => {
  it('detects the media kind by extension, falling back to the creative format', () => {
    expect(previewKind('https://x.test/a/BB-B01-H01-M1-C1.mp4')).toBe('video');
    expect(previewKind('https://x.test/a/H05_4x5.png?raw=1')).toBe('image');
    expect(previewKind('https://x.test/file', 'VIDEO')).toBe('video');
    expect(previewKind('https://x.test/file', 'IMAGE')).toBe('image');
    expect(previewKind('https://x.test/file')).toBe('unknown');
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
  });

  it('video: inline player with controls; expand opens a player window that closes', () => {
    render(<CreativePreview url="https://x.test/v.mp4" title="BB-B01-H01-M1-C1" />);
    const v = screen.getByTestId('creative-preview-video');
    expect(v).toHaveAttribute('controls');
    expect(v.getAttribute('src')).toBe('https://x.test/v.mp4#t=0.1');

    fireEvent.click(screen.getByRole('button', { name: 'Ampliar criativo' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('BB-B01-H01-M1-C1');
    expect(screen.getByTestId('creative-preview-video-expanded')).toHaveAttribute('src', 'https://x.test/v.mp4');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar prévia' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('image: thumbnail click opens the enlarged image; load error shows a fallback with the link', () => {
    render(<CreativePreview url="https://x.test/i.png" title="H05" />);
    fireEvent.click(screen.getByTestId('creative-preview-image'));
    expect(screen.getByTestId('creative-preview-image-expanded')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.error(screen.getByTestId('creative-preview-image'));
    expect(screen.getByTestId('creative-preview-fallback')).toHaveTextContent('Não foi possível carregar');
    expect(screen.getByRole('link', { name: /Abrir em nova aba/ })).toHaveAttribute('href', 'https://x.test/i.png');
  });
});
