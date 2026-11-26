import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// Generates per-pixel geotechnical property map:
// r = subsidence (wet collapse / compaction tendency 0..1)
// g = incision   (gully cutting susceptibility 0..1)
// b = cohesion   (wet slope stability / repose angle 0..1; high = sharp uncollapsed gullies)
// a = soilTypeId (0.0..0.30 = Loess, 0.30..0.62 = Cohesive Clay, 0.62..0.85 = Gravel, 0.85..1.0 = Bedrock)
const fragmentShader = `
  uniform sampler2D heights;
  uniform vec2 viewport;
  uniform float seed;
  uniform float worldSize;
  uniform float verticalScale;
  uniform float landformScale;
  uniform float soilType;          // 0 = Loess, 1 = Clay, 2 = Gravel, 3 = Composite
  uniform float soilHeterogeneity; // 0..1

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  float fbm2(vec2 p, float z) {
    return 0.6 * snoise(vec3(p, z)) + 0.3 * snoise(vec3(p * 2.3, z + 4.1)) + 0.1 * snoise(vec3(p * 5.1, z + 9.7));
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / viewport;
    vec2 px = 1.0 / viewport;

    vec4 g = texture2D(heights, uv);
    float soil = g.z;

    // Bare rock bedrock zone
    if (soil < 0.0012) {
      gl_FragColor = vec4(0.0, 0.08, 1.0, 0.94);
      return;
    }

    float hR = texture2D(heights, uv + vec2(px.x, 0.0)).x;
    float hL = texture2D(heights, uv - vec2(px.x, 0.0)).x;
    float hT = texture2D(heights, uv + vec2(0.0, px.y)).x;
    float hB = texture2D(heights, uv - vec2(0.0, px.y)).x;

    float worldDx = 2.0 * max(0.1, worldSize) / max(viewport.x, viewport.y);
    float slope = length(vec2(hR - hL, hT - hB)) * verticalScale / worldDx;

    float macroFreq = max(0.6, pow(max(1.0, worldSize), 0.52) / max(0.35, landformScale));
    float zGeo = fract(seed * 0.419) * 25.0 + 3.7;
    float patchA = fbm2(uv * 3.8 * sqrt(macroFreq), zGeo) * 0.5 + 0.5;
    float patchB = fbm2(uv * 8.5 * sqrt(macroFreq), zGeo + 13.2) * 0.5 + 0.5;

    float het = clamp(soilHeterogeneity, 0.0, 1.0);
    float pVar = (patchA - 0.5) * 0.7 + (patchB - 0.5) * 0.3;

    float subsidence = 0.0;
    float incision = 0.5;
    float cohesion = 0.5;
    float typeId = 0.45;

    if (soilType < 0.5) {
      // 0: Collapsible Loess (prone to uneven wet subsidence & slumping, except scattered calcic nodules)
      subsidence = clamp(0.76 + pVar * het * 0.72, 0.22, 0.98);
      incision   = clamp(0.62 + (patchB - 0.5) * het * 0.45, 0.35, 0.90);
      cohesion   = clamp(0.22 - pVar * het * 0.28, 0.08, 0.55);
      // Calcareous hard pockets resist collapse slightly
      float hardNodules = smoothstep(0.76, 0.90, patchA) * het;
      subsidence *= (1.0 - hardNodules * 0.65);
      cohesion = mix(cohesion, 0.65, hardNodules * 0.7);
      typeId = mix(0.14, 0.24, patchA);
    } else if (soilType < 1.5) {
      // 1: Cohesive Red Clay (zero collapse, steep cohesive banks, sharp deep gully incision)
      subsidence = clamp(0.02 + max(0.0, pVar) * het * 0.04, 0.0, 0.06);
      incision   = clamp(0.86 + pVar * het * 0.28, 0.65, 1.0);
      cohesion   = clamp(0.88 - pVar * het * 0.16, 0.74, 0.98);
      typeId = mix(0.40, 0.54, patchA);
    } else if (soilType < 2.5) {
      // 2: Alluvial Gravel (stable, resists collapse, shallow braided channels)
      subsidence = clamp(0.01 + max(0.0, pVar) * het * 0.04, 0.0, 0.05);
      incision   = clamp(0.28 + pVar * het * 0.22, 0.14, 0.46);
      cohesion   = clamp(0.76 + pVar * het * 0.20, 0.62, 0.94);
      typeId = mix(0.68, 0.79, patchA);
    } else {
      // 3: Composite Basin (valley-bottom loess/silt -> mid-slope cohesive clay -> upper ridge gravel)
      float lowZone = smoothstep(0.18, 0.05, g.x) * smoothstep(0.45, 0.12, slope);
      float highZone = smoothstep(0.14, 0.28, g.x) + smoothstep(0.32, 0.75, slope) * 0.5;
      float bandShift = pVar * het * 0.55;

      float wLoess = clamp(lowZone + max(0.0, bandShift), 0.0, 1.0);
      float wGravel = clamp(highZone + max(0.0, -bandShift * 0.8), 0.0, 1.0);
      float wClay = max(0.15, 1.0 - max(wLoess, wGravel));
      float sumW = wLoess + wClay + wGravel;
      wLoess /= sumW;
      wClay /= sumW;
      wGravel /= sumW;

      subsidence = wLoess * 0.82 + wClay * 0.03 + wGravel * 0.02;
      incision   = wLoess * 0.60 + wClay * 0.88 + wGravel * 0.26;
      cohesion   = wLoess * 0.20 + wClay * 0.88 + wGravel * 0.76;

      if (wLoess >= wClay && wLoess >= wGravel) {
        typeId = 0.18;
      } else if (wClay >= wGravel) {
        typeId = 0.46;
      } else {
        typeId = 0.73;
      }
    }

    gl_FragColor = vec4(subsidence, incision, cohesion, typeId);
  }
`;

export function createGeologyMapMaterial(viewportWidth = 512, viewportHeight = 512) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      heights: { value: null },
      viewport: { value: new THREE.Vector2(viewportWidth, viewportHeight) },
      seed: { value: 101 },
      worldSize: { value: 1.0 },
      verticalScale: { value: 1.0 },
      landformScale: { value: 1.0 },
      soilType: { value: 1.0 },
      soilHeterogeneity: { value: 0.65 }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}
