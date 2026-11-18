/**
 * Minimal, safe Markdown renderer for AI notes. All input is HTML-escaped first;
 * only a fixed allow-list of inline markup is re-enabled (<mark>, uncertain spans),
 * so model output can never inject scripts or arbitrary HTML.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function tsToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  return parts.reduce((a, n) => a * 60 + n, 0);
}

function inline(raw: string): string {
  let s = esc(raw);
  // Allow-listed tags (escaped forms restored).
  s = s.replace(/&lt;mark&gt;/g, "<mark>").replace(/&lt;\/mark&gt;/g, "</mark>");
  s = s.replace(/&lt;span class=&quot;uncertain&quot;&gt;/g, '<span class="uncertain">').replace(/&lt;\/span&gt;/g, "</span>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  // Source timestamps: [12:40] or [1:02:03]
  s = s.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (_, t) => `<button type="button" class="ts" data-t="${tsToSeconds(t)}">${t}</button>`);
  return balance(s);
}

/** Closes any allow-listed tags the model left open so markup cannot leak across blocks. */
function balance(s: string): string {
  for (const tag of ["mark", "span", "strong", "em"]) {
    const open = (s.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;
    const close = (s.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
    if (open > close) s += `</${tag}>`.repeat(open - close);
  }
  return s;
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${quote.map((q) => `<p>${inline(q)}</p>`).join("")}</blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const l = line.trimEnd();
    let m: RegExpMatchArray | null;
    if (!l.trim()) {
      flushAll();
    } else if ((m = l.match(/^(#{1,3})\s+(.*)$/))) {
      flushAll();
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
    } else if ((m = l.match(/^\s*>\s?(.*)$/))) {
      flushPara();
      flushList();
      quote.push(m[1]);
    } else if ((m = l.match(/^\s*[-*•]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (list !== "ul") {
        flushList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (list !== "ol") {
        flushList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else {
      flushList();
      flushQuote();
      para.push(l.trim());
    }
  }
  flushAll();
  return out.join("\n");
}
