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
├── components/     Nav, social links, fonts, background
├── layouts/        Base page layout
├── pages/          index.astro (homepage), resume.astro
├── scripts/        Contour background animation
└── styles/         Global CSS
```

## Getting started

You need [Bun](https://bun.sh).

```sh
bun install
bun run dev
```

The development server runs at <http://localhost:4321> and is also available on
your local network.

| Command           | Action                                  |
| ----------------- | --------------------------------------- |
| `bun run dev`     | Start the development server            |
| `bun run build`   | Build the production site into `dist/`  |
| `bun run preview` | Preview the production build locally    |

## Fonts

The site is set in [Spectral](https://github.com/productiontype/Spectral) (SIL OFL),
self-hosted through `@fontsource/spectral`. No third-party font requests.

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
