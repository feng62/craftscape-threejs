import * as THREE from 'three';

const quadVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// Water Diffuse Shader (Physical Height Difference Exchange)
const waterDiffuseFragmentShader = `
  uniform sampler2D heights, source;
  uniform vec2 viewport, axis;

  vec3 exchange(float t1, float h1, vec2 off) {
    vec2 uv = (gl_FragCoord.xy + off) / viewport;
    float t2 = texture2D(heights, uv).x;
    float h2 = texture2D(source, uv).x;
    float f1 = t1 + h1;
    float f2 = t2 + h2;
    float diff = (f2 - f1) / 2.0;
    diff = clamp(diff * 0.65, -h1 / 2.0, h2 / 2.0);
    return vec3(diff, -off * diff);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / viewport;
    float t = texture2D(heights, uv).x;
    vec3 h = texture2D(source, uv).xyz;
    vec3 r = h + exchange(t, h.x, axis) + exchange(t, h.x, -axis);
    gl_FragColor = vec4(r, 1.0);
  }
`;

export function createWaterDiffuseMaterial(width = 512, height = 512) {
  return new THREE.ShaderMaterial({
    vertexShader: quadVertexShader,
    fragmentShader: waterDiffuseFragmentShader,
    uniforms: {
      heights: { value: null },
      source: { value: null },
      viewport: { value: new THREE.Vector2(width, height) },
      axis: { value: new THREE.Vector2(0, 1) }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}

// Water Momentum Shader
const waterMomentumFragmentShader = `
  uniform sampler2D current, last, ground;
  uniform vec2 viewport;
  uniform float flow_speed;

  vec4 get(sampler2D src, float x, float y) {
    return texture2D(src, (gl_FragCoord.xy + vec2(x, y)) / viewport);
  }
  
  vec3 exchange(float g1, vec3 l1, vec3 c1, float x, float y) {
    float g2 = get(ground, x, y).x;
    vec3 c2 = get(current, x, y).xyz;
    float change = (g2 + c2.x) - (g1 + l1.x);
    change = clamp(change * 1.00 * flow_speed, -c1.x * 0.25, c2.x * 0.25);
    return vec3(change, vec2(-x * change, -y * change));
  }

  void main() {
    float g = get(ground, 0.0, 0.0).x;
    vec3 l = get(last, 0.0, 0.0).xyz;
    vec3 c = get(current, 0.0, 0.0).xyz;

    vec3 v = (
      exchange(g, l, c,  1.0,  0.0) +
      exchange(g, l, c, -1.0,  0.0) +
      exchange(g, l, c,  0.0,  1.0) +
      exchange(g, l, c,  0.0, -1.0)
    ) * vec3(0.25, 0.25, 0.25);
    
    vec3 n = c + v;
    gl_FragColor = vec4(n, 1.0);
  }
`;

export function createWaterMomentumMaterial(width = 512, height = 512) {
  return new THREE.ShaderMaterial({
    vertexShader: quadVertexShader,
    fragmentShader: waterMomentumFragmentShader,
    uniforms: {
      current: { value: null },
      last: { value: null },
      ground: { value: null },
      viewport: { value: new THREE.Vector2(width, height) },
      flow_speed: { value: 1.0 }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}

// Water Cycle Shader
const waterCycleFragmentShader = `
  uniform sampler2D water;
  uniform vec2 viewport, screen, mousepos;
  uniform float rain, rain_rate, evaporate, evaporate_rate, create, editsize;
  
  uniform mat4 inv_view, inv_proj;
  uniform mat3 inv_rot;
  
  vec2 get(float x, float y) {
    return texture2D(water, (gl_FragCoord.xy + vec2(x, y)) / viewport).yz;
  }
  
  vec3 get_world_normal(vec2 coord) {
    vec2 frag_coord = coord / screen;
    frag_coord = (frag_coord - 0.5) * 2.0;
    vec4 device_normal = vec4(frag_coord, 0.0, 1.0);
    vec3 eye_normal = normalize((inv_proj * device_normal).xyz);
    vec3 world_normal = normalize(inv_rot * eye_normal);
    return world_normal;
  }

  vec3 get_ray_terrain_intersection(vec3 O, vec3 D, sampler2D heightTex) {
    vec3 dir = normalize(D);
    float t = (0.8 - O.y) / dir.y;
    if (t < 0.0) t = 0.0;
    
    float dt = 0.015;
    vec3 p = O + t * dir;
    bool hit = false;
    
    for (int i = 0; i < 45; i++) {
      p = O + t * dir;
      vec2 uv = vec2(p.x + 0.5, p.z + 0.5);
      if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
        float h = texture2D(heightTex, uv).x;
        if (p.y <= h) {
          hit = true;
          break;
        }
      }
      t += dt;
    }
    
    if (hit) {
      float t0 = t - dt;
      float t1 = t;
      for (int j = 0; j < 5; j++) {
        float tm = (t0 + t1) * 0.5;
        vec3 pm = O + tm * dir;
        vec2 uv_m = vec2(pm.x + 0.5, pm.z + 0.5);
        float hm = texture2D(heightTex, uv_m).x;
        if (pm.y <= hm) {
          t1 = tm;
        } else {
          t0 = tm;
        }
      }
      return O + t1 * dir;
    }
    
    float u0 = (0.0 - O.y) / dir.y;
    return O + dir * u0;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / viewport;
    
    vec3 mousevec = get_world_normal(mousepos);
    vec4 eyepos = inv_view * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 intersection = get_ray_terrain_intersection(eyepos.xyz, mousevec, water);
    vec3 position = vec3(uv.x - 0.5, texture2D(water, uv).x, uv.y - 0.5);
    float dist = distance(position, intersection) * pow(editsize, 3.0);
    float s = smoothstep(1.0, 0.0, dist);

    vec3 w = texture2D(water, uv).xyz;
    w.x += 0.00000005 * rain * rain_rate;
    w.x *= mix(1.0, 1.0 - 0.000075 * evaporate_rate, evaporate);
    w.x += s * create * 0.0001;
    w.x = clamp(w.x, 0.0, 1.0);
    w.yz = (
      get(-1.0, -1.0)*1.0  + get(0.0, -1.0)*1.4  + get(1.0, -1.0)*1.0 +
      get(-1.0,  0.0)*1.4  + w.yz*300.0            + get(1.0, -1.0)*1.4 +
      get(-1.0, -1.0)*1.0  + get(0.0, -1.0)*1.4  + get(1.0, -1.0)*1.0
    ) * 0.98 * (1.0 / (300.0 + 1.4 * 4.0 + 4.0));
    gl_FragColor = vec4(w, 1.0);
  }
`;

export function createWaterCycleMaterial(width = 512, height = 512) {
  return new THREE.ShaderMaterial({
    vertexShader: quadVertexShader,
    fragmentShader: waterCycleFragmentShader,
    uniforms: {
      water: { value: null },
      viewport: { value: new THREE.Vector2(width, height) },
      screen: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      mousepos: { value: new THREE.Vector2(0, 0) },
      rain: { value: 1.0 },
      rain_rate: { value: 10.0 },
      evaporate: { value: 1.0 },
      evaporate_rate: { value: 1.0 },
      create: { value: 0.0 },
      editsize: { value: 3.0 },
      inv_view: { value: new THREE.Matrix4() },
      inv_proj: { value: new THREE.Matrix4() },
      inv_rot: { value: new THREE.Matrix3() }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}

// Water Normals Shader (8-Neighbor Smooth Cross Product)
const waterNormalsFragmentShader = `
  uniform vec2 viewport;
  uniform sampler2D ground, water;

  vec3 get(float x, float y) {
    vec2 uv = (gl_FragCoord.xy + vec2(x, y)) / viewport;
    float g = texture2D(ground, uv).x;
    float w = texture2D(water, uv).x;
    float h = g + w;
    return vec3(uv.x, h, uv.y);
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
      viewport: { value: new THREE.Vector2(width, height) }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}

// Flows Shader (Velocity Advection & Accumulation)
const flowsFragmentShader = `
  uniform sampler2D water, flows;
  uniform vec2 viewport;
  uniform float flow_speed;

  void main() {
    vec2 uv = gl_FragCoord.xy / viewport;
    vec2 pos = texture2D(flows, uv).xy;
    vec3 w = texture2D(water, uv).xyz;
    vec2 vel = (w.yz * 0.001 * flow_speed) / (w.x * 0.1 + 0.001);
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

// Copy Shader
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
