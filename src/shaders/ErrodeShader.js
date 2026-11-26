import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D ground, water, soilProps;
  uniform vec2 viewport;
  uniform float factor;
  uniform float rockHardness;
  uniform float soilErodibility;
  uniform float evaporateRate;

  vec4 get(sampler2D source, float x, float y) {
    return texture2D(source, (gl_FragCoord.xy + vec2(x, y)) / viewport);
  }

  float baseTf = 0.00042;
  float tm = 0.12;

  void main() {
    vec4 g = get(ground, 0.0, 0.0);
    vec3 w = get(water, 0.0, 0.0).xyz;
    vec4 prop = get(soilProps, 0.0, 0.0);

    float incision = prop.g; // 0..1 (high = sharp gully cutting)
    float cohesion = prop.b; // 0..1

    float speed = length(w.yz) / (w.x + 0.0012);
    float streamPower = speed * sqrt(max(0.0, w.x) * 40.0);

    // 1. Focused gully incision into soil & weathered bedrock when stream power exceeds shear threshold
    float shearThreshold = mix(0.0005, 0.0045, cohesion * 0.5);
    float excessPower = max(0.0, streamPower - shearThreshold);

    // Cohesive clay/loess channels incise clearly; coarse gravel barely incises
    float soilIncise = excessPower * 0.00018 * factor * (0.25 + 1.35 * incision) * clamp(soilErodibility, 0.1, 4.0);
    soilIncise = clamp(soilIncise, 0.0, min(0.00045, g.z));
    g.z -= soilIncise;

    // Bedrock incision only where soil mantle is thin and flow is strong
    float rockExposed = 1.0 / (1.0 + g.z * 260.0);
    float rockIncise = (length(w.yz) * 0.0000038) / (w.x + 0.0015) * factor * rockExposed / max(0.25, rockHardness);
    rockIncise *= (0.4 + 0.7 * incision);
    rockIncise = clamp(rockIncise, 0.0, min(0.00035, max(0.0, g.y - 0.006)));
    g.y -= rockIncise;
    g.z += rockIncise * 0.35;

    // 2. Bounded soil sediment transport along flow vectors
    float localErod = clamp(soilErodibility, 0.1, 4.0) * (0.30 + 1.15 * incision);
    float tf = baseTf * localErod;

    vec3 w_left  = get(water, -1.0,  0.0).xyz;
    vec3 w_right = get(water,  1.0,  0.0).xyz;
    vec3 w_top   = get(water,  0.0,  1.0).xyz;
    vec3 w_bot   = get(water,  0.0, -1.0).xyz;

    vec4 g_left  = get(ground, -1.0,  0.0);
    vec4 g_right = get(ground,  1.0,  0.0);
    vec4 g_top   = get(ground,  0.0,  1.0);
    vec4 g_bot   = get(ground,  0.0, -1.0);

    float outX = min(abs(w.y * tf / (w.x + 0.0015)), tm);
    float outY = min(abs(w.z * tf / (w.x + 0.0015)), tm);
    float outFrac = min((outX + outY) * factor, 0.30);
    float soil_transported_off = outFrac * g.z;

    float inLeft  = clamp( w_left.y  * tf / (w_left.x  + 0.0015), 0.0, tm) * g_left.z;
    float inRight = clamp(-w_right.y * tf / (w_right.x + 0.0015), 0.0, tm) * g_right.z;
    float inTop   = clamp(-w_top.z   * tf / (w_top.x   + 0.0015), 0.0, tm) * g_top.z;
    float inBot   = clamp( w_bot.z   * tf / (w_bot.x   + 0.0015), 0.0, tm) * g_bot.z;
    float soil_transported_in = min((inLeft + inRight + inTop + inBot) * factor, 0.009);

    g.z = clamp(g.z + soil_transported_in - soil_transported_off, 0.0, 0.25);
    g.x = g.y + g.z;

    // 3. Surface wetness tracking in g.w
    if (w.x > 0.00004) {
      float wetTarget = smoothstep(0.00002, 0.0005, w.x);
      g.w = mix(g.w, max(g.w, wetTarget), 0.22);
    } else {
      g.w = max(0.0, g.w - 0.00045 * max(0.2, evaporateRate));
    }

    gl_FragColor = g;
  }
`;

export function createErrodeMaterial(viewportWidth = 512, viewportHeight = 512) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      ground: { value: null },
      water: { value: null },
      soilProps: { value: null },
      viewport: { value: new THREE.Vector2(viewportWidth, viewportHeight) },
      factor: { value: 1.0 },
      rockHardness: { value: 1.5 },
      soilErodibility: { value: 1.5 },
      evaporateRate: { value: 1.0 }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}
