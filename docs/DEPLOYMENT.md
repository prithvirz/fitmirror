# Deployment

`fitmirror/` is a plain static folder — any static host works. No build step exists.

## here.now (current hosting)

```bash
cd fitmirror
~/.hermes/skills/here-now/scripts/publish.sh . --slug floral-lemon-y9f6
# → https://floral-lemon-y9f6.here.now/
```

Notes:
- Requires a here.now API key in `~/.herenow/credentials` for permanent sites.
- `--slug` updates the existing site instead of creating a new one.
- The site sets `cache-control: no-cache`, so updates appear immediately (no hard-refresh needed).

## GitHub Pages

1. Push this repo to GitHub.
2. Repo → **Settings → Pages** → Source: `main` branch, `/ (root)`.
3. Live at `https://<user>.github.io/fitmirror/` in ~1 min.

Or with Actions (`.github/workflows/pages.yml`):

```yaml
name: pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - uses: actions/deploy-pages@v4
        id: deployment
```

## Netlify / Vercel / Cloudflare Pages

Point the deploy at the repo root:

| Setting | Value |
|---------|-------|
| Build command | *(none)* |
| Output directory | `.` or `/` |

## Local

```bash
python3 -m http.server 8080
```

Opening `index.html` via `file://` also works — all API calls go to https endpoints with proper CORS headers.

## Custom domain

On here.now: dashboard → site → Domains → add CNAME per their docs (https://here.now/docs).
On GitHub Pages: Settings → Pages → Custom domain + CNAME file at repo root.

## Things that must NOT change when re-hosting

- Serve over **HTTPS** — `@gradio/client` opens secure WebSockets to HF Spaces; mixed content will be blocked.
- Keep the file at the **root** (`/index.html`) — there are no path-relative assets beyond inline code, but deep links assume root.
