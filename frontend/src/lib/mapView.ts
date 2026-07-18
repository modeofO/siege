// Pure SVG viewBox math for the world map's zoom/pan. No DOM access — every
// function takes plain numbers so it is unit-testable.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Zoom scale is defined relative to the fit ("show everything") view:
// scale = fit.w / view.w. 1 = fit exactly, 4 = 4x magnification.
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

export function computeFitBox(points: { x: number; y: number }[], padding: number): Box {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  const maxX = Math.max(...xs) + padding;
  const maxY = Math.max(...ys) + padding;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// Keep the view centre inside the world extent so the map can never be
// panned fully out of sight. Dimensions are preserved.
export function clampView(view: Box, fit: Box): Box {
  const cx = Math.min(Math.max(view.x + view.w / 2, fit.x), fit.x + fit.w);
  const cy = Math.min(Math.max(view.y + view.h / 2, fit.y), fit.y + fit.h);
  return { x: cx - view.w / 2, y: cy - view.h / 2, w: view.w, h: view.h };
}

// factor > 1 zooms in. The world point under `anchor` stays put.
export function zoomAt(view: Box, fit: Box, factor: number, anchor: { x: number; y: number }): Box {
  const w = Math.min(Math.max(view.w / factor, fit.w / MAX_SCALE), fit.w / MIN_SCALE);
  const ratio = w / view.w;
  return clampView(
    {
      x: anchor.x - (anchor.x - view.x) * ratio,
      y: anchor.y - (anchor.y - view.y) * ratio,
      w,
      h: view.h * ratio,
    },
    fit,
  );
}

export function pan(view: Box, fit: Box, dx: number, dy: number): Box {
  return clampView({ x: view.x + dx, y: view.y + dy, w: view.w, h: view.h }, fit);
}

// Client (CSS pixel) coordinates -> viewBox coordinates for an <svg> with the
// default preserveAspectRatio="xMidYMid meet": content is uniformly scaled to
// fit and centred, so account for the letterbox offset.
export function clientToView(
  view: Box,
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const scale = Math.max(view.w / rect.width, view.h / rect.height);
  const offX = (rect.width - view.w / scale) / 2;
  const offY = (rect.height - view.h / scale) / 2;
  return {
    x: view.x + (clientX - rect.left - offX) * scale,
    y: view.y + (clientY - rect.top - offY) * scale,
  };
}

export function boxToViewBox(b: Box): string {
  return `${b.x} ${b.y} ${b.w} ${b.h}`;
}
