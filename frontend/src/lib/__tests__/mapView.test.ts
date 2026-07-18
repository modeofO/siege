import { describe, it, expect } from "vitest";
import {
  computeFitBox,
  zoomAt,
  pan,
  clampView,
  clientToView,
  boxToViewBox,
  type Box,
} from "../mapView";

const FIT: Box = { x: 0, y: 0, w: 400, h: 200 };

describe("computeFitBox", () => {
  it("bounds the points plus padding", () => {
    const box = computeFitBox(
      [
        { x: 10, y: 20 },
        { x: 110, y: 80 },
      ],
      5,
    );
    expect(box).toEqual({ x: 5, y: 15, w: 110, h: 70 });
  });
});

describe("zoomAt", () => {
  it("zooming in shrinks the view and keeps the anchor fixed", () => {
    const anchor = { x: 100, y: 50 };
    const v = zoomAt(FIT, FIT, 2, anchor);
    expect(v.w).toBeCloseTo(200);
    expect(v.h).toBeCloseTo(100);
    // Anchor stays at the same relative position: it was at 25% width from
    // the left; after zoom it must still map to the same world point.
    expect((anchor.x - v.x) / v.w).toBeCloseTo((anchor.x - FIT.x) / FIT.w);
    expect((anchor.y - v.y) / v.h).toBeCloseTo((anchor.y - FIT.y) / FIT.h);
  });

  it("clamps zoom-in at 4x fit scale", () => {
    let v: Box = { ...FIT };
    for (let i = 0; i < 20; i += 1) v = zoomAt(v, FIT, 2, { x: 200, y: 100 });
    expect(v.w).toBeCloseTo(FIT.w / 4);
  });

  it("clamps zoom-out at 0.5x fit scale", () => {
    let v: Box = { ...FIT };
    for (let i = 0; i < 20; i += 1) v = zoomAt(v, FIT, 0.5, { x: 200, y: 100 });
    expect(v.w).toBeCloseTo(FIT.w * 2);
  });
});

describe("pan / clampView", () => {
  it("pans by the given delta", () => {
    const zoomed = zoomAt(FIT, FIT, 2, { x: 200, y: 100 });
    const moved = pan(zoomed, FIT, 10, -5);
    expect(moved.x).toBeCloseTo(zoomed.x + 10);
    expect(moved.y).toBeCloseTo(zoomed.y - 5);
  });

  it("never lets the view centre leave the fit extent", () => {
    const zoomed = zoomAt(FIT, FIT, 4, { x: 0, y: 0 });
    const flung = pan(zoomed, FIT, -100000, -100000);
    expect(flung.x + flung.w / 2).toBeGreaterThanOrEqual(FIT.x);
    expect(flung.y + flung.h / 2).toBeGreaterThanOrEqual(FIT.y);
    const flungRight = pan(zoomed, FIT, 100000, 100000);
    expect(flungRight.x + flungRight.w / 2).toBeLessThanOrEqual(FIT.x + FIT.w);
    expect(flungRight.y + flungRight.h / 2).toBeLessThanOrEqual(FIT.y + FIT.h);
  });

  it("clampView preserves dimensions", () => {
    const clamped = clampView({ x: -9999, y: -9999, w: 100, h: 50 }, FIT);
    expect(clamped.w).toBe(100);
    expect(clamped.h).toBe(50);
  });
});

describe("clientToView", () => {
  it("maps the element centre to the view centre (aspect match)", () => {
    const rect = { left: 0, top: 0, width: 800, height: 400 };
    const p = clientToView(FIT, rect, 400, 200);
    expect(p.x).toBeCloseTo(200);
    expect(p.y).toBeCloseTo(100);
  });

  it("accounts for xMidYMid meet letterboxing on a wide element", () => {
    // Element 800x200 showing a 400x200 view: scale = max(400/800, 200/200)
    // = 1, content occupies the central 400px horizontally (200px offset).
    const rect = { left: 0, top: 0, width: 800, height: 200 };
    const atContentLeft = clientToView(FIT, rect, 200, 0);
    expect(atContentLeft.x).toBeCloseTo(0);
    const atContentRight = clientToView(FIT, rect, 600, 200);
    expect(atContentRight.x).toBeCloseTo(400);
  });
});

describe("boxToViewBox", () => {
  it("formats as 'x y w h'", () => {
    expect(boxToViewBox({ x: 1, y: 2, w: 3, h: 4 })).toBe("1 2 3 4");
  });
});
