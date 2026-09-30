import { describe, expect, it } from "vitest";
import { readingMinutes, renderMarkdown } from "@/lib/seo/markdown";

describe("renderMarkdown", () => {
  it("renders headings, lists and emphasis", () => {
    const html = renderMarkdown("## Τι είναι;\n\n- **M18** πλατφόρμα\n- M12");
    expect(html).toContain("<h2>Τι είναι;</h2>");
    expect(html).toContain("<li><strong>M18</strong> πλατφόρμα</li>");
  });

  it("wraps tables so a wide one scrolls in its own box", () => {
    const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toMatch(/^<div class="md-table"><table>/);
    expect(html).toContain("</table></div>");
  });

  it("shows raw HTML as text instead of running it", () => {
    const html = renderMarkdown('Κείμενο <script>alert(1)</script> <img src=x onerror="y">');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps internal links as they are and opens external ones safely", () => {
    const html = renderMarkdown("[δράπανα](/katalogos/drapana) και [Milwaukee](https://www.milwaukeetool.eu/)");
    expect(html).toContain('<a href="/katalogos/drapana">δράπανα</a>');
    expect(html).toContain('<a href="https://www.milwaukeetool.eu/" target="_blank" rel="noopener noreferrer">Milwaukee</a>');
  });

  it("drops a javascript: link to its text", () => {
    const html = renderMarkdown("[πάτα](javascript:alert(1))");
    expect(html).not.toContain("href");
    expect(html).toContain("πάτα");
  });

  it("returns nothing for an empty body", () => {
    expect(renderMarkdown("  ")).toBe("");
    expect(renderMarkdown(null)).toBe("");
  });
});

describe("readingMinutes", () => {
  it("counts about 200 words a minute, at least one", () => {
    expect(readingMinutes("λέξη ".repeat(1000))).toBe(5);
    expect(readingMinutes("")).toBe(1);
  });
});
