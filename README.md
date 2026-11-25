# Willy’s Lamps — Version 6 (Illustrator-transform fix)

Open `index.html` using VS Code Live Server. Internet is required to load GSAP from the CDN.

## The bug fixed

The original eight elliptical links have Illustrator `transform` attributes that position and rotate each link. In Version 5, calling `gsap.set()` directly on those ellipses could overwrite/recompose their native transforms, changing the link arrangement even at rest.

Version 6 dynamically wraps each ellipse in a neutral `<g>` and animates only that wrapper. The original ellipse SVG markup, coordinates, path shapes, `transform` attributes, and ordering remain unchanged. At rest the wrappers have no movement. No extra links are generated.

## Behaviour

- Top link fixed (wrapper weight 0)
- Drag sideways/down; lower links follow progressively
- Knob returns with spring easing
- Short tug toggles dark/light mode
- Motion limits are editable near the top of `script.js`

Note: This is still a stylised chain, not a rigid-link physics engine.
