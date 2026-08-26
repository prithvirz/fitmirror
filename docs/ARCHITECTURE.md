# Architecture

FitMirror is a **single static HTML file** with no backend. All intelligence comes from two free third-party services called directly from the browser.

## Components

| Component | Technology | Role |
|-----------|-----------|------|
| UI | Vanilla HTML/CSS/JS (`index.html`) | 3-step wizard: garment → person → result |
| Link fetcher | `https://r.jina.ai/<url>` (Jina Reader) | Returns page as markdown incl. image URLs; CORS-enabled so the browser can call it directly |
| Try-on engine | Hugging Face Space `zhengchong/CatVTON` via `@gradio/client` | CatVTON diffusion model on ZeroGPU |

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
client.predict("/submit_function", [
  {
    background: handle_file(personPng),
    layers:    [handle_file(blankTransparentPng)],  // REQUIRED — see below
    composite: null,
  },
  garmentInput,        // handle_file(garmentPng) or raw URL string
  clothType,           // "upper" | "lower" | "overall"
  30,                  // inference steps
  2.5,                 // CFG / guidance scale
  randomSeed,          // 0..9999, re-rolled every run
])
```

The result object contains a Gradio `FileData` whose `.url` points to the generated try-on image; it's scanned recursively and rendered into `<img id="resultImg">`.

## The CatVTON API contract (learned the hard way)

The Space's `submit_function` signature:

```python
def submit_function(person_image, cloth_image, cloth_type,
                    num_inference_steps, guidance_scale, seed, show_type):
    person_image, mask = person_image["background"], person_image["layers"][0]
    mask = Image.open(mask).convert("L")
    if len(np.unique(np.array(mask))) == 1:
        mask = None          # blank layer ⇒ automatic masking (AutoMasker/DensePose)
    ...
```

Consequences:

1. **`layers[0]` is accessed unconditionally** → sending `layers: []` raises `IndexError`. Always send one fully-transparent blank PNG; the server detects its uniformity and switches to auto-masking.
2. **Person image must be an `EditorData` object** (`{background, layers, composite}`), not a plain image — the component is a Gradio `ImageEditor`.
3. **Gradio's ImageEditor pre-processing** converts images to RGBA and re-saves them using the *upload's file extension*. RGBA + `.jpg` ⇒ `OSError: cannot write mode RGBA as JPEG`. Hence all uploads are named/exported as `.png`.

## Quota & auth

CatVTON runs on **ZeroGPU**. Anonymous clients share a small daily pool and frequently hit
`You have exceeded your ZeroGPU quota (120s requested vs Ns left)`.

Mitigation: users paste a personal HF token (`Read` scope). `Client.connect("zhengchong/CatVTON", { hf_token })` authenticates the WebSocket and draws from the user's own quota. The token lives in `localStorage` only and is transmitted exclusively to huggingface.co.

## Failure modes & fallbacks

| Failure | Detection | Fallback |
|---------|-----------|----------|
| Reader blocked / no images found | empty candidate list | user uploads garment manually |
| CORS blocks product-image bytes | fetch throws | pass raw URL to Gradio (server-side fetch) |
| ZeroGPU quota exhausted | error message match `/quota/i` | prompt to add HF token |
| Invalid HF token | `/login\|auth/i` match | prompt to re-check token |
