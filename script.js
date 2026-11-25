// Willy's Lamps — V5: fixed attachment, articulated original Illustrator chain.
// No generated beads. Every link keeps its original shape and rotation at rest.
const svg = document.querySelector('#logo');
const lampArt = svg.querySelector('.lamp-layout');
const chain = svg.querySelector('#Pull_Cord');
const knob = svg.querySelector('#Knob');
const hit = svg.querySelector('#chain-hit');
const shade = svg.querySelector('#Lampshade');
const button = document.querySelector('#toggle');
const instruction = document.querySelector('.instruction');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const links = Array.from({length: 8}, (_, i) => chain.querySelector(`#Link_${i + 1}`));

// CRITICAL: Illustrator's ellipse elements already have transform="translate(...) rotate(...)".
// GSAP transforms on those same elements would overwrite/recompose their native
// transforms, changing the artwork at rest. Put each ellipse in its own neutral
// <g> and animate ONLY the wrapper, leaving the original ellipse untouched.
const linkWrappers = links.map((link, i) => {
  const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  wrapper.setAttribute('data-motion-wrapper', `Link_${i + 1}`);
  link.parentNode.insertBefore(wrapper, link);
  wrapper.appendChild(link);
  return wrapper;
});
// Separate rotation group for the final link only
const lastLink = links[7];
const lastLinkRotation = document.createElementNS(
  'http://www.w3.org/2000/svg',
  'g'
);
lastLink.parentNode.insertBefore(lastLinkRotation, lastLink);
lastLinkRotation.appendChild(lastLink);
// Original Illustrator centres, from the untouched SVG (SVG coordinate units).
const originalY = [115.5, 123.19, 130.5, 138.42, 144.82, 152.9, 159.59, 167.26];
const topY = originalY[0];
const bottomY = originalY[originalY.length - 1];

// Experiment with these values if you'd like a looser or tighter feel.
const MAX_POINTER_DOWN = 26;    // how far the user's pointer can tug down
const MAX_POINTER_SIDE = 105;    // horizontal travel: wider than V4
const MAX_CHAIN_DOWN = 25;      // slight visual extension (previously 5)
const MAX_CHAIN_SIDE = 27;      // actual horizontal position of the knob
const ACTIVATE_AT = 19;
const PULLS_PER_FLICKER = 3;

const state = { down: 0, side: 0, swing: 0 };
let activePointer = null;
let start = null;
let currentTheme = false;
let releaseTween = null;
let pullsSinceFlicker = 0;
let flickerTween = null;

function svgPoint(event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(lampArt.getScreenCTM().inverse());
}

function render() {
  // Every link moves according to its ORIGINAL position on the chain.
  // Link 1 has weight zero and stays fixed at its attachment point.
  // Lower links ease towards the draggable knob without scaling their shapes.
  const down = state.down / MAX_POINTER_DOWN * MAX_CHAIN_DOWN;
  const side = state.side / MAX_POINTER_SIDE * MAX_CHAIN_SIDE + state.swing;
  linkWrappers.forEach((wrapper, index) => {
    const t = (originalY[index] - topY) / (bottomY - topY);
    const horizontalWeight = t * t * t; // smooth bend anchored at top
    const verticalWeight = t * t;                 // modest downward give
    gsap.set(wrapper, { x: side * horizontalWeight, y: down * verticalWeight });
  });
  gsap.set(knob, {
  x: side,
  y: down,
  rotation: side * -0.82,
  transformOrigin: '50% 10%'
  });
  gsap.set(hit, { x: side, y: down });

  // Rotate only Link_8 towards Link_7
  const t7 = (originalY[6] - topY) / (bottomY - topY);

  // Relative positions after the existing chain movement
  const dx = side * (1 - Math.pow(t7, 3))
    + (36.75 - 35.95);

  const dy = originalY[7] - originalY[6]
    + down * (1 - Math.pow(t7, 2));

  // Account for the original Illustrator alignment
  const originalAngle = Math.atan2(
    36.75 - 35.95,
    originalY[7] - originalY[6]
  ) * 180 / Math.PI;

  const angle = gsap.utils.clamp(
    -60,
    60,
    -Math.atan2(dx, dy) * 180 / Math.PI + originalAngle
  );

  // Rotate around the BOTTOM of Link_8, not its centre
  lastLinkRotation.setAttribute(
    'transform',
    `rotate(${angle} 36.3 172.45)`
  );

}

function flickerLight() {
  const lamp = document.body;
  const resetFlicker = () => {
    lamp.style.removeProperty('--lamp-intensity');
    lamp.style.removeProperty('--blackout-opacity');
    flickerTween = null;
  };

  flickerTween = gsap.timeline({
    delay: .45,
    defaults: { ease: 'none' },
    onComplete: resetFlicker,
    onInterrupt: resetFlicker
  })
    .set(lamp, { '--lamp-intensity': 1 })
    .to(lamp, { '--lamp-intensity': .18, duration: 0.05 })
    .to(lamp, { '--lamp-intensity': 1, duration: .10 })
    .to(lamp, { '--lamp-intensity': .45, duration: .075 }, '+=.09')
    .to(lamp, { '--lamp-intensity': 1, duration: .18 })
    .set(lamp, { '--blackout-opacity': 1 })
    .call(() => lamp.classList.toggle('cat-revealed'), [], '+=.85')
    .to(lamp, { '--blackout-opacity': 0, duration: .8, ease: 'power2.out' });
}

function toggleLight() {
  flickerTween?.kill();
  currentTheme = !currentTheme;
  document.body.classList.toggle('lit', currentTheme);
  button.setAttribute('aria-pressed', String(currentTheme));
  instruction.textContent = currentTheme
    ? 'Pull again to turn the light off'
    : 'Pull the chain to turn on the light';
  if (!reducedMotion) {
  gsap.fromTo(shade, {
    rotation: -2.5,
    transformOrigin: '50% 5%'
  }, {
    rotation: 0,
    duration: 1.2,
    ease: 'elastic.out(1.2, .25)',
    overwrite: true
  });
  }
}



function release() {
  gsap.killTweensOf(state);

  if (reducedMotion) {
    Object.assign(state, { down: 0, side: 0, swing: 0 });
    render();
    return;
  }

  // Capture the chain's position at the moment of release
  const startSide = state.side;
  const startDown = state.down;

  // Reset the old additional swing
  state.swing = 0;

  // Physics settings
  const damping = 2.2;      // How quickly the swinging dies away
  const frequency = 9;      // How quickly the chain swings
  const duration = 2.8;     // Total settling time

  const motion = { time: 0 };

  releaseTween = gsap.to(motion, {
    time: duration,
    duration: duration,
    ease: "none",

    onUpdate: () => {
      const t = motion.time;

      // One continuous damped pendulum oscillation
      const decay = Math.exp(-damping * t);

      state.side = startSide * decay * (
        Math.cos(frequency * t) +
        (damping / frequency) * Math.sin(frequency * t)
      );

      // The chain retracts upwards smoothly at the same time
      state.down = startDown * Math.exp(-7 * t);

      render();
    },

    onComplete: () => {
      state.side = 0;
      state.down = 0;
      state.swing = 0;
      render();
    }
  });
}



function pullTo(down, side) {
  releaseTween?.kill();
  releaseTween = null;
  gsap.killTweensOf(state);
  state.down = gsap.utils.clamp(0, MAX_POINTER_DOWN, down);
  state.side = gsap.utils.clamp(-MAX_POINTER_SIDE, MAX_POINTER_SIDE, side);
  state.swing = 0;
  render();
}

// Keep a touch that starts on the cord from becoming a page gesture.
hit.addEventListener('touchstart', event => {
  event.preventDefault();
}, { passive: false });

hit.addEventListener('pointerdown', event => {
  if (activePointer !== null) return;
  event.preventDefault();
  activePointer = event.pointerId;
  start = svgPoint(event);
  gsap.killTweensOf(state);
  releaseTween?.kill();
  releaseTween = null;
  hit.setPointerCapture(event.pointerId);
  hit.classList.add('dragging');
});
hit.addEventListener('pointermove', event => {
  if (activePointer !== event.pointerId) return;
  const now = svgPoint(event);
  pullTo(now.y - start.y, now.x - start.x);
});
function finish(event, cancelled = false) {
  if (activePointer !== event.pointerId) return;
  const shouldToggle = !cancelled && state.down >= ACTIVATE_AT;
  activePointer = null;
  hit.classList.remove('dragging');
  if (shouldToggle) {
    toggleLight();
    pullsSinceFlicker += 1;
    if (currentTheme && pullsSinceFlicker >= PULLS_PER_FLICKER) {
      pullsSinceFlicker = 0;
      if (!reducedMotion) flickerLight();
    }
  }
  release();
}
hit.addEventListener('pointerup', event => finish(event));
hit.addEventListener('pointercancel', event => finish(event, true));
hit.addEventListener('lostpointercapture', event => {
  if (activePointer === event.pointerId) finish(event, true);
});
button.addEventListener('click', () => {
  releaseTween?.kill();
  releaseTween = null;
  gsap.killTweensOf(state);
  gsap.to(state, {
    down: MAX_POINTER_DOWN * .8,
    duration: reducedMotion ? 0 : .18,
    ease: 'power2.out',
    onUpdate: render,
    onComplete: () => { toggleLight(); release(); }
  });
});
// Only newly inserted wrapper groups are animated. Original Illustrator ellipse transforms are never touched.
