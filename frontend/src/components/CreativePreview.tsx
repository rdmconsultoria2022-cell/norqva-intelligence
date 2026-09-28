import React, { useEffect, useState } from 'react';
import { Maximize2, X, ExternalLink } from 'lucide-react';

// NORQVA-0010: inline preview of a creative file (video player or image) inside the card,
// with an expanded view in a window on the same screen. Only http(s) links are rendered.

export type PreviewKind = 'video' | 'image' | 'unknown';

export function isHttpUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function previewKind(url: string, format?: string | null): PreviewKind {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* keep raw */
  }
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(ext)) return 'video';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(ext)) return 'image';
  const f = String(format || '').toUpperCase();
  if (f === 'VIDEO') return 'video';
  if (f === 'IMAGE' || f === 'CAROUSEL') return 'image';
  return 'unknown';
}

export const CreativePreview: React.FC<{
  url: string;
  format?: string | null;
  title?: string;
  className?: string;
  // NORQVA-0012: fill the parent's height (list view: media as tall as the info column)
  fill?: boolean;
}> = ({ url, format, title, className = '', fill = false }) => {
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const kind = previewKind(url, format);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const openLink = (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-emerald-400">
      <ExternalLink className="h-3 w-3" /> Abrir em nova aba
    </a>
  );

  if (kind === 'unknown' || failed) {
    return (
      <div className={`rounded border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400 ${className}`} data-testid="creative-preview-fallback">
        {failed ? 'Não foi possível carregar a prévia deste arquivo.' : 'Prévia indisponível para este tipo de arquivo.'} <span className="block mt-1">{openLink}</span>
      </div>
    );
  }

  const media = (big: boolean) =>
    kind === 'video' ? (
      <video
        data-testid={big ? 'creative-preview-video-expanded' : 'creative-preview-video'}
        src={big ? url : `${url}#t=0.1`}
        controls
        playsInline
        preload="metadata"
        autoPlay={big}
        onError={() => setFailed(true)}
        className={big ? 'max-h-[80vh] max-w-full rounded' : `w-full h-full object-contain bg-black ${fill ? 'absolute inset-0' : ''}`}
      />
    ) : (
      <img
        data-testid={big ? 'creative-preview-image-expanded' : 'creative-preview-image'}
        src={url}
        alt={title || 'Criativo'}
        loading="lazy"
        onError={() => setFailed(true)}
        onClick={big ? undefined : () => setExpanded(true)}
        className={big ? 'max-h-[80vh] max-w-full rounded' : `w-full h-full object-contain bg-black cursor-zoom-in ${fill ? 'absolute inset-0' : ''}`}
      />
    );

  return (
    <div className={`${className} ${fill ? 'flex flex-col h-full' : ''}`}>
      <div
        data-testid={fill ? 'creative-preview-fill' : undefined}
        className={`relative rounded overflow-hidden border border-slate-800 bg-black ${fill ? 'flex-1 min-h-[16rem]' : 'aspect-[4/5] max-h-72 mx-auto'}`}
      >
        {media(false)}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Ampliar criativo"
          className="absolute top-1.5 right-1.5 p-1.5 rounded bg-slate-950/70 text-slate-200 hover:bg-slate-900"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-1 flex justify-end">{openLink}</div>

      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title ? `Prévia de ${title}` : 'Prévia do criativo'}
          className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4"
          onClick={() => setExpanded(false)}
        >
          <div className="relative flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex w-full items-center justify-between gap-4 text-xs font-mono text-slate-300">
              <span className="truncate">{title}</span>
              <button type="button" onClick={() => setExpanded(false)} aria-label="Fechar prévia" className="p-1 rounded hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            {media(true)}
          </div>
        </div>
      )}
    </div>
  );
};
