# D1 Studio website

This directory contains the dependency-free static site published at <https://magnusopera.github.io/d1studio/>.

```sh
npm ci
npm run build
npm run serve
```

Source files live in `src/`; the ignored `dist/` directory is generated for GitHub Pages.
From the repository root, `make website` builds and serves the site locally.
