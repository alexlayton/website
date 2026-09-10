import * as THREE from 'three';

/**
 * The main visual controls live here so the character of the field is easy to tune.
 * Distances are world units. Opacity values are deliberately low: this layer must
 * support the HTML above it instead of competing with it.
 */
export const NETWORK_BACKGROUND_CONFIG = {
  nodeCount: 84,
  connectionDistance: 3.8,
  connectionNeighbors: 3,
  // This is a multiplier of the camera frustum, not a fixed world-space size.
  networkSpread: 1.34,
  depth: 12,
  movementSpeed: 0.075,
  rotationSpeed: 0.008,
  mouseInfluence: 0.035,
  nodeOpacity: 0.52,
  lineOpacity: 0.16,
  cameraDistance: 12,
  fieldOfView: 42,
  movementAmplitude: 0.14,
  maxPixelRatio: 1.5,
} as const;

type NetworkNode = {
  x: number;
  y: number;
  z: number;
  // Normalized field coordinates let the same network respond to a new frustum.
  normalizedX: number;
  normalizedY: number;
  phase: number;
  speed: number;
  amplitude: number;
};

type Pointer = { x: number; y: number };
type ViewPlaneSize = { width: number; height: number };
type LineData = {
  geometry: THREE.BufferGeometry;
  attribute: THREE.BufferAttribute;
  positions: Float32Array;
};

const TAU = Math.PI * 2;
const LIGHT_COLOR = 0x26332c;
const DARK_COLOR = 0xd8e3dc;

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

function getViewPlaneSize(aspect: number): ViewPlaneSize {
  const fovRadians = THREE.MathUtils.degToRad(NETWORK_BACKGROUND_CONFIG.fieldOfView);
  const height = 2 * Math.tan(fovRadians / 2) * NETWORK_BACKGROUND_CONFIG.cameraDistance;
  return { width: height * aspect, height };
}

function applyFieldBounds(nodes: NetworkNode[], field: ViewPlaneSize) {
  const halfWidth = field.width * NETWORK_BACKGROUND_CONFIG.networkSpread * 0.5;
  const halfHeight = field.height * NETWORK_BACKGROUND_CONFIG.networkSpread * 0.5;
  nodes.forEach(node => {
    node.x = node.normalizedX * halfWidth;
    node.y = node.normalizedY * halfHeight;
  });
}

function makeNodes(field: ViewPlaneSize): NetworkNode[] {
  const random = seededRandom(0x1a2b3c4d);
  const aspect = field.width / Math.max(1, field.height);
  const columns = Math.max(1, Math.ceil(Math.sqrt(NETWORK_BACKGROUND_CONFIG.nodeCount * aspect)));
  const rows = Math.ceil(NETWORK_BACKGROUND_CONFIG.nodeCount / columns);
  const cellWidth = 2 / columns;
  const cellHeight = 2 / rows;
  const nodes: NetworkNode[] = [];

  for (let i = 0; i < NETWORK_BACKGROUND_CONFIG.nodeCount; i += 1) {
    const column = i % columns;
    const row = Math.floor(i / columns);
    // Jittered cells give broad coverage and local irregularity without making
    // one large cluster or leaving random empty sections of the viewport.
    const normalizedX = -1 + (column + 0.5) * cellWidth + (random() - 0.5) * cellWidth * 0.78;
    const normalizedY = -1 + (row + 0.5) * cellHeight + (random() - 0.5) * cellHeight * 0.78;
    nodes.push({
      x: normalizedX,
      y: normalizedY,
      z: (random() - 0.5) * NETWORK_BACKGROUND_CONFIG.depth,
      normalizedX,
      normalizedY,
      phase: random() * TAU,
      speed: 0.72 + random() * 0.48,
      amplitude: NETWORK_BACKGROUND_CONFIG.movementAmplitude * (0.55 + random() * 0.45),
    });
  }

  // Remove the small bias caused by an incomplete final grid row. The graph
  // stays centered on the camera target without needing a group translation.
  const meanX = nodes.reduce((sum, node) => sum + node.normalizedX, 0) / nodes.length;
  const meanY = nodes.reduce((sum, node) => sum + node.normalizedY, 0) / nodes.length;
  nodes.forEach(node => {
    node.normalizedX -= meanX;
    node.normalizedY -= meanY;
  });
  applyFieldBounds(nodes, field);
  return nodes;
}

function makeConnectionPairs(nodes: NetworkNode[]) {
  const pairs: Array<[number, number]> = [];
  const used = new Set<string>();
  const maxDistanceSquared = NETWORK_BACKGROUND_CONFIG.connectionDistance ** 2;

  for (let first = 0; first < nodes.length; first += 1) {
    const candidates: Array<{ index: number; distanceSquared: number }> = [];
    for (let second = 0; second < nodes.length; second += 1) {
      if (first === second) continue;
      const x = nodes[first].x - nodes[second].x;
      const y = nodes[first].y - nodes[second].y;
      const z = nodes[first].z - nodes[second].z;
      candidates.push({ index: second, distanceSquared: x * x + y * y + z * z });
    }
    candidates.sort((a, b) => a.distanceSquared - b.distanceSquared);

    candidates.slice(0, NETWORK_BACKGROUND_CONFIG.connectionNeighbors).forEach(candidate => {
      if (candidate.distanceSquared > maxDistanceSquared) return;
      const low = Math.min(first, candidate.index);
      const high = Math.max(first, candidate.index);
      const key = `${low}:${high}`;
      if (used.has(key)) return;
      used.add(key);
      pairs.push([low, high]);
    });
  }

  return pairs;
}

function makeLineData(pairs: Array<[number, number]>, positions: Float32Array): LineData {
  const linePositions = new Float32Array(pairs.length * 6);
  pairs.forEach(([first, second], index) => {
    const lineOffset = index * 6;
    const firstOffset = first * 3;
    const secondOffset = second * 3;
    linePositions[lineOffset] = positions[firstOffset];
    linePositions[lineOffset + 1] = positions[firstOffset + 1];
    linePositions[lineOffset + 2] = positions[firstOffset + 2];
    linePositions[lineOffset + 3] = positions[secondOffset];
    linePositions[lineOffset + 4] = positions[secondOffset + 1];
    linePositions[lineOffset + 5] = positions[secondOffset + 2];
  });
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(linePositions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  return { geometry, attribute, positions: linePositions };
}

const nodeVertexShader = `
  attribute float a_size;
  varying float v_depth;
  varying float v_peripheralVisibility;
  uniform float u_pixelRatio;
  uniform vec2 u_field_size;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float depth = clamp((-viewPosition.z - 4.0) / 20.0, 0.0, 1.0);
    float centerDistance = max(
      abs(viewPosition.x) / max(0.001, u_field_size.x * 0.5),
      abs(viewPosition.y) / max(0.001, u_field_size.y * 0.5)
    );
    v_depth = 1.0 - depth;
    v_peripheralVisibility = mix(0.38, 1.0, smoothstep(0.14, 0.72, centerDistance));
    gl_PointSize = a_size * u_pixelRatio * (180.0 / max(1.0, -viewPosition.z));
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const nodeFragmentShader = `
  precision mediump float;
  uniform vec3 u_color;
  uniform float u_opacity;
  varying float v_depth;
  varying float v_peripheralVisibility;

  void main() {
    float distanceFromCenter = distance(gl_PointCoord, vec2(0.5));
    float edge = 1.0 - smoothstep(0.28, 0.5, distanceFromCenter);
    float depthOpacity = mix(0.28, 1.0, v_depth);
    gl_FragColor = vec4(u_color, edge * depthOpacity * v_peripheralVisibility * u_opacity);
  }
`;

const lineVertexShader = `
  varying float v_depth;
  varying float v_peripheralVisibility;
  uniform vec2 u_field_size;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float depth = clamp((-viewPosition.z - 3.0) / 21.0, 0.0, 1.0);
    float centerDistance = max(
      abs(viewPosition.x) / max(0.001, u_field_size.x * 0.5),
      abs(viewPosition.y) / max(0.001, u_field_size.y * 0.5)
    );
    v_depth = 1.0 - depth;
    v_peripheralVisibility = mix(0.38, 1.0, smoothstep(0.14, 0.72, centerDistance));
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const lineFragmentShader = `
  precision mediump float;
  uniform vec3 u_color;
  uniform float u_opacity;
  varying float v_depth;
  varying float v_peripheralVisibility;

  void main() {
    float depthOpacity = mix(0.22, 0.82, v_depth);
    gl_FragColor = vec4(u_color, depthOpacity * v_peripheralVisibility * u_opacity);
  }
`;

/**
 * Creates the Three.js network behind the page content.
 * The returned function is useful if the component is removed by a client-side
 * router; normal Astro page navigation also tears down the whole document.
 */
export function initNetworkBackground(background: HTMLElement): () => void {
  const canvas = background.querySelector<HTMLCanvasElement>('canvas');
  if (!canvas) return () => {};

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      depth: true,
      stencil: false,
      powerPreference: 'low-power',
    });
  } catch {
    // The CSS on the component remains as a quiet fallback when WebGL is absent.
    return () => {};
  }

  const dark = matchMedia('(prefers-color-scheme: dark)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const printMedia = matchMedia('print');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    NETWORK_BACKGROUND_CONFIG.fieldOfView,
    1,
    0.1,
    60,
  );
  camera.position.z = NETWORK_BACKGROUND_CONFIG.cameraDistance;
  camera.lookAt(0, 0, 0);

  let width = Math.max(1, background.clientWidth || window.innerWidth);
  let height = Math.max(1, background.clientHeight || window.innerHeight);
  let pixelRatio = 1;
  let field = getViewPlaneSize(width / height);
  let elapsed = 0;
  let lastTime = 0;
  let frame: number | null = null;
  let pageHidden = document.hidden;
  let contextLost = false;
  let disposed = false;
  let pointer: Pointer = { x: 0, y: 0 };
  let pointerTarget: Pointer = { x: 0, y: 0 };

  const nodes = makeNodes(field);
  let pairs = makeConnectionPairs(nodes);
  const positions = new Float32Array(nodes.length * 3);
  const sizes = new Float32Array(nodes.length);

  nodes.forEach((node, index) => {
    const offset = index * 3;
    positions[offset] = node.x;
    positions[offset + 1] = node.y;
    positions[offset + 2] = node.z;
    sizes[index] = 0.052 + (node.phase / TAU) * 0.022;
  });

  const nodeGeometry = new THREE.BufferGeometry();
  const nodePosition = new THREE.BufferAttribute(positions, 3);
  nodePosition.setUsage(THREE.DynamicDrawUsage);
  nodeGeometry.setAttribute('position', nodePosition);
  nodeGeometry.setAttribute('a_size', new THREE.BufferAttribute(sizes, 1));

  let lineData = makeLineData(pairs, positions);
  let lineGeometry = lineData.geometry;
  let linePosition = lineData.attribute;
  let linePositions = lineData.positions;

  const nodeColor = new THREE.Color();
  const lineColor = new THREE.Color();
  const nodeFieldSize = new THREE.Vector2(field.width, field.height);
  const lineFieldSize = new THREE.Vector2(field.width, field.height);
  const nodeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      u_color: { value: nodeColor },
      u_opacity: { value: NETWORK_BACKGROUND_CONFIG.nodeOpacity },
      u_pixelRatio: { value: pixelRatio },
      u_field_size: { value: nodeFieldSize },
    },
    vertexShader: nodeVertexShader,
    fragmentShader: nodeFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const lineMaterial = new THREE.ShaderMaterial({
    uniforms: {
      u_color: { value: lineColor },
      u_opacity: { value: NETWORK_BACKGROUND_CONFIG.lineOpacity },
      u_field_size: { value: lineFieldSize },
    },
    vertexShader: lineVertexShader,
    fragmentShader: lineFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });

  const nodePoints = new THREE.Points(nodeGeometry, nodeMaterial);
  const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
  // The points drift, so the initial bounding sphere is not a safe culling box.
  nodePoints.frustumCulled = false;
  lineSegments.frustumCulled = false;

  const network = new THREE.Group();
  network.add(lineSegments, nodePoints);
  scene.add(network);

  function setTheme() {
    const color = dark.matches ? DARK_COLOR : LIGHT_COLOR;
    nodeColor.setHex(color);
    lineColor.setHex(color);
  }

  function updateLineGeometry() {
    const previousGeometry = lineGeometry;
    pairs = makeConnectionPairs(nodes);
    lineData = makeLineData(pairs, positions);
    lineGeometry = lineData.geometry;
    linePosition = lineData.attribute;
    linePositions = lineData.positions;
    lineSegments.geometry = lineGeometry;
    previousGeometry.dispose();
  }

  function resize() {
    width = Math.max(1, background.clientWidth || window.innerWidth);
    height = Math.max(1, background.clientHeight || window.innerHeight);
    const aspect = width / height;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    pixelRatio = Math.min(window.devicePixelRatio || 1, NETWORK_BACKGROUND_CONFIG.maxPixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    nodeMaterial.uniforms.u_pixelRatio.value = pixelRatio;

    // The field follows the visible camera frustum, so resizing never leaves
    // the network in a fixed-size corner of the new viewport.
    field = getViewPlaneSize(aspect);
    applyFieldBounds(nodes, field);
    nodeFieldSize.set(field.width, field.height);
    lineFieldSize.set(field.width, field.height);
    updateLineGeometry();
  }

  function updateLines() {
    pairs.forEach(([first, second], index) => {
      const lineOffset = index * 6;
      const firstOffset = first * 3;
      const secondOffset = second * 3;
      linePositions[lineOffset] = positions[firstOffset];
      linePositions[lineOffset + 1] = positions[firstOffset + 1];
      linePositions[lineOffset + 2] = positions[firstOffset + 2];
      linePositions[lineOffset + 3] = positions[secondOffset];
      linePositions[lineOffset + 4] = positions[secondOffset + 1];
      linePositions[lineOffset + 5] = positions[secondOffset + 2];
    });
    linePosition.needsUpdate = true;
  }

  function updateNodes() {
    nodes.forEach((node, index) => {
      const phase = elapsed * NETWORK_BACKGROUND_CONFIG.movementSpeed * node.speed + node.phase;
      const offset = index * 3;
      positions[offset] = node.x + Math.sin(phase) * node.amplitude;
      positions[offset + 1] = node.y + Math.sin(phase * 0.83 + 1.7) * node.amplitude * 0.72;
      positions[offset + 2] = node.z + Math.cos(phase * 0.67 + 0.9) * node.amplitude * 0.62;
    });
    nodePosition.needsUpdate = true;
    updateLines();
  }

  function updateOrientation(delta: number) {
    const smoothing = 1 - Math.exp(-delta * 4.5);
    pointer.x += (pointerTarget.x - pointer.x) * smoothing;
    pointer.y += (pointerTarget.y - pointer.y) * smoothing;
    network.rotation.y = elapsed * NETWORK_BACKGROUND_CONFIG.rotationSpeed + pointer.x * NETWORK_BACKGROUND_CONFIG.mouseInfluence;
    network.rotation.x = Math.sin(elapsed * 0.11) * 0.012 + pointer.y * NETWORK_BACKGROUND_CONFIG.mouseInfluence * 0.7;
    network.rotation.z = Math.sin(elapsed * 0.07) * 0.004;
  }

  function draw(delta = 0) {
    if (disposed || contextLost || printMedia.matches) return;
    if (delta && !reducedMotion.matches) {
      elapsed += Math.min(delta, 0.1);
      updateOrientation(delta);
      updateNodes();
    } else {
      updateOrientation(0);
      updateNodes();
    }
    renderer.render(scene, camera);
    background.dataset.ready = '';
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  function loop(now: number) {
    if (disposed || pageHidden || contextLost || printMedia.matches || reducedMotion.matches) return;
    const delta = lastTime ? (now - lastTime) / 1000 : 0;
    lastTime = now;
    draw(delta);
    frame = requestAnimationFrame(loop);
  }

  function sync() {
    stop();
    if (disposed || pageHidden || contextLost || printMedia.matches) return;
    resize();
    lastTime = performance.now();
    draw(0);
    if (!reducedMotion.matches) frame = requestAnimationFrame(loop);
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    pointerTarget = {
      x: Math.max(-1, Math.min(1, event.clientX / width * 2 - 1)),
      y: Math.max(-1, Math.min(1, event.clientY / height * 2 - 1)),
    };
  }

  function onPointerLeave() {
    pointerTarget = { x: 0, y: 0 };
  }

  function onVisibilityChange() {
    pageHidden = document.hidden;
    if (!pageHidden) sync();
    else stop();
  }

  function onPrintChange() {
    if (printMedia.matches) stop();
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
    if (!pageHidden) sync();
  }

  function onThemeChange() {
    setTheme();
    if (!pageHidden && !printMedia.matches) draw(0);
  }

  function onContextLost(event: Event) {
    event.preventDefault();
    contextLost = true;
    stop();
    delete background.dataset.ready;
  }

  function onContextRestored() {
    contextLost = false;
    if (!disposed) sync();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerleave', onPointerLeave);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    dark.removeEventListener('change', onThemeChange);
    reducedMotion.removeEventListener('change', sync);
    printMedia.removeEventListener('change', onPrintChange);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    nodeGeometry.dispose();
    lineGeometry.dispose();
    nodeMaterial.dispose();
    lineMaterial.dispose();
    renderer.dispose();
    delete background.dataset.ready;
  }

  setTheme();
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerleave', onPointerLeave, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  dark.addEventListener('change', onThemeChange);
  reducedMotion.addEventListener('change', sync);
  printMedia.addEventListener('change', onPrintChange);
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  sync();
  return dispose;
}
