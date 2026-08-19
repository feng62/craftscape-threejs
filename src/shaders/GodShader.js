import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D ground;
  uniform vec2 viewport, screen, mousepos;
  uniform mat4 inv_view, inv_proj;
  uniform mat3 inv_rot;
  uniform float delta, rockfactor, soilfactor, editsize;

  vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }
  vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }
  vec4 permute(vec4 x) {
    return mod289(((x*34.0)+1.0)*x);
  }
  vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
  }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
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

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
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
    vec4 g = texture2D(ground, uv);

    vec3 mousevec = get_world_normal(mousepos);
    vec4 eyepos = inv_view * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 intersection = get_ray_terrain_intersection(eyepos.xyz, mousevec, ground);
    vec3 position = vec3(uv.x - 0.5, g.x, uv.y - 0.5);
    float dist = distance(position, intersection) * pow(editsize, 3.0);
    float s = smoothstep(1.0, 0.0, dist);

    float h = 0.1;
    for(int i=2; i<8; i++){
      float factor = pow(2.0, float(i));
      h += snoise(vec3(uv * factor, 0.05 * delta * float(i+1))) / (pow(factor, 0.8) * 6.0);
    }

    g.y += h * rockfactor * s * 0.01;
    g.z += h * soilfactor * s * 0.01;
    g.z = clamp(g.z, 0.0, 1.0);
    g.x = g.y + g.z;

    gl_FragColor = g;
  }
`;

export function createGodMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      ground: { value: null },
      viewport: { value: new THREE.Vector2(512, 512) },
      screen: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      mousepos: { value: new THREE.Vector2(0, 0) },
      inv_view: { value: new THREE.Matrix4() },
      inv_proj: { value: new THREE.Matrix4() },
      inv_rot: { value: new THREE.Matrix3() },
      delta: { value: 0 },
      rockfactor: { value: 0 },
      soilfactor: { value: 0 },
      editsize: { value: 3.0 }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}
