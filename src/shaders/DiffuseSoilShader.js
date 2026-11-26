import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D ground, water, soilProps, initialHeights;
  uniform vec2 viewport;
  uniform float rockHardness;
  uniform float soilSlip;

  vec2 exchange(vec4 g1, float wet1, float coh1, float sub1, float x, float y) {
    vec2 uv = (gl_FragCoord.xy + vec2(x, y)) / viewport;
    vec4 g2 = texture2D(ground, uv);
    float w2Depth = texture2D(water, uv).x;
    vec4 prop2 = texture2D(soilProps, uv);

    float wet2 = clamp(max(g2.w, smoothstep(0.00003, 0.0002, w2Depth)), 0.0, 1.0);
    float pairWet = max(wet1, wet2);

    float diff = (g2.x - g1.x) / 4.0;
    float sdiff = 0.0;
    float gdiff = 0.0;

    // 1. Dry terrain stays 100% static (no spontaneous melting/settling without water)
    if (pairWet > 0.06 && max(0.0, soilSlip) > 0.001) {
      float avgCoh = 0.5 * (coh1 + prop2.b);
      float avgSub = 0.5 * (sub1 + prop2.r);

      // Cohesive clay holds high repose angle -> sharp uncollapsed gullies;
      // Collapsible loess loses repose when wet -> bank slumping & mudflow
      float wetRepose = mix(0.0006, 0.015, avgCoh) * mix(1.0, 0.35, avgSub * pairWet);
      float absD = abs(diff);
      if (absD > wetRepose) {
        float excess = sign(diff) * (absD - wetRepose);
        float mob = (1.0 - avgCoh * 0.85) * soilSlip * pairWet;
        sdiff = clamp(excess, -g1.z * 0.35, g2.z * 0.35) * 0.055 * mob;
      }
    }

    // 2. Bedrock only adjusts on extreme sheer cliffs (e.g. sculpted overhangs)
    if (abs(diff) > 0.032) {
      float rockExcess = sign(diff) * (abs(diff) - 0.032);
      gdiff = rockExcess * (0.015 / max(0.3, rockHardness));
    }

    return vec2(gdiff, sdiff);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / viewport;
    vec4 g = texture2D(ground, uv);
    float wDepth = texture2D(water, uv).x;
    vec4 prop = texture2D(soilProps, uv);

    float wet = clamp(max(g.w, smoothstep(0.00003, 0.0002, wDepth)), 0.0, 1.0);
    float subsidence = prop.r;
    float cohesion = prop.b;

    vec2 c = (
      exchange(g, wet, cohesion, subsidence,  1.0,  0.0) +
      exchange(g, wet, cohesion, subsidence, -1.0,  0.0) +
      exchange(g, wet, cohesion, subsidence,  0.0,  1.0) +
      exchange(g, wet, cohesion, subsidence,  0.0, -1.0)
    );

    float newRock = max(0.005, g.y + clamp(c.x, -0.008, 0.008));
    float newSoil = clamp(g.z + clamp(c.y, -g.z * 0.32, 0.012), 0.0, 0.25);

    // 3. Hydro-compaction / Wet Subsidence ONLY for wet collapsible soils (subsidence > 0.25)
    if (wet > 0.12 && subsidence > 0.25 && newSoil > 0.002) {
      float initSoil = texture2D(initialHeights, uv).z;
      float compactedMin = initSoil * (1.0 - 0.35 * subsidence);
      if (newSoil > compactedMin) {
        float compactRate = wet * subsidence * 0.00024 * max(0.35, soilSlip);
        float drop = min(newSoil - compactedMin, compactRate);
        newSoil -= drop;
      }
    }

    gl_FragColor = vec4(newRock + newSoil, newRock, newSoil, g.w);
  }
`;

export function createDiffuseSoilMaterial(viewportWidth = 512, viewportHeight = 512) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      ground: { value: null },
      water: { value: null },
      soilProps: { value: null },
      initialHeights: { value: null },
      viewport: { value: new THREE.Vector2(viewportWidth, viewportHeight) },
      rockHardness: { value: 1.5 },
      soilSlip: { value: 1.0 }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}
