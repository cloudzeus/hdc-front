/**
 * Keyboard geometry for the mega menu, as pure functions (unit-tested in
 * src/lib/__tests__/mega-menu-keys.test.ts).
 *
 *  - `radioStep`: the battery switch is a radiogroup — the arrows move the
 *    choice (and the focus) round the four batteries, Home and End jump to
 *    the ends.
 *  - `neighbour`: the groups sit in a grid that reflows with the space (one,
 *    two or three columns), so ↑↓←→ look for the nearest link on screen in
 *    that direction rather than the next one in the DOM.
 */

/** The index a key moves a radiogroup of `count` to, or null if it is no move. */
export function radioStep(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export type Box = { x: number; y: number; w: number; h: number };
export type Direction = "up" | "down" | "left" | "right";

const overlap = (a0: number, a1: number, b0: number, b1: number) =>
  Math.min(a1, b1) - Math.max(a0, b0);

/**
 * The box nearest to `boxes[from]` in `dir`, or -1 when there is none.
 *
 * ↑↓ prefer a box in the same column (horizontal overlap), nearest first; when
 * the column has ended they fall back to the nearest box further down (or up)
 * in any column, so ↓ from the last group of a short column still reaches the
 * «ΟΛΗ Η ΚΑΤΗΓΟΡΙΑ» button under the grid. ←→ only move within the same row:
 * past the edge they return -1, and the caller decides (← goes back to the
 * roots).
 */
export function neighbour(boxes: Box[], from: number, dir: Direction): number {
  const a = boxes[from];
  if (!a) return -1;
  const tol = 2;
  const vertical = dir === "up" || dir === "down";

  let best = -1;
  let bestScore = Infinity;
  let bestAligned = false;

  boxes.forEach((b, i) => {
    if (i === from) return;
    let ahead: boolean;
    let distance: number;
    let aligned: boolean;
    if (dir === "down") {
      ahead = b.y >= a.y + a.h - tol;
      distance = b.y - a.y;
    } else if (dir === "up") {
      ahead = b.y + b.h <= a.y + tol;
      distance = a.y - b.y;
    } else if (dir === "right") {
      ahead = b.x >= a.x + a.w - tol;
      distance = b.x - a.x;
    } else {
      ahead = b.x + b.w <= a.x + tol;
      distance = a.x - b.x;
    }
    if (!ahead) return;

    if (vertical) {
      aligned = overlap(a.x, a.x + a.w, b.x, b.x + b.w) > tol;
    } else {
      aligned = overlap(a.y, a.y + a.h, b.y, b.y + b.h) > tol;
      if (!aligned) return; // ←→ never leave the row
    }

    // Off-axis drift breaks ties (and ranks the fallback for ↑↓).
    const drift = vertical
      ? Math.abs(b.x - a.x)
      : Math.abs(b.y + b.h / 2 - (a.y + a.h / 2));
    const score = distance * 1000 + drift;
    if ((aligned && !bestAligned) || (aligned === bestAligned && score < bestScore)) {
      best = i;
      bestScore = score;
      bestAligned = aligned;
    }
  });

  return best;
}
