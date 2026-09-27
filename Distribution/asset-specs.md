# BrandForge Asset Specifications

## Favicon

| Size | Format | Usage | Filename |
|------|--------|-------|----------|
| 16 x 16 | PNG | Browser tab favicon | favicon-16.png |
| 32 x 32 | PNG | Browser tab favicon (high-DPI) | favicon-32.png |
| 180 x 180 | PNG | Apple Touch Icon | apple-touch-icon.png |
| 192 x 192 | PNG | Android Chrome icon | android-chrome-192.png |
| 512 x 512 | PNG | Android Chrome icon (high-DPI) | android-chrome-512.png |

### Favicon design

- BF mark centered in the icon
- Ink (#14171a) background with Ember (#e8571e) BF mark
- No transparency in the 16x16 and 32x16 versions — solid Ink background
- 180x180, 192x192, 512x512 can use transparent background with Ink BF mark
- File size: Under 50KB per icon

## Open Graph image

| Property | Value |
|----------|-------|
| Dimensions | 1200 x 630px |
| Format | PNG |
| File size | Under 1MB |
| Filename | og-image.png |

### Design

- Full-bleed background of Paper (#ece7de)
- BF mark centered, large scale
- Tagline "Describe it. Humans build it." below the mark in serif
- Ember (#e8571e) accent line at the bottom edge
- Ink (#14171a) text for the tagline
- No additional images or photography

## Twitter Card

| Property | Value |
|----------|-------|
| Dimensions | 1200 x 628px |
| Format | PNG |
| File size | Under 1MB |
| Filename | twitter-card.png |

### Design

- Same composition as Open Graph image
- Adjusted for Twitter's slightly different aspect ratio (1200x628 vs 1200x630)
- BF mark, tagline, and accent line in brand colors
- Paper background, Ink text, Ember accent

## Discord server icon

| Property | Value |
|----------|-------|
| Dimensions | 128 x 128px |
| Format | PNG |
| File size | Under 200KB |
| Filename | discord-server-icon.png |

### Design

- BF mark centered
- Ink background with Ember mark
- Square format, no rounded corners
- Must be legible at 128x128px

## Apple Touch Icon

| Property | Value |
|----------|-------|
| Dimensions | 180 x 180px |
| Format | PNG |
| File size | Under 50KB |
| Filename | apple-touch-icon.png |

### Design

- BF mark centered
- Transparent background with Ink mark, or Ink background with Ember mark
- Precomposed (no iOS chrome overlay)
- No rounded corners required

## General asset rules

- All PNG exports use 32-bit color depth unless transparency is explicitly needed
- No compression artifacts. Sharp edges on the BF mark at every size
- Export at 2x resolution where retina support is expected
- Source files (SVG or Figma) are stored in the brandforge-site public assets directory
- Never modify the BF mark. It stays the same at every size
- Brand palette is the only color source. No outside colors in any asset
