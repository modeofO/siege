import { createTimeline } from "animejs";

export interface BreachElements {
  container: HTMLElement;
  vault: HTMLElement;
  flash: HTMLElement;
  banner: HTMLElement;
  bannerText: HTMLElement;
}

export function createBreachTimeline(
  els: BreachElements,
  isWinner: boolean,
  onComplete?: () => void,
) {
  void isWinner;
  const tl = createTimeline({ autoplay: false, onComplete });

  tl.add(els.container, {
    translateX: [0, -2, 3, -4, 5, -3, 4, -2, 0],
    translateY: [0, 1, -2, 3, -2, 2, -1, 1, 0],
    duration: 600,
    ease: "inOutQuad",
  }, 0);

  tl.add(els.vault, {
    opacity: [1, 0.6, 0.2, 0],
    scale: [1, 0.95, 0.85],
    duration: 800,
    ease: "inQuad",
  }, 200);

  tl.add(els.flash, {
    opacity: [0, 0.8, 0],
    duration: 400,
    ease: "inOutQuad",
  }, 600);

  tl.add(els.banner, {
    opacity: [0, 1],
    scale: [0.8, 1.05, 1],
    duration: 500,
    ease: "outBack",
  }, 900);

  tl.add(els.bannerText, {
    opacity: [0, 1],
    translateY: [10, 0],
    duration: 300,
    ease: "outQuad",
  }, 1100);

  return tl;
}
