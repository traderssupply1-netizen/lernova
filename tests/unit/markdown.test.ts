import { describe, expect, it } from "vitest";
import { renderMarkdown, tsToSeconds } from "@/lib/markdown";

describe("renderMarkdown", () => {
  it("renders headings, lists, emphasis and quotes", () => {
    const html = renderMarkdown("## Topic\n- **Key** point\n- *soft*\n\n1. first\n2. second\n\n> **AI explanation:** extra");
    expect(html).toContain("<h2>Topic</h2>");
    expect(html).toContain("<ul>\n<li><strong>Key</strong> point</li>");
    expect(html).toContain("<em>soft</em>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<blockquote><p><strong>AI explanation:</strong> extra</p></blockquote>");
  });

  it("turns source timestamps into seek buttons", () => {
    expect(renderMarkdown("Mitosis [12:40] and [1:02:03]")).toContain('data-t="760"');
    expect(tsToSeconds("1:02:03")).toBe(3723);
  });

  it("escapes HTML from model output but keeps allow-listed markup", () => {
    const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)> <mark>ATP</mark> <span class="uncertain">glikolízis</span>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<mark>ATP</mark>");
    expect(html).toContain('<span class="uncertain">glikolízis</span>');
  });

  it("does not allow attribute injection through span", () => {
    const html = renderMarkdown('<span class="uncertain" onclick="x()">a</span><span onmouseover="y()">b</span>');
    expect(html).not.toContain('onclick="');
    expect(html).not.toContain('onmouseover="');
    expect(html).not.toMatch(/<span(?! class="uncertain">)[^>]*>/);
  });

  it("closes unbalanced allow-listed tags", () => {
    const html = renderMarkdown("<mark>open\n\nnext paragraph");
    expect(html.split("</mark>").length - 1).toBe(1);
  });
});
