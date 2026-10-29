// The Ask the Hub answer, read into blocks the panel renders as React nodes
// (identical in the Project Hub and Missed Punch Hub). Pure. Light markdown
// only: paragraphs, "-" / "*" / "1." list items, **bold**, and [label](/path) links. No HTML and no
// images ever render: everything is text unless it matches those forms.
//
// A link renders only when its target is a Hub path that a tool returned in
// this conversation (`allowed`). Anything else (another site, `//host`,
// `/\host`, `javascript:`, a made-up record path) shows as its label text.

export type Inline = { type: "text"; text: string } | { type: "bold"; text: string } | { type: "link"; text: string; href: string };
export type Block = { type: "paragraph"; inlines: Inline[] } | { type: "list"; ordered: boolean; items: Inline[][] };

/** A same-origin Hub path: one leading slash, no scheme, no backslash, no control characters. */
export function isHubPath(href: string): boolean {
  return /^\/(?![/\\])[^\s\\]*$/.test(href) && !/[\u0000-\u001f]/.test(href);
}

/** The Hub links a tool result carries ("link" fields of its JSON). */
export function linksInToolResult(content: string): string[] {
  const out: string[] = [];
  for (const m of content.matchAll(/"link":"((?:[^"\\]|\\.)*)"/g)) {
    try {
      const href = JSON.parse(`"${m[1]}"`) as string;
      if (isHubPath(href)) out.push(href);
    } catch {
      // not a JSON string — skip it
    }
  }
  return out;
}

function inlines(text: string, allowed: ReadonlySet<string>): Inline[] {
  const out: Inline[] = [];
  const push = (part: Inline) => {
    const prev = out[out.length - 1];
    if (part.type === "text" && prev?.type === "text") prev.text += part.text;
    else if (part.text) out.push(part);
  };
  // An image ![alt](src) is read first so it never becomes a link: its alt text stays.
  const re = /!\[([^\]]*)\]\(([^)\s]*)\)|\[([^\]]+)\]\(([^)\s]*)\)|\*\*([^*]+)\*\*/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    push({ type: "text", text: text.slice(at, m.index) });
    if (m[1] !== undefined) push({ type: "text", text: m[1] });
    else if (m[3] !== undefined) {
      const href = m[4];
      if (isHubPath(href) && allowed.has(href)) push({ type: "link", text: m[3], href });
      else push({ type: "text", text: m[3] });
    } else push({ type: "bold", text: m[5] });
    at = (m.index ?? 0) + m[0].length;
  }
  push({ type: "text", text: text.slice(at) });
  return out;
}

export function renderAnswer(text: string, allowed: ReadonlySet<string>): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length > 0) blocks.push({ type: "paragraph", inlines: inlines(para.join(" "), allowed) });
    para = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (!line) {
      flush();
    } else if (bullet || numbered) {
      flush();
      const ordered = numbered != null;
      const item = inlines((bullet ?? numbered)![1], allowed);
      const last = blocks[blocks.length - 1];
      if (last?.type === "list" && last.ordered === ordered) last.items.push(item);
      else blocks.push({ type: "list", ordered, items: [item] });
    } else {
      // A heading line ("## Next steps") reads as a bold paragraph.
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (heading) {
        flush();
        blocks.push({ type: "paragraph", inlines: [{ type: "bold", text: heading[1] }] });
      } else {
        para.push(line);
      }
    }
  }
  flush();
  return blocks;
}
