# Troubleshooting

Every failure encountered while building FitMirror, root cause, and fix. Kept verbatim so future debugging starts from evidence, not guesswork.

---

## 1. `❌ cannot write mode RGBA as JPEG`

**Where:** server-side (Hugging Face Space), surfaced through the Gradio client.

**Root cause chain:**
1. Browser sends the upload to a Gradio **ImageEditor** component.
2. Gradio's `convert_and_format_image()` does `im.convert(self.image_mode)` where `image_mode="RGBA"` by default.
3. It then saves the PIL image to cache **using the upload's original extension** (`format=suffix`, derived from filename).
4. JPEG cannot store an alpha channel → `OSError: cannot write mode RGBA as JPEG`.

So this fires for **any** upload whose filename ends in `.jpg/.jpeg` — even if the pixels themselves came from a flat JPEG! Re-encoding to JPEG client-side makes it worse, not better.

**Fix:** always export uploads as **PNG** (canvas → `toBlob(..., "image/png")`, filename `*.png`). PNG supports RGBA natively, so the round-trip never fails.

---

## 2. `AppError: IndexError` on first call

**Root cause:** the Space's handler unconditionally unpacks a mask layer:

```python
person_image, mask = person_image["background"], person_image["layers"][0]
```

Sending `layers: []` (the natural thing for "I don't have a hand-drawn mask") indexes out of range.

**Fix:** send exactly one fully-transparent blank PNG as `layers[0]`. The handler then checks `np.unique(mask)` — a uniform array means "no manual mask", and it falls back to the built-in AutoMasker (DensePose + human parsing).

---

## 3. `You have exceeded your ZeroGPU quota (120s requested vs NNNs left)`

**Where:** Hugging Face ZeroGPU scheduler.

**Meaning:** anonymous/shared quota for this IP is exhausted (or too small for the requested 120 s GPU slot). This is not a bug in your code.

**Fix:** authenticate — create a free HF account, generate a token with **Read** access (https://huggingface.co/settings/tokens), and connect with it:

```js
Client.connect("zhengchong/CatVTON", { hf_token: "hf_..." })
```

Signed-in users get a personal daily ZeroGPU quota. In FitMirror this is the ⚙️ Settings field; the token is stored only in `localStorage`.

---

## 4. Product-link fetching returns nothing / reader errors

**Symptoms:** Jina Reader returns a 404-page markdown, `E002` anti-bot page (Flipkart), or HTTP 4xx/5xx.

**Why:** storefronts actively bot-block; some product URLs are region-gated or dead.

**Handling (by design):**
- The app filters obviously-wrong images (icons, `_SS64_` thumbnails) and tells the user honestly when nothing usable was found.
- Fallback is always available: screenshot/upload the garment image manually.

**Debugging tips:**
```bash
curl -sS "https://r.jina.ai/<product-url>" | grep -o 'https://[^ ]*\.jpg'
```
If Jina shows an anti-bot page, no client-side trick will fix it — rely on the upload path (or self-host a scraper, e.g. Apify).

---

## 5. `gradio_client.exceptions.AppError` with opaque messages

Gradio surfaces server exceptions as bare `AppError(message)` — often just `IndexError` or a PIL error with no stack trace.

**Method that cracked it:** read the Space's actual source before guessing:

```bash
curl -sS "https://huggingface.co/spaces/zhengchong/CatVTON/raw/main/app.py"
```

and inspect the live component wiring:

```bash
curl -sS "https://zhengchong-CatVTON.hf.space/config" | jq '.dependencies[] | select(.api_name=="submit_function")'
curl -sS "https://zhengchong-CatVTON.hf.space/gradio_api/info"     # typed endpoint schema
```

The `/gradio_api/info` schema showed `person_image` was an `EditorData` (with `background/layers/composite`), which revealed both bugs #1 and #2 above.

---

## 6. Results look glitchy (artifacts, warped patterns)

Not a code issue — diffusion-model reality:
- Use a well-lit, front-facing full-body photo, plain background, arms slightly away from body.
- Prefer flat/front garment shots over on-model photos.
- Try cloth type `upper`/`lower` instead of `overall` when relevant.
- Re-roll the seed (every run uses a fresh random seed) — variance between runs is normal.
