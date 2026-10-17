# Finetuna visual identity

Approved 2026-10-17: a horizontal chrome tuna replaces the jumping blue fish.
The silver, graphite, and pearl palette distinguishes Finetuna from MediaTuna
(blue) and ArchiveTuna (muted bronze). Etched circuits and metallic pixels
suggest runtime tuning and GPU performance.

## Assets and consumers

- Canonical transparent PNG: site/static/logo.png (1774 × 887).
- Site header and social preview: filepress.config.ts references /logo.png.
- README: https://finetuna.net/logo.png, so GitHub and npm can load the image
  without including the private site package in the npm tarball.
- Catalyst Forge shelf: static/media/projects/finetuna.png in that checkout,
  copied byte-for-byte from the approved illustration.
- Browser icon: site/static/favicon.svg, a small horizontal silver/graphite
  vector silhouette that stays legible at favicon size, with a matching 64px
  PNG fallback rendered from that vector at site/static/favicon.png.

The header sizing follows the new horizontal proportions. Site color accents
remain unchanged. The source illustration was generated with the built-in
image-generation tool; no further raster edits were applied.

Ship Finetuna and Catalyst Forge to publish their assets. Push the README for
GitHub; the next normal npm release includes the README addition. Ship the site
before publishing the README so its image URL serves the approved design.

## Generation prompt

Use case: logo-brand.
Asset type: FineTuna brand illustration concept, preview only.
Input image 1 (the diagonal jumping tuna) is a reference for the CURRENT FineTuna identity. Input image 2 (the horizontal blue pixel tuna) is a FAMILY STYLE reference from sibling MediaTuna. Neither image is an edit target; create a fresh FineTuna concept.
Primary request: a chrome/metallic tuna instead of the current jumping fish. It should look related to MediaTuna and ArchiveTuna through its recognizable tuna silhouette and restrained digital detail, while having its own unmistakable monochrome metal identity.
Subject and composition: one complete tuna swimming horizontally and facing left, calm, streamlined, confident, shown side-on. Full head, fins and crescent tail visible, safe padding, roughly 2:1 landscape composition, fish fills most of the canvas. Strong clean silhouette readable at shelf-thumbnail size.
Materials and palette: brushed titanium and satin silver on broad surfaces, selected polished chrome edge highlights, graphite and charcoal reflections, pearl-white light areas. Neutral achromatic metal, absolutely no blue or copper/gold color cast. Precise and beautifully finished rather than glittery or aggressively glossy. A sculptural metallic tuna with believable anatomy and a small dark eye, not a robotic character.
FineTuna tests and tunes local AI model runtime settings for the user's GPU; evoke precision and performance subtly. The rear third of the body transitions into a controlled, sparse grid of small metallic tiles/pixels, with very fine circuit-like etched lines integrated into a few rear-body surfaces. Keep the fish largely solid and avoid a busy explosion of squares. No inset cards or separate icons. No photos, music, archive drawings, graphs, text, letters, numbers, gauges, chips floating beside the fish, gears, cables, bolts, water, splash, motion streaks, or jumping pose.
Style: polished premium brand illustration combining the natural-history detail of the tuna family with restrained machined-metal surfaces. No wordmark, badge, enclosing shape, background, pedestal, ground plane, cast shadow, or watermark. True alpha transparency and clean production-quality edges.
