/**
 * Controls for the decorative gravity field. Values that use pixels are based on
 * CSS pixels, so the effect stays consistent across high-density displays.
 */
export const GRAVITY_FIELD_CONFIG = {
  desktopColumns: 60,
  desktopRows: 60,
  mobileColumns: 35,
  mobileRows: 35,
  mobileBreakpoint: 700,
  gravityRadius: 260,
  pull: 0.24,
  wellDepth: 18,
  spring: 0.055,
  damping: 0.82,
  dotSize: 1.2,
  dotOpacity: 0.2,
  centerOpacity: 0.42,
  depthSpread: 1,
  cursorLightRadius: 190,
  cursorLightOpacity: 0.04,
  cursorLightDotBoost: 0.4,
  cursorLightSizeBoost: 0.55,
  maxPixelRatio: 1.5,
} as const;

type Dot = {
  originX: number;
  originY: number;
  originDepth: number;
  x: number;
  y: number;
  depth: number;
  velocityX: number;
  velocityY: number;
  velocityDepth: number;
};

type Pointer = {
  x: number;
  y: number;
  active: boolean;
};

const LIGHT_INK = '#26332c';
const DARK_INK = '#d8e3dc';
const LIGHT_INK_RGB = '38, 51, 44';
const DARK_INK_RGB = '216, 227, 220';

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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function createDots(width: number, height: number): Dot[] {
  const random = seededRandom(0x5e7a11);
  const mobile = width < GRAVITY_FIELD_CONFIG.mobileBreakpoint;
  const columns = mobile ? GRAVITY_FIELD_CONFIG.mobileColumns : GRAVITY_FIELD_CONFIG.desktopColumns;
  const rows = mobile ? GRAVITY_FIELD_CONFIG.mobileRows : GRAVITY_FIELD_CONFIG.desktopRows;
  const dots: Dot[] = [];
  const spacingX = width / Math.max(1, columns - 1);
  const spacingY = height / Math.max(1, rows - 1);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const edgeX = column === 0 || column === columns - 1;
      const edgeY = row === 0 || row === rows - 1;
      const jitterX = edgeX ? 0 : (random() - 0.5) * spacingX * 0.16;
      const jitterY = edgeY ? 0 : (random() - 0.5) * spacingY * 0.16;
      const x = column * spacingX + jitterX;
      const y = row * spacingY + jitterY;
      const depth = (random() * 2 - 1) * GRAVITY_FIELD_CONFIG.depthSpread;

      dots.push({
        originX: x,
        originY: y,
        originDepth: depth,
        x,
        y,
        depth,
        velocityX: 0,
        velocityY: 0,
        velocityDepth: 0,
      });
    }
  }

  return dots;
}

/**
 * Creates an elastic, cursor-driven field of dots. The returned function removes
 * every listener and cancels rendering when the component leaves the page.
 */
export function createGravityField(canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return () => {};

  const ctx = context;
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const printMedia = matchMedia('print');
  const pointer: Pointer = { x: 0, y: 0, active: false };
  let dots: Dot[] = [];
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let ink = dark.matches ? DARK_INK : LIGHT_INK;
  let inkRgb = dark.matches ? DARK_INK_RGB : LIGHT_INK_RGB;
  let frame: number | null = null;
  let resizeFrame: number | null = null;
  let lastTime = 0;
  let pageHidden = document.hidden;
  let disposed = false;

  function resize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    pixelRatio = Math.min(window.devicePixelRatio || 1, GRAVITY_FIELD_CONFIG.maxPixelRatio);
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    dots = createDots(width, height);
  }

  function update(delta: number) {
    const step = Math.min(delta * 60, 2);
    const damping = Math.pow(GRAVITY_FIELD_CONFIG.damping, step);
    const radiusSquared = GRAVITY_FIELD_CONFIG.gravityRadius ** 2;

    dots.forEach(dot => {
      const distanceX = pointer.x - dot.originX;
      const distanceY = pointer.y - dot.originY;
      const distanceSquared = distanceX * distanceX + distanceY * distanceY;
      const gravity = pointer.active
        ? Math.exp(-distanceSquared / radiusSquared)
        : 0;
      const targetX = dot.originX + distanceX * gravity * GRAVITY_FIELD_CONFIG.pull;
      const targetY = dot.originY
        + distanceY * gravity * GRAVITY_FIELD_CONFIG.pull
        + gravity * GRAVITY_FIELD_CONFIG.wellDepth;
      const targetDepth = dot.originDepth - gravity * 0.7;

      dot.velocityX += (targetX - dot.x) * GRAVITY_FIELD_CONFIG.spring * step;
      dot.velocityY += (targetY - dot.y) * GRAVITY_FIELD_CONFIG.spring * step;
      dot.velocityDepth += (targetDepth - dot.depth) * GRAVITY_FIELD_CONFIG.spring * step;
      dot.velocityX *= damping;
      dot.velocityY *= damping;
      dot.velocityDepth *= damping;
      dot.x += dot.velocityX * step;
      dot.y += dot.velocityY * step;
      dot.depth += dot.velocityDepth * step;
    });
  }

  function drawCursorLight() {
    if (!pointer.active || reducedMotion.matches) return;
    const gradient = ctx.createRadialGradient(
      pointer.x,
      pointer.y,
      0,
      pointer.x,
      pointer.y,
      GRAVITY_FIELD_CONFIG.cursorLightRadius,
    );
    gradient.addColorStop(0, `rgba(${inkRgb}, ${GRAVITY_FIELD_CONFIG.cursorLightOpacity})`);
    gradient.addColorStop(0.32, `rgba(${inkRgb}, ${GRAVITY_FIELD_CONFIG.cursorLightOpacity * 0.35})`);
    gradient.addColorStop(1, `rgba(${inkRgb}, 0)`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    drawCursorLight();
    ctx.fillStyle = ink;

    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const centerRadius = Math.hypot(width, height) * 0.3;

    dots.forEach(dot => {
      const depth = (dot.depth + GRAVITY_FIELD_CONFIG.depthSpread)
        / (GRAVITY_FIELD_CONFIG.depthSpread * 2);
      const distanceFromCenter = Math.hypot(dot.x - centerX, dot.y - centerY);
      const peripheralVisibility = clamp(
        distanceFromCenter / centerRadius,
        GRAVITY_FIELD_CONFIG.centerOpacity,
        1,
      );
      const lightDistanceX = dot.x - pointer.x;
      const lightDistanceY = dot.y - pointer.y;
      const lightDistanceSquared = lightDistanceX * lightDistanceX + lightDistanceY * lightDistanceY;
      const lightInfluence = pointer.active
        ? Math.exp(-lightDistanceSquared / (GRAVITY_FIELD_CONFIG.cursorLightRadius ** 2))
        : 0;
      // The resting field is uniform. Only the local cursor influence can
      // enlarge a dot, which keeps the surrounding grid visually consistent.
      const radius = GRAVITY_FIELD_CONFIG.dotSize
        * (1 + lightInfluence * GRAVITY_FIELD_CONFIG.cursorLightSizeBoost);
      const alpha = GRAVITY_FIELD_CONFIG.dotOpacity
        * (0.58 + depth * 0.42)
        * peripheralVisibility
        * (1 + lightInfluence * GRAVITY_FIELD_CONFIG.cursorLightDotBoost);

      ctx.globalAlpha = alpha;
      if (radius < 1.2) {
        ctx.fillRect(dot.x - radius * 0.5, dot.y - radius * 0.5, radius, radius);
      } else {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  function render(now: number) {
    if (disposed || pageHidden || printMedia.matches || reducedMotion.matches) return;
    const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0;
    lastTime = now;
    update(delta);
    draw();
    frame = requestAnimationFrame(render);
  }

  function start() {
    if (disposed || pageHidden || printMedia.matches || reducedMotion.matches || frame !== null) return;
    lastTime = performance.now();
    frame = requestAnimationFrame(render);
  }

  function sync() {
    stop();
    if (disposed || pageHidden || printMedia.matches) return;
    resize();
    draw();
    start();
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch' || reducedMotion.matches) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  }

  function onPointerLeave() {
    pointer.active = false;
  }

  function onVisibilityChange() {
    pageHidden = document.hidden;
    if (pageHidden) stop();
    else sync();
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
    inkRgb = dark.matches ? DARK_INK_RGB : LIGHT_INK_RGB;
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
    window.removeEventListener('pointerleave', onPointerLeave);
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
  window.addEventListener('pointerleave', onPointerLeave, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  dark.addEventListener('change', onThemeChange);
  reducedMotion.addEventListener('change', sync);
  printMedia.addEventListener('change', onPrintChange);

  sync();
  return dispose;
}
