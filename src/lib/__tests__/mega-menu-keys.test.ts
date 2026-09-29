import { describe, expect, it } from "vitest";
import { neighbour, radioStep, type Box } from "@/components/chrome/MegaMenu/keys";

describe("radioStep", () => {
  it("moves round the four batteries and wraps", () => {
    expect(radioStep("ArrowRight", 0, 4)).toBe(1);
    expect(radioStep("ArrowDown", 3, 4)).toBe(0);
    expect(radioStep("ArrowLeft", 0, 4)).toBe(3);
    expect(radioStep("ArrowUp", 2, 4)).toBe(1);
  });

  it("jumps to the ends, and ignores other keys", () => {
    expect(radioStep("Home", 2, 4)).toBe(0);
    expect(radioStep("End", 1, 4)).toBe(3);
    expect(radioStep("Enter", 1, 4)).toBeNull();
    expect(radioStep("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("neighbour", () => {
  // Two columns of groups, the right one shorter, and the «ΟΛΗ Η ΚΑΤΗΓΟΡΙΑ»
  // button under the left column:
  //
  //   0  1
  //   2  3
  //   4
  //   5 (button)
  const cell = (col: number, row: number): Box => ({ x: col * 300, y: row * 44, w: 280, h: 44 });
  const boxes: Box[] = [
    cell(0, 0),
    cell(1, 0),
    cell(0, 1),
    cell(1, 1),
    cell(0, 2),
    { x: 0, y: 3 * 44 + 22, w: 200, h: 46 },
  ];

  it("moves down and up within a column", () => {
    expect(neighbour(boxes, 0, "down")).toBe(2);
    expect(neighbour(boxes, 2, "down")).toBe(4);
    expect(neighbour(boxes, 4, "down")).toBe(5);
    expect(neighbour(boxes, 3, "up")).toBe(1);
    expect(neighbour(boxes, 0, "up")).toBe(-1);
  });

  it("falls back to the nearest box below when the column has ended", () => {
    expect(neighbour(boxes, 3, "down")).toBe(4);
  });

  it("moves left and right within a row, and stops at the edge", () => {
    expect(neighbour(boxes, 0, "right")).toBe(1);
    expect(neighbour(boxes, 3, "left")).toBe(2);
    expect(neighbour(boxes, 2, "left")).toBe(-1);
    expect(neighbour(boxes, 1, "right")).toBe(-1);
    expect(neighbour(boxes, 4, "right")).toBe(-1);
  });

  it("walks a single column (a narrow panel) the same way", () => {
    const single = [0, 1, 2].map((row) => cell(0, row));
    expect(neighbour(single, 0, "down")).toBe(1);
    expect(neighbour(single, 2, "up")).toBe(1);
    expect(neighbour(single, 1, "right")).toBe(-1);
  });
});
