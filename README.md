# Giti dotcode

An interactive 3D product page for the GitiSport S2 tire, built with three.js and React Three Fiber
from the original Cinema 4D / Redshift scene.

- `index.html`: the tire website. Scroll, use the arrow keys or drag to roll the tire; the yellow
  callouts explain the markings on the sidewall.
- `playground.html`: a physics playground (drive, jump and knock over Giti elephants).

## Develop

```sh
npm install
npm run dev
```

`npm run build` writes the static site to `dist/`. Every push to `main` deploys it to GitHub Pages
(`.github/workflows/pages.yml`).

Add `?tune` to the website's address for the look-dev panel (lights, HDRI, shadow, tone mapping,
materials); its "Copy settings" output goes into `src/site/tuning.js`.

## Assets

`public/` holds the web-ready model, textures, HDRI and the Redshift-baked floor shadow.
`scripts/optimize-assets.mjs` regenerates them from the Cinema 4D export, which is not part of this
repository.
