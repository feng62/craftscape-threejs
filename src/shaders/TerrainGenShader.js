import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform vec2 viewport;
  uniform float seed;
  uniform float landformType;
  uniform float heightScale;
  uniform float slopeTilt;
  uniform float valleyDepth;
  uniform float valleyWidth;
  uniform float gullyDensity;
  uniform float roughness;

  uniform float worldSize;
  uniform float verticalScale;
  uniform float landformScale;

  uniform float soilRatio;
  uniform float soilDepth;
  uniform float rockSlopeThreshold;
  uniform float soilPatchiness;

  // --- Simplex 3D Noise ---
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
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  // Hyperbolic smooth abs removes all razor-sharp ridge spikes
  float softAbs(float x, float eps) {
    return sqrt(x * x + eps);
  }

  float smoothFbm(vec2 p, float zOff, float rough) {
    float val = 0.0;
    float amp = 0.52;
    float freq = 1.0;
    float gain = mix(0.32, 0.46, clamp(rough, 0.0, 1.0));
    for (int i = 0; i < 5; i++) {
      val += amp * snoise(vec3(p * freq, zOff + float(i) * 3.17));
      freq *= 2.03;
      amp *= gain;
    }
    return val;
  }

  // Smooth rounded hill-ridge noise (no sharp needle peaks)
  float roundedHillFbm(vec2 p, float zOff, float rough) {
    float val = 0.0;
    float amp = 0.52;
    float freq = 1.0;
    float gain = mix(0.30, 0.42, clamp(rough, 0.0, 1.0));
    for (int i = 0; i < 4; i++) {
      float raw = snoise(vec3(p * freq, zOff + float(i) * 5.13));
      float n = 1.0 - softAbs(raw, 0.09);
      n = smoothstep(0.05, 0.95, n);
      val += n * amp;
      freq *= 1.96;
      amp *= gain;
    }
    return val;
  }

  float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }

  // Soft U/V valley profile with gentle floodplain bottom and rounded shoulders
  float softValleyMask(float dist, float halfW) {
    float t = clamp(dist / max(0.015, halfW), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  float evalTerrain(vec2 uv) {
    float zBase = fract(seed * 0.137) * 40.0 + 1.5;
    float macroFreq = max(0.55, pow(max(1.0, worldSize), 0.52) / max(0.35, landformScale));
    float sqrtMacro = sqrt(macroFreq);

    // Gentle organic domain warp
    vec2 warp = vec2(
      smoothFbm(uv * 1.9 * macroFreq + vec2(1.7, 9.2), zBase + 1.1, roughness),
      smoothFbm(uv * 1.9 * macroFreq + vec2(8.3, 2.8), zBase + 4.7, roughness)
    ) * (0.04 + 0.035 * roughness) / sqrtMacro;

    vec2 wuv = uv + warp;

    // Rounded aerial-DEM hill skeleton (blend of smooth hills and soft rounded ridges)
    float hillMound = smoothFbm(wuv * 1.45 * macroFreq, zBase + 7.2, roughness) * 0.5 + 0.5;
    float softRidge = roundedHillFbm(wuv * (1.15 + roughness * 0.45) * macroFreq, zBase, roughness);
    float terrainBody = mix(hillMound, softRidge, 0.42);

    // Subtle secondary shallow watershed swales (no razor cuts)
    float detail = smoothFbm(uv * (3.2 + gullyDensity * 1.8) * macroFreq, zBase + 12.4, roughness);
    float swaleRaw = snoise(vec3(wuv * (2.2 + gullyDensity * 2.4) * macroFreq, zBase + 21.0));
    float softGully = 1.0 - smoothstep(0.0, 0.42, softAbs(swaleRaw, 0.025));

    float basinWeight = smoothstep(1.15, 2.3, macroFreq);
    float secNetRaw = snoise(vec3(wuv * vec2(1.4, 1.05) * macroFreq, zBase + 33.7));
    float secChannel = 1.0 - smoothstep(0.0, 0.36, softAbs(secNetRaw, 0.02));

    float tilt = uv.y * slopeTilt;
    float h = 0.022 + tilt;

    float vw = max(0.055, (valleyWidth * 0.48) / pow(macroFreq, 0.40));
    float vd = valleyDepth;

    if (landformType < 0.5) {
      // 0: Smooth Hill-Flanked Wide Canyon Valley
      float center = 0.5 + (0.09 / sqrtMacro) * sin(uv.y * 4.8 * sqrtMacro + zBase * 0.3) + warp.x * 0.7;
      float d = abs(uv.x - center);
      if (macroFreq > 1.25) {
        float flankFreq = max(1.0, floor(macroFreq * 0.85 + 0.5));
        float dSide = abs(fract((uv.x - 0.5) * flankFreq + 0.5) - 0.5) / flankFreq;
        d = min(d, mix(d, dSide * 1.3, basinWeight * 0.7));
      }
      float vProf = softValleyMask(d, vw);
      float hills = heightScale * (0.28 + 0.72 * terrainBody) * (0.30 + 0.70 * vProf);
      h += hills;
      h -= vd * 0.075 * (1.0 - softValleyMask(d, vw * 0.75));
      h -= gullyDensity * 0.018 * softGully * smoothstep(vw * 0.15, vw * 1.2, d);
    } else if (landformType < 1.5) {
      // 1: Dendritic Loess / Rounded-Hill Gullies
      float mainCenter = 0.5 + (0.05 / sqrtMacro) * sin(uv.y * 3.8 * sqrtMacro + zBase * 0.2) + warp.x * 0.5;
      float dMain = sdSegment(uv, vec2(mainCenter, 0.0), vec2(0.5, 0.52));
      float dLeft = sdSegment(uv, vec2(0.49, 0.46), vec2(0.18 + warp.x * 0.3, 0.96));
      float dMid  = sdSegment(uv, vec2(0.50, 0.48), vec2(0.50 + warp.x * 0.3, 0.98));
      float dRight= sdSegment(uv, vec2(0.51, 0.46), vec2(0.82 + warp.x * 0.3, 0.95));

      float dBranch = min(min(dLeft, dMid), dRight);
      float dNet = min(dMain, dBranch * 1.12);

      float channelMask = 1.0 - softValleyMask(dNet, vw * 0.88);
      channelMask = max(channelMask, basinWeight * secChannel * 0.75);

      float mountain = heightScale * (0.32 + 0.68 * terrainBody) * (0.55 + 0.45 * uv.y);
      h += mountain * (1.0 - 0.35 * channelMask);
      h -= vd * 0.095 * channelMask;
      h -= gullyDensity * 0.022 * softGully * (1.0 - channelMask * 0.4);
    } else if (landformType < 2.5) {
      // 2: Broad Meandering Floodplain Valley
      float meanderCenter = 0.5 + (0.21 / sqrtMacro) * sin(uv.y * 6.5 * sqrtMacro + zBase * 0.4);
      float d = abs(uv.x - meanderCenter + warp.x * 0.4);
      if (macroFreq > 1.35) {
        float dSub = abs(fract((uv.x - meanderCenter) * 1.6 * sqrtMacro + 0.5) - 0.5) / (1.6 * sqrtMacro);
        d = min(d, mix(d, dSub * 1.35, basinWeight * 0.6));
      }
      float bank = softValleyMask(d, vw * 1.18);
      float floodplain = softValleyMask(d, vw * 0.45);

      h += heightScale * 0.78 * bank * (0.38 + 0.62 * terrainBody);
      h += heightScale * 0.08 * floodplain;
      h -= vd * 0.055 * (1.0 - bank);
      h -= gullyDensity * 0.015 * softGully * bank;
    } else if (landformType < 3.5) {
      // 3: Alluvial Fan at Mountain Foothills
      float gorgeCount = max(1.0, floor(sqrtMacro * 1.15 + 0.2));
      float gorgePhase = fract((uv.x - 0.5) * gorgeCount + 0.5) - 0.5;
      float gorgeWarp = 0.05 * sin(uv.y * 7.0 * sqrtMacro + zBase * 0.3) + warp.x * 0.4 * gorgeCount;
      float dGorge = abs(gorgePhase - gorgeWarp) / gorgeCount;
      float mountainZone = smoothstep(0.45, 0.70, uv.y);

      float gorgeCut = softValleyMask(dGorge, vw * 0.78);
      float mtnH = heightScale * (0.42 + 0.58 * terrainBody) * (0.35 + 0.65 * gorgeCut);
      mtnH -= vd * 0.075 * (1.0 - gorgeCut);

      float fanX = (fract((uv.x - 0.5) * gorgeCount + 0.5) - 0.5) / gorgeCount;
      float distMouth = length(vec2(fanX * gorgeCount * 0.85, uv.y - 0.56));
      float fanCone = smoothstep(0.75, 0.0, distMouth) * heightScale * 0.32;
      float angle = atan(fanX, max(0.001, 0.58 - uv.y));
      float braids = sin(angle * (8.0 + gullyDensity * 8.0) + snoise(vec3(uv * 4.0 * macroFreq, zBase)) * 2.0);
      float fanH = fanCone + 0.008 * detail - 0.003 * max(0.0, braids) * (1.0 - mountainZone);

      h += mix(fanH, mtnH, mountainZone);
      h -= gullyDensity * 0.015 * softGully * mountainZone * gorgeCut;
    } else if (landformType < 4.5) {
      // 4: Stepped Detention Basin
      float center = 0.5 + (0.06 / sqrtMacro) * sin(uv.y * 4.6 * sqrtMacro + zBase * 0.25) + warp.x * 0.4;
      float d = abs(uv.x - center);

      float damY = macroFreq > 1.5 ? fract(uv.y * 2.0 + 0.16) : uv.y;
      float damBand = exp(-pow((damY - 0.42) / 0.095, 2.0));
      float spillway = softValleyMask(d, vw * 0.45);
      float damWall = damBand * (0.25 + 0.75 * spillway) * heightScale * 0.48;

      float basinDist = length(vec2((uv.x - 0.5), (damY - 0.58) * 1.4));
      float basin = (1.0 - smoothstep(0.08, 0.30, basinDist)) * vd * 0.075;

      float valleyWalls = softValleyMask(d, vw * 1.15);
      h += heightScale * 0.78 * valleyWalls * (0.38 + 0.62 * terrainBody) + damWall - basin;
      float downstreamCut = (1.0 - softValleyMask(d, vw * 0.72)) * (1.0 - smoothstep(0.28, 0.40, damY));
      h -= vd * 0.065 * downstreamCut;
      h -= gullyDensity * 0.016 * softGully * valleyWalls;
      h -= basinWeight * secChannel * vd * 0.045;
    } else {
      // 5: Rolling Aerial-DEM Hill Ranges
      float dCenter = abs(uv.x - 0.5 + warp.x * 0.7);
      float macroValley = softValleyMask(dCenter, vw * 1.35);
      h += heightScale * (0.24 + 0.76 * terrainBody) * (0.45 + 0.55 * macroValley);
      h -= vd * 0.055 * (1.0 - macroValley);
      h -= gullyDensity * 0.018 * softGully;
      h -= basinWeight * secChannel * vd * 0.045;
    }

    // Gentle fine micro-relief
    h += detail * (0.003 + roughness * 0.006);

    // Smooth outlet dip at bottom edge for clean drainage
    float outletDip = (1.0 - smoothstep(0.0, 0.09, uv.y)) * (1.0 - smoothstep(0.15, 0.50, abs(uv.x - 0.5)));
    h -= outletDip * 0.014;

    return max(0.012, h);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / viewport;
    float eps = 1.0 / max(viewport.x, viewport.y);

    float h0 = evalTerrain(uv);
    float hx = evalTerrain(uv + vec2(eps, 0.0));
    float hy = evalTerrain(uv + vec2(0.0, eps));

    float worldDx = max(1e-5, worldSize) * eps;
    float slope = length(vec2(hx - h0, hy - h0)) * verticalScale / worldDx;

    float macroFreq = max(0.55, pow(max(1.0, worldSize), 0.52) / max(0.35, landformScale));
    float zSoil = fract(seed * 0.271) * 30.0 + 7.3;
    float patchN = smoothFbm(uv * 4.5 * sqrt(macroFreq), zSoil, 0.4) * 0.5 + 0.5;

    float gentle = smoothstep(rockSlopeThreshold * 1.45, rockSlopeThreshold * 0.16, slope);
    float normH = clamp(h0 / max(0.12, heightScale + slopeTilt), 0.0, 1.0);
    float lowBias = smoothstep(1.05, 0.16, normH);

    float naturalScore = mix(gentle, gentle * 0.65 + lowBias * 0.35, 0.45);
    float perturbed = clamp(naturalScore + (patchN - 0.5) * soilPatchiness * 0.72, 0.0, 1.0);

    float threshold = 1.0 - clamp(soilRatio, 0.0, 1.0);
    float soilMask = smoothstep(threshold - 0.22, threshold + 0.22, perturbed);
    if (soilRatio <= 0.002) {
      soilMask = 0.0;
    } else if (soilRatio >= 0.998) {
      soilMask = 1.0;
    } else {
      soilMask = mix(soilMask, soilRatio, 0.25);
    }

    float soil = max(0.0, soilMask * soilDepth * (0.25 + 0.85 * soilRatio));
    float rock = max(0.008, h0 - soil * 0.35);
    float total = rock + soil;

    gl_FragColor = vec4(total, rock, soil, 0.0);
  }
`;

export function createTerrainGenMaterial(viewportWidth = 512, viewportHeight = 512) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      viewport: { value: new THREE.Vector2(viewportWidth, viewportHeight) },
      seed: { value: 101 },
      landformType: { value: 0 },
      heightScale: { value: 0.21 },
      slopeTilt: { value: 0.09 },
      valleyDepth: { value: 0.58 },
      valleyWidth: { value: 0.28 },
      gullyDensity: { value: 0.32 },
      roughness: { value: 0.34 },
      worldSize: { value: 1.0 },
      verticalScale: { value: 1.0 },
      landformScale: { value: 1.0 },
      soilRatio: { value: 0.58 },
      soilDepth: { value: 0.048 },
      rockSlopeThreshold: { value: 0.42 },
      soilPatchiness: { value: 0.45 }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}

// Gentle 3x3 Gaussian weathering pass to remove any residual single-texel spikes
const smoothFragmentShader = `
  uniform sampler2D source;
  uniform vec2 viewport;

  vec4 get(float x, float y) {
    return texture2D(source, (gl_FragCoord.xy + vec2(x, y)) / viewport);
  }

  void main() {
    vec4 center = get(0.0, 0.0);
    vec4 blur = (
      get(-1.0,  1.0) * 1.0 + get(0.0,  1.0) * 2.0 + get(1.0,  1.0) * 1.0 +
      get(-1.0,  0.0) * 2.0 + center         * 4.0 + get(1.0,  0.0) * 2.0 +
      get(-1.0, -1.0) * 1.0 + get(0.0, -1.0) * 2.0 + get(1.0, -1.0) * 1.0
    ) / 16.0;

    vec4 blended = mix(center, blur, 0.65);
    float rock = max(0.006, blended.y);
    float soil = max(0.0, blended.z);
    gl_FragColor = vec4(rock + soil, rock, soil, center.w);
  }
`;

export function createSmoothTerrainMaterial(viewportWidth = 512, viewportHeight = 512) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: smoothFragmentShader,
    uniforms: {
      source: { value: null },
      viewport: { value: new THREE.Vector2(viewportWidth, viewportHeight) }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}
