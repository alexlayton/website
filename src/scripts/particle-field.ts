/**
 * Decorative background: a lattice of small dots that the cursor pushes away.
 * Each dot is displaced radially from the pointer, strongest nearby and fading
 * to nothing at `forceRadius`. Dots near the pointer are also a little larger
 * and more opaque. Nothing is drawn at the pointer itself.
 *
 * Inspired by https://www.shadertoy.com/view/4dS3Wd. Rendered with WebGL, with
 * the displacement computed in the vertex shader. Distances are in lattice
 * cells, except where noted as CSS pixels.
 */
export const PARTICLE_FIELD_CONFIG = {
  cell: 30,
  mobileCell: 24,
  mobileBreakpoint: 700,
  dotRadius: 1.6, // CSS px, away from the cursor
  nearDotRadius: 2.6, // CSS px, close to the cursor
  forceRadius: 8, // cells; no push beyond this
  maxPush: 1.6, // cells, at the cursor
  falloff: 1.5, // >1 concentrates the push near the cursor
  baseOpacity: 0.13,
  nearOpacity: 0.5,
  pointerEase: 0.12, // 0-1 per frame at 60fps
  strengthEase: 0.08,
  maxPixelRatio: 2,
} as const;

const C = PARTICLE_FIELD_CONFIG;

// Same inks as the rest of the site: near-black on white, pale on dark.
const LIGHT_INK: [number, number, number] = [0x26 / 255, 0x33 / 255, 0x2c / 255];
const DARK_INK: [number, number, number] = [0xd8 / 255, 0xe3 / 255, 0xdc / 255];

const VERTEX = `
attribute vec2 a_index;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_strength;
uniform float u_cell;
uniform float u_dpr;
varying float v_alpha;
varying float v_radius;
varying float v_size;

void main() {
  vec2 home = (a_index + 0.5) * u_cell;
  vec2 delta = home - u_pointer;
  float dist = max(length(delta), 0.0001);
  float d = clamp(dist / (${C.forceRadius.toFixed(1)} * u_cell), 0.0, 1.0);
  float near = pow(1.0 - d, ${C.falloff.toFixed(2)}) * u_strength;

  vec2 pos = home + delta / dist * near * ${C.maxPush.toFixed(2)} * u_cell;
  vec2 clip = pos / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);

  float radius = mix(${C.dotRadius.toFixed(2)}, ${C.nearDotRadius.toFixed(2)}, near);
  gl_PointSize = (radius * 2.0 + 2.0) * u_dpr;
  v_alpha = mix(${C.baseOpacity.toFixed(3)}, ${C.nearOpacity.toFixed(3)}, near);
  v_radius = radius * u_dpr;
  v_size = gl_PointSize;
}
`;

const FRAGMENT = `
precision mediump float;
uniform vec3 u_color;
varying float v_alpha;
varying float v_radius;
varying float v_size;

void main() {
  float d = length(gl_PointCoord - 0.5) * v_size;
  float a = (1.0 - smoothstep(v_radius - 0.75, v_radius + 0.75, d)) * v_alpha;
  gl_FragColor = vec4(u_color * a, a);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** Starts the background. The returned function removes all listeners. */
export function createParticleField(canvas: HTMLCanvasElement): () => void {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return () => {};

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return () => {};
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn(gl.getProgramInfoLog(program));
    return () => {};
  }
  gl.useProgram(program);

  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const u = {
    resolution: uniform('u_resolution'),
    pointer: uniform('u_pointer'),
    strength: uniform('u_strength'),
    cell: uniform('u_cell'),
    dpr: uniform('u_dpr'),
    color: uniform('u_color'),
  };
  const attribute = gl.getAttribLocation(program, 'a_index');
  const buffer = gl.createBuffer();
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const dark = matchMedia('(prefers-color-scheme: dark)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, strength: 0, target: 0, seen: false };
  let count = 0;
  let cell: number = C.cell;
  let width = 1;
  let height = 1;
  let dpr = 1;
  let frame: number | null = null;
  let resizeFrame: number | null = null;
  let last = 0;
  let disposed = false;

  function resize() {
    resizeFrame = null;
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, C.maxPixelRatio);
    cell = width < C.mobileBreakpoint ? C.mobileCell : C.cell;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    gl!.viewport(0, 0, canvas.width, canvas.height);

    const columns = Math.ceil(width / cell);
    const rows = Math.ceil(height / cell);
    const data = new Float32Array(columns * rows * 2);
    let i = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        data[i++] = x;
        data[i++] = y;
      }
    }
    count = columns * rows;
    gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
    gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
    gl!.enableVertexAttribArray(attribute);
    gl!.vertexAttribPointer(attribute, 2, gl!.FLOAT, false, 0, 0);
    draw();
  }

  function draw() {
    if (disposed) return;
    const ink = dark.matches ? DARK_INK : LIGHT_INK;
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.uniform2f(u.resolution, width, height);
    gl!.uniform2f(u.pointer, pointer.x, pointer.y);
    gl!.uniform1f(u.strength, pointer.strength);
    gl!.uniform1f(u.cell, cell);
    gl!.uniform1f(u.dpr, dpr);
    gl!.uniform3f(u.color, ink[0], ink[1], ink[2]);
    gl!.drawArrays(gl!.POINTS, 0, count);
  }

  function tick(now: number) {
    frame = null;
    const dt = Math.min((now - last) / (1000 / 60), 4);
    last = now;
    const ease = (rate: number) => 1 - Math.pow(1 - rate, dt);
    pointer.x += (pointer.targetX - pointer.x) * ease(C.pointerEase);
    pointer.y += (pointer.targetY - pointer.y) * ease(C.pointerEase);
    pointer.strength += (pointer.target - pointer.strength) * ease(C.strengthEase);
    const settled =
      Math.abs(pointer.targetX - pointer.x) < 0.1 &&
      Math.abs(pointer.targetY - pointer.y) < 0.1 &&
      Math.abs(pointer.target - pointer.strength) < 0.002;
    if (settled) {
      pointer.x = pointer.targetX;
      pointer.y = pointer.targetY;
      pointer.strength = pointer.target;
    }
    draw();
    if (!settled) schedule();
  }

  function schedule() {
    if (frame === null && !disposed && !document.hidden) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  function onMove(event: PointerEvent) {
    if (reducedMotion.matches) return;
    pointer.targetX = event.clientX;
    pointer.targetY = event.clientY;
    if (!pointer.seen) {
      // First contact: appear in place instead of sweeping in from the corner.
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.seen = true;
    }
    pointer.target = 1;
    schedule();
  }

  function onLeave() {
    pointer.target = 0;
    schedule();
  }

  function onTouchEnd(event: PointerEvent) {
    if (event.pointerType === 'touch') onLeave();
  }

  function onResize() {
    if (resizeFrame === null) resizeFrame = requestAnimationFrame(resize);
  }

  function onVisibility() {
    if (document.hidden) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    } else {
      schedule();
    }
  }

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onTouchEnd, { passive: true });
  window.addEventListener('pointercancel', onTouchEnd, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('blur', onLeave);
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);
  dark.addEventListener('change', draw);

  resize();

  return () => {
    disposed = true;
    if (frame !== null) cancelAnimationFrame(frame);
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onTouchEnd);
    window.removeEventListener('pointercancel', onTouchEnd);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('blur', onLeave);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    dark.removeEventListener('change', draw);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  };
}
