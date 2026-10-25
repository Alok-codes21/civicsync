# Local detector execution verification

Verified 26 October 2026 on the frontend-integration branch. Hosting is deferred, not deployed. This records actual execution, not an accuracy benchmark.

## Reproduce

1. `npm ci` and `npm run build:web` on Node22/24.
2. `npm run setup:detector` downloads the pinned87,333,629-byte quantized ONNX file, verifies SHA256 and stores it in ignored `models/`.
3. `node --test test/detector.cjs` checks model load/inference and fail-closed/explicit-off behavior.
4. `npm --prefix frontend run test:model-enabled` starts synthetic in-memory backend/frontend, logs in, submits a case, uploads an actual PNG file, executes ONNX and checks the returned experimental model signal is visible in the mobile UI.
5. `npm run start:integrated:ai` sets up weights if needed and starts the same-origin integrated app. Normal start also uses verified weights when already present. `AI_DETECTOR=off` disables it.

## Observed results

- Download size87,333,629 and SHA256 `11a8189f453b9bd7f3bbb6527f8aa5a116e6b6559ca933951ed434abf6ac8d95` matched the pinned provenance record.
- Detector suite4/4 pass,0skip; full backend151/151 pass,0skip. Frontend integration suite passes with optional model weights installed. Normal parity test explicitly disables inference; separate model-enabled test requires real weights and fails if missing.
- Actual authenticated PNG upload returned `available:true`, model `capcheck_CIFAKE_ViT_quantized`, correct pinned revision, finite class score, `calibrated:false`, civic accuracy null, `human_review`, and `AI_MODEL_SCORE_UNVALIDATED`. UI screenshot inspected, width390, no overflow. Synthetic constant-color fixture score0.9685900476843992 is not a measure of accuracy.
- Additional JPEG inference on existing repository hero asset returned finite score0.8853054504599706. That asset has no verified real/fake label, so this is format/execution evidence only.
- No auto-rejection or automatic case resolution. Backend logic/schema unchanged. No paid inference API used. Images remain with the local server; only public model weights download externally.

## Source checks and limits

Pinned model metadata maps index0 REAL, index1 FAKE,224x224 RGB, rescale1/255, mean/std0.5. Local code uses this label mapping and normalization. The resize kernel has not been numerically compared against a Python reference; raw scores are experimental, not calibrated probabilities of authenticity.

Sources inspected:
- https://huggingface.co/onnx-community/ai-image-detection-ONNX
- https://huggingface.co/onnx-community/ai-image-detection-ONNX/raw/e3cfe99f2841930a040a6281682c10c989965603/config.json
- https://huggingface.co/onnx-community/ai-image-detection-ONNX/raw/e3cfe99f2841930a040a6281682c10c989965603/preprocessor_config.json

The model card says CIFAKE/older generators, compression and domain bias, false positives and negatives, and no consequential decisions without human review. No labelled municipal-photo benchmark or measured accuracy is claimed. Hosting RAM/CPU capacity must be verified separately; local inference does not establish fit on a free512MB service. Model weights are deliberately ignored in Git, so another checkout must run setup before it is enabled.
