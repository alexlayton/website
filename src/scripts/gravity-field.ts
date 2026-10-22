/**
 * Decorative "loss landscape" background: faint topographic contours of a
 * slowly drifting scalar field (a few Gaussian basins and ridges). The cursor
 * adds a softened gravity well (a Plummer potential), so the contours bend
 * and gather around it.
 *
 * Field coordinates use "units", where one unit is the shorter viewport side.
 * Values that use pixels are CSS pixels.
 */
export const GRAVITY_FIELD_CONFIG = {
  // Landscape.
  driftSpeed: 1,
  basinDepth: [0.75, 1.1],
  basinWidth: [0.15, 0.24],
  ridgeHeight: [0.35, 0.6],
  ridgeWidth: [0.12, 0.19],

  // Cursor gravity well.
  cursorMass: 1.15,
  cursorSoftening: 0.07,
  cursorEase: 0.07,

  // Contours.
  contourCell: 14,
  mobileContourCell: 18,
  mobileBreakpoint: 700,
  contourStep: 0.15,
  contourFloor: -2,
  contourOpacity: 0.05,
  indexContourEvery: 4,
  indexContourOpacity: 0.09,

  // Readability: soften the contours behind the content column.
  centerFade: 0.55,
  centerRadius: 0.34,

  maxPixelRatio: 1.5,
} as const;

const C = GRAVITY_FIELD_CONFIG;
const TICK = 1 / 60;

type Source = {
  fx: number;
  fy: number;
  ax: number;
  ay: number;
  wx: number;
  wy: number;
  px: number;
  py: number;
  amplitude: number;
  k: number;
  x: number;
  y: number;
};

const LIGHT_INK = '#26332c';
const DARK_INK = '#d8e3dc';

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function between(random: () => number, [low, high]: readonly [number, number]) {
  return low + (high - low) * random();
}

/** Basins sit near the corners and ridges between them, which makes saddles. */
function createSources(): Source[] {
  const random = seededRandom(0x10557);
  const basins: Array<[number, number]> = [[0.13, 0.24], [0.87, 0.3], [0.18, 0.8], [0.83, 0.78]];
  const ridges: Array<[number, number]> = [[0.5, 0.16], [0.5, 0.88], [0.52, 0.5]];
  const make = (fx: number, fy: number, amplitude: number, sigma: number): Source => ({
    fx: fx + (random() - 0.5) * 0.1,
    fy: fy + (random() - 0.5) * 0.1,
    ax: 0.04 + random() * 0.05,
    ay: 0.04 + random() * 0.05,
    wx: (0.03 + random() * 0.04) * C.driftSpeed,
    wy: (0.03 + random() * 0.04) * C.driftSpeed,
    px: random() * Math.PI * 2,
    py: random() * Math.PI * 2,
    amplitude,
    k: 1 / (2 * sigma * sigma),
    x: 0,
    y: 0,
  });

  return [
    ...basins.map(([x, y]) => make(x, y, -between(random, C.basinDepth), between(random, C.basinWidth))),
    // The central ridge is low and wide so the content column stays calm.
    ...ridges.map(([x, y], index) => make(
      x,
      y,
      between(random, C.ridgeHeight) * (index === 2 ? 0.55 : 1),
      between(random, C.ridgeWidth) * (index === 2 ? 1.5 : 1),
    )),
  ];
}

/**
 * Creates the animated background. The returned function removes every
 * listener and cancels rendering when the component leaves the page.
 */
export function createGravityField(canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return () => {};

  const ctx = context;
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const printMedia = matchMedia('print');
  const sources = createSources();
  const pointer = { x: 0, y: 0, active: false, strength: 0 };
  let grid = new Float32Array(0);
  let gridColumns = 0;
  let gridRows = 0;
  let gridCell: number = C.contourCell;
  let width = 1;
  let height = 1;
  let unit = 1;
  let pixelRatio = 1;
  let ink = dark.matches ? DARK_INK : LIGHT_INK;
  let time = Math.random() * 600;
  let accumulator = 0;
  let frame: number | null = null;
  let resizeFrame: number | null = null;
  let lastTime = 0;
  let pageHidden = document.hidden;
  let disposed = false;

  function valueAt(x: number, y: number) {
    let value = 0;
    for (const source of sources) {
      const dx = x - source.x;
      const dy = y - source.y;
      value += source.amplitude * Math.exp(-(dx * dx + dy * dy) * source.k);
    }
    if (pointer.strength > 0.001) {
      const dx = x - pointer.x / unit;
      const dy = y - pointer.y / unit;
      value -= C.cursorMass * C.cursorSoftening * pointer.strength
        / Math.sqrt(dx * dx + dy * dy + C.cursorSoftening * C.cursorSoftening);
    }
    return value;
  }

  function moveSources() {
    const unitWidth = width / unit;
    const unitHeight = height / unit;
    for (const source of sources) {
      source.x = (source.fx + source.ax * Math.sin(time * source.wx + source.px)) * unitWidth;
      source.y = (source.fy + source.ay * Math.sin(time * source.wy + source.py)) * unitHeight;
    }
  }

  function resize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    unit = Math.min(width, height);
    pixelRatio = Math.min(window.devicePixelRatio || 1, C.maxPixelRatio);
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    gridCell = width < C.mobileBreakpoint ? C.mobileContourCell : C.contourCell;
    gridColumns = Math.ceil(width / gridCell) + 1;
    gridRows = Math.ceil(height / gridCell) + 1;
    grid = new Float32Array(gridColumns * gridRows);
    moveSources();
  }

  function tick() {
    time += TICK;
    moveSources();
    pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * C.cursorEase;
  }

  /** Marching squares over a coarse grid, one path per contour weight. */
  function drawContours() {
    for (let row = 0; row < gridRows; row += 1) {
      for (let column = 0; column < gridColumns; column += 1) {
        grid[row * gridColumns + column] = Math.max(
          valueAt((column * gridCell) / unit, (row * gridCell) / unit),
          C.contourFloor,
        );
      }
    }

    const minor = new Path2D();
    const major = new Path2D();
    const step = C.contourStep;
    const base = C.contourFloor;

    for (let row = 0; row < gridRows - 1; row += 1) {
      for (let column = 0; column < gridColumns - 1; column += 1) {
        const index = row * gridColumns + column;
        const topLeft = grid[index];
        const topRight = grid[index + 1];
        const bottomLeft = grid[index + gridColumns];
        const bottomRight = grid[index + gridColumns + 1];
        const low = Math.min(topLeft, topRight, bottomLeft, bottomRight);
        const high = Math.max(topLeft, topRight, bottomLeft, bottomRight);
        const first = Math.max(Math.ceil((low - base) / step), 1);
        const last = Math.floor((high - base) / step);
        if (first > last) continue;

        const x = column * gridCell;
        const y = row * gridCell;
        const xRight = x + gridCell;
        const yBottom = y + gridCell;
        for (let levelIndex = first; levelIndex <= last; levelIndex += 1) {
          const level = base + levelIndex * step;
          const path = levelIndex % C.indexContourEvery === 0 ? major : minor;
          const state = (topLeft > level ? 8 : 0) | (topRight > level ? 4 : 0)
            | (bottomRight > level ? 2 : 0) | (bottomLeft > level ? 1 : 0);
          if (state === 0 || state === 15) continue;

          const top = x + gridCell * ((level - topLeft) / (topRight - topLeft));
          const bottom = x + gridCell * ((level - bottomLeft) / (bottomRight - bottomLeft));
          const left = y + gridCell * ((level - topLeft) / (bottomLeft - topLeft));
          const right = y + gridCell * ((level - topRight) / (bottomRight - topRight));
          const segment = (ax: number, ay: number, bx: number, by: number) => {
            path.moveTo(ax, ay);
            path.lineTo(bx, by);
          };

          switch (state) {
            case 1: case 14: segment(x, left, bottom, yBottom); break;
            case 2: case 13: segment(bottom, yBottom, xRight, right); break;
            case 3: case 12: segment(x, left, xRight, right); break;
            case 4: case 11: segment(top, y, xRight, right); break;
            case 6: case 9: segment(top, y, bottom, yBottom); break;
            case 7: case 8: segment(x, left, top, y); break;
            case 5:
              segment(x, left, top, y);
              segment(bottom, yBottom, xRight, right);
              break;
            case 10:
              segment(top, y, xRight, right);
              segment(x, left, bottom, yBottom);
              break;
          }
        }
      }
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = ink;
    ctx.globalAlpha = C.contourOpacity;
    ctx.stroke(minor);
    ctx.globalAlpha = C.indexContourOpacity;
    ctx.stroke(major);
  }

  /** Erases part of the contours behind the content so text stays clear. */
  function fadeCenter() {
    const radius = Math.hypot(width, height) * C.centerRadius;
    const gradient = ctx.createRadialGradient(width * 0.5, height * 0.5, 0, width * 0.5, height * 0.5, radius);
    gradient.addColorStop(0, `rgba(0, 0, 0, ${C.centerFade})`);
    gradient.addColorStop(0.55, `rgba(0, 0, 0, ${C.centerFade * 0.6})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }

  function draw() {
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, height);
    drawContours();
    fadeCenter();
    ctx.globalAlpha = 1;
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  function render(now: number) {
    if (disposed || pageHidden || printMedia.matches || reducedMotion.matches) return;
    accumulator += Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    let ticks = 0;
    while (accumulator >= TICK && ticks < 3) {
      tick();
      accumulator -= TICK;
      ticks += 1;
    }
    if (ticks === 3) accumulator = 0;
    if (ticks > 0) draw();
    frame = requestAnimationFrame(render);
  }

  function start() {
    if (disposed || pageHidden || printMedia.matches || reducedMotion.matches || frame !== null) return;
    lastTime = performance.now();
    accumulator = 0;
    frame = requestAnimationFrame(render);
  }

  function sync() {
    stop();
    if (disposed || pageHidden || printMedia.matches) return;
    resize();
    if (reducedMotion.matches) {
      pointer.active = false;
      pointer.strength = 0;
    }
    draw();
    start();
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch' || reducedMotion.matches) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  }

  function onPointerOut(event: PointerEvent) {
    if (!event.relatedTarget) pointer.active = false;
  }

  function onVisibilityChange() {
    pageHidden = document.hidden;
    if (pageHidden) stop();
    else start();
  }

  function onPageHide(event: PageTransitionEvent) {
    pageHidden = true;
    stop();
    if (!event.persisted) dispose();
  }

  function onPageShow() {
    pageHidden = false;
    sync();
  }

  function onResize() {
    if (resizeFrame !== null) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      sync();
    });
  }

  function onThemeChange() {
    ink = dark.matches ? DARK_INK : LIGHT_INK;
    if (!pageHidden && !printMedia.matches) draw();
  }

  function onPrintChange() {
    if (printMedia.matches) stop();
    else sync();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    resizeFrame = null;
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerout', onPointerOut);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    dark.removeEventListener('change', onThemeChange);
    reducedMotion.removeEventListener('change', sync);
    printMedia.removeEventListener('change', onPrintChange);
    ctx.clearRect(0, 0, width, height);
  }

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerout', onPointerOut, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  dark.addEventListener('change', onThemeChange);
  reducedMotion.addEventListener('change', sync);
  printMedia.addEventListener('change', onPrintChange);

  sync();
  return dispose;
}
