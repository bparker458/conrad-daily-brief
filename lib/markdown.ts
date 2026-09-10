/**
 * Minimal markdown to HTML renderer.
 *
 * Deliberately hand-rolled and dependency-free: adding a markdown package would
 * mean regenerating package-lock.json, and a stale lockfile fails a `npm ci`
 * Netlify build. The input is Conrad-authored state documents in a known shape
 * (front matter, headings, lists, tables, checkboxes, links, code), not
 * arbitrary internet markdown, so full CommonMark is not needed.
 *
 * Everything is HTML-escaped before any markup is inserted, so a state document
 * can never inject script into the dashboard.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline: code, bold, italic, links. Input must already be escaped. */
function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
}

export interface ParsedDoc {
  frontMatter: Record<string, string>;
  html: string;
}

export function renderMarkdown(source: string): ParsedDoc {
  const frontMatter: Record<string, string> = {};
  let text = source.replace(/\r\n/g, "\n");

  // Front matter
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) frontMatter[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    text = text.slice(fm[0].length);
  }

  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (!buf.length) return;
    out.push(`<p>${inline(escapeHtml(buf.join(" ")))}</p>`);
    buf.length = 0;
  };

  const para: string[] = [];

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code
    if (/^```/.test(line)) {
      flushParagraph(para);
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence
      out.push(`<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    // Blank
    if (/^\s*$/.test(line)) {
      flushParagraph(para);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph(para);
      out.push("<hr>");
      i++;
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushParagraph(para);
      const level = h[1].length;
      out.push(`<h${level}>${inline(escapeHtml(h[2].trim()))}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      flushParagraph(para);
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${inline(escapeHtml(body.join(" ")))}</blockquote>`);
      continue;
    }

    // Table: header row, separator row, then body rows
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1])) {
      flushParagraph(para);
      const cells = (row: string) =>
        row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(lines[i]);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) body.push(cells(lines[i++]));
      out.push(
        "<table><thead><tr>" +
          head.map((c) => `<th>${inline(escapeHtml(c))}</th>`).join("") +
          "</tr></thead><tbody>" +
          body
            .map(
              (r) =>
                "<tr>" + r.map((c) => `<td>${inline(escapeHtml(c))}</td>`).join("") + "</tr>"
            )
            .join("") +
          "</tbody></table>"
      );
      continue;
    }

    // Lists (unordered, ordered, task)
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      flushParagraph(para);
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, "");
        let cls = "";
        const task = item.match(/^\[( |x|X)\]\s*/);
        if (task) {
          const done = task[1].toLowerCase() === "x";
          item = item.slice(task[0].length);
          cls = done ? ' class="task done"' : ' class="task"';
          items.push(
            `<li${cls}><span class="box">${done ? "&#10003;" : ""}</span>${inline(
              escapeHtml(item)
            )}</li>`
          );
          i++;
          continue;
        }
        items.push(`<li>${inline(escapeHtml(item))}</li>`);
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    para.push(line.trim());
    i++;
  }

  flushParagraph(para);
  return { frontMatter, html: out.join("\n") };
}
