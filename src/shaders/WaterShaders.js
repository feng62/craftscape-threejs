import * as THREE from 'three';

const quadVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// 1. Virtual Pipe Outflow Flux Shader (Mass-Conserving Shallow Water with Inertia)
// flux channels: x = Right (+X), y = Left (-X), z = Top (+Y/Z), w = Bottom (-Y/Z)
const waterFluxFragmentShader = `
  uniform sampler2D heights, water, flux;
  uniform vec2 viewport;
  uniform float flow_speed, dt_scale;

  void main() {
    vec2 px = 1.0 / viewport;
    vec2 uv = gl_FragCoord.xy / viewport;

    float g  = texture2D(heights, uv).x;
    float d  = texture2D(water, uv).x;
    float h  = g + d;

    vec4 fOld = texture2D(flux, uv);

    // Sample neighbor total surface elevations
    float gR = texture2D(heights, uv + vec2( px.x, 0.0)).x;
    float gL = texture2D(heights, uv + vec2(-px.x, 0.0)).x;
    float gT = texture2D(heights, uv + vec2(0.0,  px.y)).x;
    float gB = texture2D(heights, uv + vec2(0.0, -px.y)).x;

    float dR = texture2D(water, uv + vec2( px.x, 0.0)).x;
    float dL = texture2D(water, uv + vec2(-px.x, 0.0)).x;
    float dT = texture2D(water, uv + vec2(0.0,  px.y)).x;
    float dB = texture2D(water, uv + vec2(0.0, -px.y)).x;

    // Height differences driving outflow from center to each neighbor
    float dhR = h - (gR + dR);
    float dhL = h - (gL + dL);
    float dhT = h - (gT + dT);
    float dhB = h - (gB + dB);

    // Pipe acceleration & inertia damping
    float accel = 0.24 * clamp(flow_speed, 0.2, 4.0) * dt_scale;
    float damping = pow(0.965, dt_scale);

    float fR = max(0.0, fOld.x * damping + dhR * accel);
    float fL = max(0.0, fOld.y * damping + dhL * accel);
    float fT = max(0.0, fOld.z * damping + dhT * accel);
    float fB = max(0.0, fOld.w * damping + dhB * accel);

    // Clamp zero outflow at map borders if UV is at edge texel
    if (gl_FragCoord.x >= viewport.x - 1.0) fR = 0.0;
    if (gl_FragCoord.x <= 1.0)              fL = 0.0;
    if (gl_FragCoord.y >= viewport.y - 1.0) fT = 0.0;
    if (gl_FragCoord.y <= 1.0)              fB = 0.0;

    // Scale factor K ensures total outflow never exceeds available water depth d
    float sumF = fR + fL + fT + fB;
    float K = sumF > 1e-8 ? min(1.0, (d * 0.98) / sumF) : 0.0;

    gl_FragColor = vec4(fR, fL, fT, fB) * K;
  }
`;

export function createWaterFluxMaterial(width = 512, height = 512) {
  return new THREE.ShaderMaterial({
    vertexShader: quadVertexShader,
    fragmentShader: waterFluxFragmentShader,
    uniforms: {
      heights: { value: null },
      water: { value: null },
      flux: { value: null },
      viewport: { value: new THREE.Vector2(width, height) },
      flow_speed: { value: 1.0 },
      dt_scale: { value: 1.0 }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}

// 2. Water Depth, Velocity & Sediment Advection Shader
const waterUpdateFragmentShader = `
  uniform sampler2D water, flux;
  uniform vec2 viewport;

  void main() {
    vec2 px = 1.0 / viewport;
    vec2 uv = gl_FragCoord.xy / viewport;

    vec4 wHere = texture2D(water, uv);
    vec4 fHere = texture2D(flux, uv);

    // Neighbor fluxes pointing INTO this cell
    float inFromLeft   = gl_FragCoord.x > 1.0              ? texture2D(flux, uv + vec2(-px.x, 0.0)).x : 0.0;
    float inFromRight  = gl_FragCoord.x < viewport.x - 1.0 ? texture2D(flux, uv + vec2( px.x, 0.0)).y : 0.0;
    float inFromBottom = gl_FragCoord.y > 1.0              ? texture2D(flux, uv + vec2(0.0, -px.y)).z : 0.0;
    float inFromTop    = gl_FragCoord.y < viewport.y - 1.0 ? texture2D(flux, uv + vec2(0.0,  px.y)).w : 0.0;

    float outflow = fHere.x + fHere.y + fHere.z + fHere.w;
    float inflow  = inFromLeft + inFromRight + inFromBottom + inFromTop;

    float oldD = wHere.x;
    float newD = max(0.0, oldD + inflow - outflow);

    // Average water flux vector (momentum proxy) through this cell
    float vx = 0.5 * ((inFromLeft - fHere.y) + (fHere.x - inFromRight));
    float vz = 0.5 * ((inFromBottom - fHere.w) + (fHere.z - inFromTop));

    // Mass-conserving upwind sediment advection
    float sedL = texture2D(water, uv + vec2(-px.x, 0.0)).w;
    float sedR = texture2D(water, uv + vec2( px.x, 0.0)).w;
    float sedB = texture2D(water, uv + vec2(0.0, -px.y)).w;
    float sedT = texture2D(water, uv + vec2(0.0,  px.y)).w;

    float sedMass = max(0.0, oldD - outflow) * wHere.w
      + inFromLeft   * sedL
      + inFromRight  * sedR
      + inFromBottom * sedB
      + inFromTop    * sedT;

    float newSed = newD > 0.00001 ? clamp(sedMass / newD, 0.0, 1.0) : 0.0;

    gl_FragColor = vec4(newD, vx, vz, newSed);
  }
`;

export function createWaterUpdateMaterial(width = 512, height = 512) {
  return new THREE.ShaderMaterial({
    vertexShader: quadVertexShader,
    fragmentShader: waterUpdateFragmentShader,
    uniforms: {
      water: { value: null },
      flux: { value: null },
      viewport: { value: new THREE.Vector2(width, height) }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}

// 3. Water Cycle Shader (Sources, Flash Floods, Rain, Local Storm, Sediment Pickup, Open Boundary)
const MAX_SOURCES = 24;

const waterCycleFragmentShader = `
  uniform sampler2D water, ground, soilProps;
  uniform vec2 viewport, screen, mousepos;
  uniform float rain, rain_rate, evaporate, evaporate_rate, create, editsize;
  uniform float open_boundary, erode_rate, soil_erodibility, dt_scale;
  uniform float worldSize, verticalScale;

  uniform vec4 water_sources[${MAX_SOURCES}];
  uniform float source_sediment[${MAX_SOURCES}];
  uniform vec4 storm_zone;

  uniform mat4 inv_view, inv_proj;
  uniform mat3 inv_rot;

  vec3 get_world_normal(vec2 coord) {
    vec2 frag_coord = coord / screen;
    frag_coord = (frag_coord - 0.5) * 2.0;
    vec4 device_normal = vec4(frag_coord, 0.0, 1.0);
    vec3 eye_normal = normalize((inv_proj * device_normal).xyz);
    vec3 world_normal = normalize(inv_rot * eye_normal);
    return world_normal;
  }

  vec3 get_ray_terrain_intersection(vec3 O, vec3 D) {
    vec3 dir = normalize(D);
    float topY = 0.85 * verticalScale;
    float t = dir.y < -1e-4 ? max(0.0, (topY - O.y) / dir.y) : 0.0;

    float dt = 0.022 * worldSize;
    vec3 p = O + t * dir;
    bool hit = false;

    for (int i = 0; i < 100; i++) {
      p = O + t * dir;
      vec2 uv_step = vec2(p.x / worldSize + 0.5, p.z / worldSize + 0.5);
      if (uv_step.x >= 0.0 && uv_step.x <= 1.0 && uv_step.y >= 0.0 && uv_step.y <= 1.0) {
        float h = (texture2D(ground, uv_step).x + texture2D(water, uv_step).x) * verticalScale;
        if (p.y <= h) {
          hit = true;
          break;
        }
      }
      t += dt;
    }

    if (hit) {
      float t0 = max(0.0, t - dt);
      float t1 = t;
      for (int j = 0; j < 6; j++) {
        float tm = (t0 + t1) * 0.5;
        vec3 pm = O + tm * dir;
        vec2 uv_m = vec2(pm.x / worldSize + 0.5, pm.z / worldSize + 0.5);
        float hm = (texture2D(ground, uv_m).x + texture2D(water, uv_m).x) * verticalScale;
        if (pm.y <= hm) {
          t1 = tm;
        } else {
          t0 = tm;
        }
      }
      return O + t1 * dir;
    }

    float u0 = abs(dir.y) > 1e-4 ? (0.0 - O.y) / dir.y : 0.0;
    return O + dir * u0;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / viewport;
    vec4 w = texture2D(water, uv);
    vec4 g = texture2D(ground, uv);

    // 1. Sculpt Brush Water Creation
    float addedBrush = 0.0;
    if (abs(create) > 0.001) {
      vec3 mousevec = get_world_normal(mousepos);
      vec4 eyepos = inv_view * vec4(0.0, 0.0, 0.0, 1.0);
      vec3 intersection = get_ray_terrain_intersection(eyepos.xyz, mousevec);
      vec3 position = vec3((uv.x - 0.5) * worldSize, (g.x + w.x) * verticalScale, (uv.y - 0.5) * worldSize);
      float normDist = length(vec3(
        (position.x - intersection.x) / worldSize,
        (position.y - intersection.y) / max(0.1, verticalScale),
        (position.z - intersection.z) / worldSize
      ));
      float dist = normDist * pow(editsize, 3.0);
      float s = smoothstep(1.0, 0.0, dist);
      addedBrush = s * create * 0.00012 * dt_scale;
    }

    // 2. Global Rain & Local Storm Zone
    float rainAdd = 0.00000012 * rain * rain_rate * dt_scale;
    if (storm_zone.w > 0.0 && storm_zone.z > 0.001) {
      float dStorm = distance(uv, storm_zone.xy);
      float stormFalloff = smoothstep(storm_zone.z, 0.0, dStorm);
      rainAdd += stormFalloff * stormFalloff * storm_zone.w * 0.000012 * dt_scale;
    }

    // 3. Multi-Point Persistent Water Sources & Flash Flood Pulses
    // Soft head-pressure limiter keeps water depth realistic (no vertical spikes)
    float sourceAdd = 0.0;
    float sourceSedWeighted = 0.0;
    float headCap = clamp(1.0 - w.x / 0.022, 0.0, 1.0);

    for (int i = 0; i < ${MAX_SOURCES}; i++) {
      vec4 src = water_sources[i];
      if (src.w > 0.0 && src.z > 0.001) {
        float d = distance(uv, src.xy);
        if (d < src.z) {
          float falloff = smoothstep(src.z, 0.0, d);
          float addW = falloff * falloff * src.w * 0.000045 * dt_scale * headCap;
          sourceAdd += addW;
          sourceSedWeighted += addW * source_sediment[i];
        }
      }
    }

    float prevDepth = w.x;
    float prevSedMass = prevDepth * w.w;

    w.x += rainAdd + sourceAdd + addedBrush;
    w.x *= mix(1.0, 1.0 - 0.000075 * evaporate_rate * dt_scale, evaporate);
    w.x = clamp(w.x, 0.0, 0.14);

    // Update suspended sediment concentration
    float sedMass = prevSedMass + sourceSedWeighted;
    float newSed = w.x > 0.00001 ? clamp(sedMass / w.x, 0.0, 1.0) : 0.0;

    if (w.x > 0.00001) {
      vec4 prop = texture2D(soilProps, uv);
      float mudSupply = clamp(prop.r * 0.9 + prop.g * 0.55, 0.15, 1.25);
      float speed = length(w.yz) / (w.x + 0.001);
      float soilAvail = smoothstep(0.0, 0.015, g.z);
      float pickup = clamp(speed * 0.45 * erode_rate * soil_erodibility * soilAvail * mudSupply, 0.0, 0.35);
      newSed = mix(newSed, 1.0, pickup * 0.09 * dt_scale);
      float settle = mix(0.004, 0.0004, clamp(speed * 3.0, 0.0, 1.0)) * dt_scale;
      newSed = max(0.0, newSed - settle);
    } else {
      newSed = 0.0;
    }
    w.w = clamp(newSed, 0.0, 1.0);

    // 4. Open Boundary Drainage (non-reflective outflow along edges)
    if (open_boundary > 0.5) {
      float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
      float borderSpan = 4.0 / max(viewport.x, viewport.y);
      if (edgeDist < borderSpan) {
        float edgeKeep = smoothstep(1.0 / max(viewport.x, viewport.y), borderSpan, edgeDist);
        w.x *= edgeKeep;
        w.yz *= edgeKeep;
        if (edgeKeep <= 0.01) {
          w.w = 0.0;
        }
      }
    }

    gl_FragColor = w;
  }
`;

export function createWaterCycleMaterial(width = 512, height = 512) {
  const defaultSources = Array.from({ length: MAX_SOURCES }, () => new THREE.Vector4(0, 0, 0, 0));
  const defaultSediment = new Array(MAX_SOURCES).fill(0.2);

  return new THREE.ShaderMaterial({
    vertexShader: quadVertexShader,
    fragmentShader: waterCycleFragmentShader,
    uniforms: {
      water: { value: null },
      ground: { value: null },
      soilProps: { value: null },
      viewport: { value: new THREE.Vector2(width, height) },
      screen: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      mousepos: { value: new THREE.Vector2(0, 0) },
      rain: { value: 0.0 },
      rain_rate: { value: 10.0 },
      evaporate: { value: 1.0 },
      evaporate_rate: { value: 1.0 },
      create: { value: 0.0 },
      editsize: { value: 3.0 },
      open_boundary: { value: 1.0 },
      erode_rate: { value: 1.0 },
      soil_erodibility: { value: 1.5 },
      dt_scale: { value: 1.0 },
      worldSize: { value: 1.0 },
      verticalScale: { value: 1.0 },
      water_sources: { value: defaultSources },
      source_sediment: { value: defaultSediment },
      storm_zone: { value: new THREE.Vector4(0.5, 0.75, 0.15, 0.0) },
      inv_view: { value: new THREE.Matrix4() },
      inv_proj: { value: new THREE.Matrix4() },
      inv_rot: { value: new THREE.Matrix3() }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}

// 4. Water Normals Shader (8-Neighbor Smooth Cross Product)
const waterNormalsFragmentShader = `
  uniform vec2 viewport;
  uniform sampler2D ground, water;
  uniform float worldSize, verticalScale;

  vec3 get(float x, float y) {
    vec2 uv = (gl_FragCoord.xy + vec2(x, y)) / viewport;
    float g = texture2D(ground, uv).x;
    float w = texture2D(water, uv).x;
    return vec3(uv.x * worldSize, (g + w) * verticalScale, uv.y * worldSize);
  }

  vec3 getn(vec3 pos, float x, float y) {
    vec3 v = get(x, y) - pos;
    vec3 perp = cross(vec3(0.0, 1.0, 0.0), v);
    return normalize(cross(v, perp));
  }

  void main() {
    vec3 pos = get(0.0, 0.0);
    vec3 normal = normalize((
      getn(pos, -1.0,  1.0) +
      getn(pos,  0.0,  1.0) +
      getn(pos,  1.0,  1.0) +
      getn(pos, -1.0,  0.0) +
      getn(pos,  1.0,  0.0) +
      getn(pos, -1.0, -1.0) +
      getn(pos,  0.0, -1.0) +
      getn(pos,  1.0, -1.0)
    ) / 8.0);
    gl_FragColor = vec4(normal, 1.0);
  }
`;

export function createWaterNormalsMaterial(width = 512, height = 512) {
  return new THREE.ShaderMaterial({
    vertexShader: quadVertexShader,
    fragmentShader: waterNormalsFragmentShader,
    uniforms: {
      ground: { value: null },
      water: { value: null },
      viewport: { value: new THREE.Vector2(width, height) },
      worldSize: { value: 1.0 },
      verticalScale: { value: 1.0 }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}

// 5. Flows Shader (Velocity Advection & Accumulation for ripple animation)
const flowsFragmentShader = `
  uniform sampler2D water, flows;
  uniform vec2 viewport;
  uniform float flow_speed;

  void main() {
    vec2 uv = gl_FragCoord.xy / viewport;
    vec2 pos = texture2D(flows, uv).xy;
    vec3 w = texture2D(water, uv).xyz;
    vec2 vel = (w.yz * 0.008 * flow_speed) / (w.x * 0.25 + 0.001);
    gl_FragColor = vec4(pos + vel, 0.0, 1.0);
  }
`;

export function createFlowsMaterial(width = 128, height = 128) {
  return new THREE.ShaderMaterial({
    vertexShader: quadVertexShader,
    fragmentShader: flowsFragmentShader,
    uniforms: {
      flows: { value: null },
      water: { value: null },
      viewport: { value: new THREE.Vector2(width, height) },
      flow_speed: { value: 1.0 }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}

// 6. Copy Shader
const copyFragmentShader = `
  uniform sampler2D source;
  varying vec2 vUv;

  void main() {
    gl_FragColor = texture2D(source, vUv);
  }
`;

export function createCopyMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: quadVertexShader,
    fragmentShader: copyFragmentShader,
    uniforms: {
      source: { value: null }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}

// 7. Clear Shader
const clearFragmentShader = `
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
  }
`;

export function createClearMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: quadVertexShader,
    fragmentShader: clearFragmentShader,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}
