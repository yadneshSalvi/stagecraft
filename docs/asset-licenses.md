# Asset provenance

The eighteen source images in `public/assets/` were generated on October 31, 2026 with OpenAI `gpt-image-2`, high quality, using the account owner’s authorized API access. They depict fictional adults, unbranded garments and an accessory, and a fictional empty theatre. They are original project artwork, not participant photos or a merchant’s real inventory. Publication is authorized; no exclusive copyright or real-person endorsement is implied.

The [machine-readable provenance](../public/assets/provenance.json) records the complete source prompt, model, dimensions, and SHA-256 of each original generated file. These WebP files were copied unchanged. The olive garment is a jacket only; its historical filename `olive-suit.webp` does not assert a two-piece suit.

| Public path                            | Evidence class              | Pixels    | SHA-256                                                            |
| -------------------------------------- | --------------------------- | --------- | ------------------------------------------------------------------ |
| `/assets/cast/ada.webp`                | synthetic cast source       | 1024×1536 | `0a08ac0a98da40bffdc81b82c758ebef26369c2c0bc23f11d56291c272e42d19` |
| `/assets/cast/theo.webp`               | synthetic cast source       | 1024×1536 | `7d30da032c23f138754a4b529ddda3829fa40bd76ba5f5c31484ca2dd6c478f9` |
| `/assets/cast/mina.webp`               | synthetic cast source       | 1024×1536 | `46e3700c1802c538e1c60e7e79859b9a38772443bbb9526906c7402be1078997` |
| `/assets/cast/jules.webp`              | synthetic cast source       | 1024×1536 | `499079a0d48bbc9167b72fa30189e5865fff6da58c598e4a8cc211e02ec7a701` |
| `/assets/cast/ruth.webp`               | synthetic cast source       | 1024×1536 | `a8f3981876b6ee49d441707cb19effefdab35ee826c4846a33825dc0601263c0` |
| `/assets/cast/celeste.webp`            | synthetic cast source       | 1024×1536 | `e1a69b8dedee65a70fb7e0c5f6282d20270bfe54794ca5cd7948c716f9603ba7` |
| `/assets/garments/oxblood-coat.webp`   | synthetic garment reference | 1024×1536 | `0dd86d2ee1fcaf76a5a8ce5e45d53e15fa58219421236065da629f4fa2b500e1` |
| `/assets/garments/charcoal-coat.webp`  | synthetic garment reference | 1024×1536 | `9af7b9e3f2cadc3803bf64f096cd8d857dc526f5d916394d33ae8f628f101e73` |
| `/assets/garments/midnight-dress.webp` | synthetic garment reference | 1024×1536 | `7223aaf183aa4bf65da5f178c8a58ba2b0562eeaf2650a7eb9a7192e41529ad4` |
| `/assets/garments/ivory-shirt.webp`    | synthetic garment reference | 1024×1536 | `cbd54328d71dfa6a1a7508fa538b455a2ae5f943a7bf7742a0cad4638adc2be4` |
| `/assets/garments/olive-suit.webp`     | synthetic garment reference | 1024×1536 | `6db70beb190ace662b32424b97a6c8241d33c4ad8000d77a946a3591774b84ea` |
| `/assets/theatre-atmosphere.webp`      | synthetic atmosphere        | 2048×1152 | `1ecbe39f6cd6653772224a152c1138fbb965d21336748b2908b28e3af3e78c64` |
| `/assets/cast/ada-face.webp`           | synthetic face source       | 1024×1280 | `193c0221c36458bb275dcb27c240d6dfd07b8ba0e444cabbba6a024cbd03d03f` |
| `/assets/cast/celeste-face.webp`       | synthetic face source       | 1024×1280 | `1e3d3775c2fa758ccd2def4acec30d81414056d066946e31537658212bcd3277` |

The Ada and Celeste face sources are separate GPT Image 2 edits of their corresponding fictional full-body sources. They are independently versioned captures with exact input hashes and edit prompts in the manifest. They were visually inspected for clear, front-facing adult faces and natural texture; that inspection is not a guarantee of identity preservation or a human study.

## November review wardrobe additions

The burgundy wool coat and rust twill jacket are two new synthetic garment references, generated with the same authorized GPT Image 2 high-quality pipeline on October 31, 2026 UTC (November 1 IST). Their complete prompts and hashes are in the source manifest. They were inspected for a complete front-facing garment, visible fabric, and no person or branding. They represent fictional inventory units; they are not YouCam outputs or evidence of actual availability.

| Public path                           | Pixels    | SHA-256                                                            |
| ------------------------------------- | --------- | ------------------------------------------------------------------ |
| `/assets/garments/burgundy-coat.webp` | 1024×1536 | `cdeb2f24235908a6650a97f40096bcff36ee284afa70520eeb5349f7cd603ac4` |
| `/assets/garments/rust-jacket.webp`   | 1024×1536 | `5cdd36e9958bb824054bfa4c661549552a6f7e023ed6d4e2f8f520b6ead272f8` |

Mina’s additional face source at `/assets/cast/mina-face.webp` is a separately versioned GPT Image 2 edit of `/assets/cast/mina.webp`, created for Mae’s hair-continuity previews. It retains the fictional reference’s short bob and slate crewneck; the complete head and hair are visible. The edit is synthetic source artwork, not an actual hair result. Dimensions: 1024×1280. SHA-256: `58999ac24758ada2ef67a19647b5833368d4b9285e7ba238ed6ac06912cdd5e6`. Its input hash and full edit prompt are recorded in the manifest.

## November review accessory reference

The antique brass oval pendant at `/assets/accessories/brass-pendant.webp` is synthetic source artwork for Nora’s separately approved necklace detail. It was generated with GPT Image 2 at high quality and visually inspected for one complete front-facing necklace, visible chain, and no person or branding. It is not a YouCam output, merchant listing, or evidence of physical stock. Dimensions: 1024×1024. SHA-256: `a94b3f8266e9711db1c47ecfa1317768cb3f86dc47799abc14e917d537f467d1`. The full prompt is retained in the source manifest.

## Frozen provider inputs

The thirteen JPEG files in `public/examples/transports/` are normalized derivatives of the six cast, five garment and two face sources above. They preserve the exact input bytes used by the original YouCam recording runs. They are neither new AI artwork nor additional provider results, and contain no private user uploads.

The [transport manifest](../public/examples/fixture-transports.json) binds each file to its allowlisted source path, original SHA-256, normalization profile, dimensions and transport SHA-256. All sixteen input references across the seven garment and two makeup recordings were checked against those original hashes. Reusing these verified bytes removes runtime re-encoding from example matching without changing the recorded outputs or relaxing their checks. The [freezing script](../scripts/freeze-fixture-transports.ts) performs no provider requests.

## YouCam appearance previews

Actual recorded YouCam garment outputs are listed separately in `public/examples/recorded-previews.json`; independent makeup-detail outputs are listed in `public/examples/recorded-beauty-previews.json`. Both manifests retain exact input/output hashes and sanitized task provenance. The makeup results use separate face sources and explicit zero skin-smoothing and zero lip-morphology settings; these settings do not guarantee unchanged texture or geometry. No full-body/face composite is presented as a single provider output. Those are generated appearance previews, not actual fitting photos, guaranteed identity preservation, physical fit measurements, or supplier confirmations. A source image above is never presented as a completed YouCam render.

## Fonts and icons

Font licenses are retained with the self-hosted font assets. The interface uses open-source Lucide icons; the pinned package carries its ISC license. Refer to the font files’ own licenses for their exact terms.
