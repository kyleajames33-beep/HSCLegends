# Art production in this workspace

Checked 18 November 2026 against the callable tools and saved arena masters.

| Capability | What we can verify |
|---|---|
| Still images | We use the built-in `image_gen.imagegen`. Its interface exposes neither the underlying image model/version nor a maximum resolution. There is no output-size parameter. Past original PNGs include 1254 × 1254, 1672 × 941 and 2172 × 724. These are observed sizes. |
| Transparency | `transparent_background: true` requests a cutout. Inspect the PNG alpha channel and check the exported WebP against the actual floor. |
| References and edits | Pass local files in order through `referenced_image_paths`. The schema gives no numeric cap for this list. With recent chat images, `num_last_images_to_include` accepts up to five. Choose one reference mechanism per call. |
| Animation | Round 2 produced four north-facing walk poses in a single 2 × 2 atlas. Shared crops and pivots preserve registration at export. The tool has no seed, skeleton or temporal consistency control. Review pose progression and silhouette at display size. |
| Video and sound | Separate OpenArt tools expose asynchronous video generation. AI Voice Generator exposes text-to-speech. Simple synthetic game cues can also be rendered locally as WAV samples. The built-in still-image tool returns an image. |
| Usage | The built-in image interface exposes no price, credit balance, rate limit or remaining quota. Generation can take minutes. Reuse approved masters for crops, sizing and review sheets. Connector billing and entitlements are separate and unverified here. |

For consistent characters, supply the approved design and camera/style images, name their roles in the prompt, and specify fixed anatomy, palette, lighting and orientation. Keep original PNGs and the prompt. Generate related walk poses together, register their frames to the idle, then compare the final sizes side by side. Check contrast, alpha edges and padding after WebP export.

The existing operative PNGs and walk atlases already exceed 192px. The current tool interface supplies no evidence of an image-model or small-sprite quality improvement that warrants a v2 remaster.
