# alexlayton-website

Source for my personal website: a short homepage and a resume page.

It is a static site built with [Astro](https://astro.build) and
[Tailwind CSS](https://tailwindcss.com). The homepage has a subtle animated
background: faint topographic contours of a slowly drifting field that bend
toward the cursor.

## Tech stack

- **Astro 5**: static output, no client framework
- **Tailwind CSS 3**: styles, through `@astrojs/tailwind`
- **TypeScript**: the contour background (`src/scripts/gravity-field.ts`)
- **Cloudflare Pages**: hosting

## Project structure

```text
src/
├── assets/fonts/   Optional licensed webfonts (not committed; see below)
├── components/     Nav, social links, fonts, background
├── layouts/        Base page layout
├── pages/          index.astro (homepage), resume.astro
├── scripts/        Contour background animation
└── styles/         Global CSS
```

## Getting started

You need Node.js 20 or later.

```sh
npm ci
npm run dev
```

The development server runs at <http://localhost:4321> and is also available on
your local network.

| Command           | Action                                  |
| ----------------- | --------------------------------------- |
| `npm run dev`     | Start the development server            |
| `npm run build`   | Build the production site into `dist/`  |
| `npm run preview` | Preview the production build locally    |

## Fonts

The site uses Berkeley Mono and OCR-B. These are commercial fonts, so the font
files are not in this repository, and `.gitignore` excludes them. Without them,
the site uses locally installed copies, then system monospace fonts.

To use the fonts, add licensed WOFF2 files to `src/assets/fonts/`. See
[`src/assets/fonts/README.md`](src/assets/fonts/README.md) for the file names.

## Deployment

The site deploys to Cloudflare Pages.

- **Automatic:** each push to `main` runs
  [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It builds the
  site and deploys `dist/` to the `personal` Pages project. The workflow needs
  these repository secrets:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
- **Manual:** run `./deploy.sh` (or `./deploy.sh <project-name>`). This uses
  `wrangler`, which must be logged in to your Cloudflare account.

## License

The source code is available under the [MIT License](LICENSE).

The written content (homepage text, resume details and personal information)
is not covered by the MIT License. All rights to it are reserved. If you fork
this project, replace the content with your own.
