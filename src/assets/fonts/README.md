# Site fonts

Berkeley Mono is the main typeface. OCR-B is used only for navigation and small
section headings. These commercial font files are not included in the repository.
Use files with a license that permits web embedding.

Add static WOFF2 files in this directory with these names:

- `BerkeleyMono-Regular.woff2` — body text (400)
- `BerkeleyMono-Bold.woff2` — names and bold text (700)
- `BerkeleyMono-Italic.woff2` — italic text (400, optional)
- `BerkeleyMono-BoldItalic.woff2` — bold italic text (700, optional)
- `OCRB-Regular.woff2` — accent text (400)

`src/components/Fonts.astro` includes available files automatically at build time.
Restart the development server after adding files, or rebuild for deployment.
No CSS changes are needed. Files must be actual WOFF2 fonts, not renamed OTF/TTF
files. Variable font files need matching weight-range declarations instead.

Until the files are available, the site tries locally installed copies of these
fonts, then the system monospace fallbacks defined in `tailwind.config.mjs`.
It does not request missing font files or use a third-party font service.
