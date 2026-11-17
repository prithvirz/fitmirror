# Architecture

FitMirror is a **single static HTML file** with no backend. All intelligence comes from two free third-party services called directly from the browser.

## Components

| Component | Technology | Role |
|-----------|-----------|------|
| UI | Vanilla HTML/CSS/JS (`index.html`) | 3-step wizard: garment → person → result |
| Link fetcher | `https://r.jina.ai/<url>` (Jina Reader) | Returns page as markdown incl. image URLs; CORS-enabled so the browser can call it directly |
| Try-on engine | Hugging Face Space `yisol/IDM-VTON` via `@gradio/client` | IDM-VTON diffusion model on ZeroGPU |

## Data Flow

### 1. Garment acquisition
```
user pastes URL
   │
   ▼
fetch("https://r.jina.ai/" + url)          # markdown of product page
   │
   ▼
regex over markdown for image URLs          # jpg/jpeg/png/webp
   │  filter: drop icons, sprites, _SS64_ thumbnails
   │  keep: media-amazon.com/images/I/, rukmin*, flixcart, myntra hosts
   ▼
render candidate thumbnails → user picks one
   │
   ▼
fetch image bytes (CORS) → canvas re-encode → PNG File
   └── on CORS/decode failure: fall back to passing raw URL to the API
```

### 2. Person photo
Any uploaded image is decoded with `createImageBitmap`, drawn on a white-filled canvas (max side 1536 px), exported as PNG. This guarantees:
- no transparency-related server errors,
- reasonable upload size.

### 3. Try-on call
```js
client.predict("/tryon", [
  { background: handle_file(personPng), layers: [], composite: null },
  handle_file(garmentUrlOrFile),
  "a garment",         // garment description
  true,                // auto-mask the person
  false,               // no crop
  30,                  // denoise steps
  randomSeed,          // 0..9999, re-rolled every run
])
```

The result is a list of Gradio `FileData`. The first item is the try-on image; it is scanned for a `url` and rendered into `<img id="resultImg">`.

## The IDM-VTON API contract

The Space `yisol/IDM-VTON` exposes the named endpoint `/tryon` (`view_api()` lists: dict editor, `garm_img`, `garment_des`, `is_checked`, `is_checked_crop`, `denoise_steps`, `seed`). `layers: []` is accepted, and `is_checked=true` turns on automatic masking.

Engine history: the app first used `zhengchong/CatVTON`. That Space went into `RUNTIME_ERROR` (2026-11), so FitMirror moved to IDM-VTON. Tested end to end in a headless browser (about 20 s per try-on, no token needed).

Limit: IDM-VTON is tuned for tops and upper-body garments.
## Quota & auth

IDM-VTON runs on **ZeroGPU**. Anonymous clients share a small daily pool and frequently hit
`You have exceeded your ZeroGPU quota (120s requested vs Ns left)`.

Mitigation: users paste a personal HF token (`Read` scope). `Client.connect("yisol/IDM-VTON", { hf_token })` authenticates the WebSocket and draws from the user's own quota. The token lives in `localStorage` only and is transmitted exclusively to huggingface.co.

## Failure modes & fallbacks

| Failure | Detection | Fallback |
|---------|-----------|----------|
| Reader blocked / no images found | empty candidate list | user uploads garment manually |
| CORS blocks product-image bytes | fetch throws | pass raw URL to Gradio (server-side fetch) |
| ZeroGPU quota exhausted | error message match `/quota/i` | prompt to add HF token |
| Invalid HF token | `/login\|auth/i` match | prompt to re-check token |
