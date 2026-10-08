# Sequel Deck Craft

Hard-won rules for generating board-quality PowerPoint (and the docx/xlsx siblings) at runtime in Node. Learned across Project Hub's leadership/VCP/steering decks and the Acquisition Hub's pitch/readout decks. Read this **before** touching any `*-deck-pptx.ts`, `deck-charts.ts`, graphics renderer, or template build script.

## 1. Architecture

- **Render onto the approved brand template, never from scratch.** Load the approved `.pptx` with pptx-automizer, strip its slides but keep masters/layouts/theme (`buildEmptyRoot`), then clone template slides and set text / overlay generated content. The deck opens looking like the board's own template because it *is* the board's template.
- **Charts are native pptxgenjs shapes** drawn via the automizer `slide.generate(g => …)` interop — **no `addChart`, no images**. `addChart` doesn't wire reliably through automizer; images aren't editable and aren't Power BI / Office portable. The primitives live in `deck-kit/deck-charts.ts` (kpiTile, waterfall, hBar, columns, stacked share, funnel, dumbbell, numbered cards) — add new chart types there, not inline in a deck builder.
- **Pre-seed empty placeholders once** (`scripts/preseed-deck-template.mjs`): approved templates often ship title/subtitle placeholders with no `<a:t>` run, and automizer's `modify.setText` silently no-ops without one. Seed titles/subtitles; leave body placeholders empty (the builder overlays tables there).
- **Web/deck encoding parity**: when a chart exists both in-app (Recharts/SVG) and in a deck, the visual encodings must agree (e.g. the dumbbell's hollow navy start dot / filled green-red end dot). Keep the pair in sync or the exec sees two different stories.
- **Multi-brand entities**: a template can carry several brand families (SEQ/ON/FVO covers + headers). Model it as a brand map `{coverSlide, dividerSlide, contentSlide, headerFill}` keyed by brand (the same `SEQ`/`FVO`/`ON` keys as `brand/entities.ts`), with `defaultBrand` = the app's entity, picked per export. `headerFill` is the entity's dark (`bareHex(ENTITIES[k].roles.navy)`). The template repo's FVO layouts carry the **Sept 2026 identity** (dark-green grounds with the arch motif, new lockup, green rules); a template still showing the tree-and-fox seal or gold rules is the retired FVO brand.

## 2. Canvas & font calibration

- Know your template's canvas: 16:9 **1× = 13.33"×7.5"** (`sldSz cx=12192000`). Reference decks from designers are often authored at **2× (26.67"×15")** — port their font sizes **× 0.5** (their 17pt table body → 8.5pt on 1×). Oversized fonts are the root cause of most column word-wrap.
- Working sizes on a 1× canvas: table body ≈ **8.5–9pt**, section headers ≈ 11–13pt, big stat numerals ≈ 32–36pt.

## 3. Autofit is a lie — deterministic text fit

Every overrun traces back to trusting `fit:"shrink"`. Rules:

1. **Never depend on `fit:"shrink"`.** pptxgenjs emits a bare `<a:normAutofit/>` with no precomputed `fontScale`; LibreOffice ignores it entirely, PowerPoint may or may not apply it. It's a secondary safety only — the primary guarantee is **cap the text length + pick a font that fits at full size**.
2. **Top-anchored text ignores box height.** With `valign:"top"`, bottom padding = container height − content height; to add space, grow the container or shorten the content — shrinking the text box moves nothing.
3. **PowerPoint renders Montserrat wider than LibreOffice.** Cap strings at ~**75–80% of the LibreOffice-fit width** so one line stays one line everywhere. Verify the worst-case viewer.
4. **Truncate the less-important part.** Budget the name (`trunc(name, max(16, 42 − entityTag.length))`) and always append the full ` (Entity)` — don't let the tag fall off long rows.
5. **Table cells can't autofit, and embedded `\n`/tabs balloon row height.** Collapse notes to one clean run (`s.replace(/\s+/g," ").trim()`) before truncating; control table fit only with per-cell `fontSize` + `colW` + `trunc`.
6. **Chips/short labels need `margin: 0` (+ `wrap:false`)** — the default cell inset mid-word-wraps a 4-letter "HIGH" chip.
7. **Bound the headline box** under a big title so a 3-line headline can't collide with the section below.
8. **Measure, don't eyeball.** Render the stress case and crop the exact region (`pdftoppm -r 200` + `sips -c H W --cropOffset top left`). A change that "looks the same" usually did nothing.
9. **Never position text from a computed table bottom.** `addTable` rows render ~2× their nominal `rowH` once cell content wraps, so `y = tableY + rowH × rows` lands notes/keys ON the table (this exact bug shipped in a board-facing deck). Pin note/footnote bands at a **fixed y** near the slide bottom instead.
10. **Bound variable-line cells deterministically.** A roster cell prints at most 3 names + `+N more`; a code list joins on commas instead of one-per-line. Cap the line count at the data layer so row heights are bounded — then the fixed note band from rule 9 is provably safe.
11. **No legends/keys under variable-height tables.** A per-slide color key positioned below a table is an overlay hazard by construction. Either omit the key (colored ● + label cells decode themselves) or anchor it to the slide's fixed footer zone — never to a computed table bottom.

## 4. Layout & color rules

- **Critical rows are maroon `#8C1D2D`**, never the navy header fill (reads as a second header). RYG dot cells keep their own colors on the dark band.
- **Header alignment matches its column's data alignment** — a left-aligned header over centered data reads as sloppy. A one-word header wraps if column width minus cell padding is under the text width — widen the column.
- **Don't pin footers inside short cards** — a bottom-pinned "Target: date" line lands on the body text; fold the date inline into the body instead.
- Severity chips = filled rounded rect (red HIGH / amber MED, white text) + bold title beside + body filling the rest.
- Size callout boxes to the **remaining space above the footer**, not a fixed height.
- **When given a reference deck, replicate its exact structure** — render it, zoom regions, copy the layout. Owners notice deviations.
- **Progress callout convention**: any chart that shades achieved-to-date also **prints the numbers** — `▲ Achieved to date: $X of $Y plan growth (Z%)` (bold navy, blue ▲, optional grey tail), via `achievedCallout` in deck-kit. Per-bar detail uses the same glyph (`▲ $4.5M` under the bar's category label, zero-suppressed — skip when the value formats the same as zero). Shading alone is not a progress story; hover tooltips don't exist on paper.

## 5. Size discipline (the Netlify truncation family)

Streamed function responses on Netlify die near a ~60s wall at wildly variable throughput — big bodies arrive truncated (HTTP 200 but no zip EOCD; PowerPoint demands "repair"). Defenses, all mandatory for generated decks:

- **JSZip defaults to STORE.** Always `generateAsync({ compression: "DEFLATE", compressionOptions: { level: 6 } })` — level 9 costs lambda-seconds for ~1%.
- **Dedupe + prune after assembly** (`deck-kit/pptx-slim.ts`): automizer duplicates cloned slides' media byte-for-byte and keeps every library part; collapse identical media by sha1 and graph-walk from presentation + slides to drop unreachable layouts/media/charts/notes.
- **Layouts must keep their `_rels`** — pruning a kept layout's rels detaches it from its master and the deck renders unthemed/black. (Both hubs have tests asserting this.)
- **The `<a:ext>` regex trap**: it's two elements — extension-list entry AND self-closing geometry extent. Anchor artistic-effect stripping on the extension URI, or the regex devours whole pictures.
- **sips quality is non-linear** (`formatOptions 60` ≈ near-lossless and can GROW a file; ~40 ≈ web quality), and `--resampleHeightWidthMax N` **upscales** smaller images — check dimensions first.
- **EMF rasterization**: LibreOffice *Draw* mis-renders many EMFs; *Impress* is fine. Rasterize via a probe deck (one slide per EMF, explicit bg), render on white and black, difference-matte the alpha (`a = 1 − (white−black)/255`). Swap only if the PNG is smaller and non-empty; big vector swirls rasterize bigger — keep them.
- **Always EOCD-check** any generated/downloaded deck (`PK\x05\x06` in the last 1KB) — `scripts/render-verify.mjs` does this first.
- If generation itself can exceed the streamed cap, move it to a **background function + 202 + poll** (see llm/ streaming notes — same pattern).

## 6. Multi-deck merges (pptx-automizer 0.8.x)

- **Template-key mismatch is silent**: `addSlide(name, n)` resolves against the `.load(buf, name)` key; a mismatch clones the *wrong deck's* slide N with no error. Keep the load key identical to the catalog's `source.deck` value.
- **Per-slide media copy misses the 2nd deck**: images in groups, SVG fallbacks, and EMF/JPEG fills don't copy, and the 2nd deck's `imageN.ext` numbers collide with the 1st's. Fix in the build: renumber the 2nd deck's media (+1000, rewriting every rels Target), then after assembly backfill any referenced-but-missing media from the source decks (+ content-type defaults). Merge once into a single self-consistent library; runtime only ever clones from that library.
- **`slideN.xml` filenames are NOT presentation order** — read `presentation.xml` `sldIdLst` → `presentation.xml.rels` for true order.

## 7. Render-verify workflow (every deck change)

1. Write a throwaway `_render-<deck>.ts` that builds a **stress fixture** deck (long names/notes, many critical rows, empty states) to a scratch dir. Short fixtures hide the overruns real data hits.
2. `node scripts/render-verify.mjs <deck>.pptx` — EOCD check → LibreOffice PDF → per-slide PNGs (NB pdftoppm names `-1.png` under 10 pages, `-01.png` from 10).
3. Read the PNGs; crop suspect regions at high dpi to prove fixes moved pixels.
4. A clean LibreOffice render ≈ opens clean in PowerPoint, **except text width** (§3.3) — keep the char caps conservative.
5. Delete the throwaway render script before committing.

## 8. docx / xlsx siblings

- Same brand constants (navy `0F1263`, blue `009DDD`, Montserrat — or the app's entity via `docxBrand(entity)` / `headerFill(entity)`) — pull them from one shared helper, don't re-declare per exporter file.
- docx guides use the bookmarked-outline Contents (`docs-kit/guide-contents.mjs`), never a Word TOC field (fields render blank until the reader accepts an update prompt).
- When asserting on XML-serialized output in tests, XML-escape the needles (`&` → `&amp;`).
- xlsx: prefer formula-live cells over baked values when the analyst will edit the sheet; keep chart metadata (units, targets) in the KPI/content library so app dashboards and workbook exports stay in step.
