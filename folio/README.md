# PDF Folio

PDF Folio is a private, browser-local PDF editor built with React, TypeScript, Vite, and MuPDF.js. It detects existing text spans and image instances, renders the original PDF at high fidelity, applies targeted content redactions, embeds replacement fonts and images, and exports a rewritten PDF without sending the document to a server.

Large personal font libraries can be added with **Import font folder**. Extract RAR or ZIP archives first, then choose the extracted folder in the browser. PDF Folio reads bounded OpenType metadata slices, keeps browser `File` references rather than loading every font into memory, and loads a font’s bytes only when that face is selected. The library lasts for the current browser session and is never uploaded.

## Run locally

```bash
npm install
npm run dev
```

The development server uses `http://localhost:5173`.

```bash
npm test
npm run build
npm run preview
```

`npm test` covers text removal and extraction, exact embedded-subset font reuse, missing-subset-glyph refusal, retained-font cleanup between imports, explicit replacement fonts, unchanged layout, annotation and link preservation, repeated image instances, moved replacement text, uploaded Unicode font embedding, and rotated/cropped page safety. `npm run build` creates the static site in `dist/`.

## What editing means

- Existing horizontal text spans are selected from MuPDF structured text. Export permanently removes the selected source content with a targeted redaction and bakes the replacement into page content.
- Existing unmasked, unclipped, axis-aligned images can be replaced, moved, resized, or deleted. PDF Folio stores each detected instance separately so editing one repeated image does not intentionally change the others.
- Unchanged page content remains untouched by the edit pipeline. Existing annotations, links, form widgets, and unapplied redaction annotations are detached during PDF Folio's bake step and restored before the final full rewrite.
- Custom TTF and OTF uploads remain in the current browser session. Fonts used by an edit are embedded in the exported PDF.
- Undo and redo store operation snapshots; the opened source bytes are never overwritten.

## Honest limits

- Scanned pages are detected, but PDF Folio does not perform OCR. Text inside a scan is not selectable.
- Rotated pages and rotated, vertical, mirrored, masked, clipped, overlapping, or otherwise complex objects are view-only when editing could damage layout or the wrong layer.
- The inspector defaults to the exact original font when the PDF exposes a safely reusable embedded font resource or one of the 14 standard PDF base fonts. Embedded subsets accept only glyphs present in that subset; PDF Folio blocks unsupported characters and asks for a matching TTF/OTF or an explicit replacement. Type 3 fonts, malformed/unsupported CMaps, and non-embedded nonstandard fonts require an explicitly chosen replacement.
- Local fonts are matched to PDF text only when one imported file has the same internal PostScript name. Multiple files with that name remain available for explicit selection but are not chosen automatically. OS/2 restricted, bitmap-only, and no-subsetting flags are rejected because the export engine cannot honor those embedding constraints safely.
- Importing a local font does not grant redistribution or embedding rights. PDF Folio does not ship the user’s private font collection; users remain responsible for the licenses of fonts they select for an export.
- PDF text is drawn object by object. Complex shaping, unusual encodings, and advanced bidirectional layouts may require a suitable uploaded font and can still be unsuitable for direct editing.
- The browser file limit is 150 MB. Large or image-heavy documents may still require substantial memory.
- Password-protected PDFs require the correct password. Passwords and document bytes stay in browser memory.

## Licensing

PDF Folio is distributed under the GNU Affero General Public License v3 or later. The complete license is in [LICENSE](./LICENSE), and the corresponding application source is published at [github.com/blaporta1/pdf-folio](https://github.com/blaporta1/pdf-folio). The repository includes the lockfile and build instructions needed to reproduce the application bundle.

MuPDF.js and MuPDF are copyright Artifex Software and are also available under the GNU Affero General Public License v3 or later. PDF Folio currently locks MuPDF.js 1.28.1. Artifex offers commercial licensing for deployments that do not comply with the AGPL. See [MuPDF licensing](https://www.mupdf.com/licensing/index.html), the [MuPDF.js source repository](https://github.com/ArtifexSoftware/mupdf.js), and the [MuPDF source repository](https://cgit.ghostscript.com/mupdf.git/).

The 18 bundled font families are sourced from Google Fonts and distributed under the SIL Open Font License 1.1. See [FONT-LICENSES.md](./FONT-LICENSES.md) and `public/fonts/OFL-1.1.txt`.

## Deployment

PDF Folio is a static Vite application. `vercel.json` configures Vercel to run the production build and serve `dist/`. No server-side document handling is required.
