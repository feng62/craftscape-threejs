import * as THREE from 'three';

const vertexShader = `
  uniform mat4 proj, view;
  uniform sampler2D heights;
  uniform vec2 viewport;

  attribute vec3 barycentric;
  
  varying vec2 vUv;
  varying vec3 vBarycentric;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vBarycentric = barycentric;
    float y = texture2D(heights, uv).x;
    vec3 worldPos = vec3(position.x, y, position.z);
    vWorldPos = worldPos;
    vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform sampler2D heights, normals, occlusions, shadowmap, water;
  uniform sampler2D rock, rock_normals;
  uniform sampler2D grass, grass_normals;
  uniform vec2 mousepos, viewport;
  uniform mat4 inv_proj, inv_view;
  uniform mat3 inv_rot;
  uniform float editsize;

  varying vec2 vUv;
  varying vec3 vBarycentric;
  varying vec3 vWorldPos;

  vec3 get_world_normal(vec2 coord) {
    vec2 frag_coord = coord / viewport;
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

  struct SHC {
    vec3 L00, L1m1, L10, L11, L2m2, L2m1, L20, L21, L22;
  };

  SHC beach = SHC(
    vec3( 0.6841148,  0.6929004,  0.7069543),
    vec3( 0.3173355,  0.3694407,  0.4406839),
    vec3(-0.1747193, -0.1737154, -0.1657420),
    vec3(-0.4496467, -0.4155184, -0.3416573),
    vec3(-0.1690202, -0.1703022, -0.1525870),
    vec3(-0.0837808, -0.0940454, -0.1027518),
    vec3(-0.0319670, -0.0214051, -0.0147691),
    vec3( 0.1641816,  0.1377558,  0.1010403),
    vec3( 0.3697189,  0.3097930,  0.2029923)
  );

  vec3 shLight(vec3 normal, SHC l) {
    float x = normal.x;
    float y = normal.y;
    float z = normal.z;

    const float C1 = 0.429043;
    const float C2 = 0.511664;
    const float C3 = 0.743125;
    const float C4 = 0.886227;
    const float C5 = 0.247708;

    return (
      C1 * l.L22 * (x * x - y * y) +
      C3 * l.L20 * z * z +
      C4 * l.L00 -
      C5 * l.L20 +
      2.0 * C1 * l.L2m2 * x * y +
      2.0 * C1 * l.L21  * x * z +
      2.0 * C1 * l.L2m1 * y * z +
      2.0 * C2 * l.L11  * x +
      2.0 * C2 * l.L1m1 * y +
      2.0 * C2 * l.L10  * z
    );
  }
  
  vec3 Kr = vec3(0.18867780436772762, 0.4978442963618773, 0.6616065586417131);
  vec3 absorb(float dist, vec3 color, float factor) {
    return color - color * pow(Kr, vec3(factor / dist));
  }

  void main() {
    vec3 base_normal = normalize(texture2D(normals, vUv).xyz);
    vec3 tangent = normalize(cross(base_normal, vec3(0.0, 0.0, 1.0)));
    vec3 bitangent = normalize(cross(tangent, base_normal));
    mat3 orthobasis = mat3(tangent, base_normal, bitangent);

    vec3 selection = vec3(1.0, 1.0, 1.0);
    if (editsize > 0.0) {
      vec3 mousevec = get_world_normal(mousepos);
      vec4 eyepos = inv_view * vec4(0.0, 0.0, 0.0, 1.0);
      vec3 intersection = get_ray_terrain_intersection(eyepos.xyz, mousevec, heights);
      float dist = distance(vWorldPos, intersection) * pow(editsize, 3.0);
      
      if (dist > mix(0.99, 0.25, editsize / 20.0) && dist < 1.0) {
        selection = vec3(0.12, 0.92, 0.0);
      }
    }
  
    vec3 w = texture2D(water, vUv).xyz;
    float rock_factor = 20.0;
    vec3 rock_color = texture2D(rock, vUv * rock_factor).rgb * 0.8;
    vec3 rock_normal = orthobasis * normalize((texture2D(rock_normals, vUv * rock_factor).xyz - 0.5) * vec3(2.0, 3.0, 2.0));
    
    float grass_factor = 8.0;
    vec3 grass_color = texture2D(grass, vUv * grass_factor).rgb;
    vec3 grass_normal = orthobasis * normalize((texture2D(grass_normals, vUv * grass_factor).xyz - 0.5) * vec3(2.0, 1.0, 2.0));

    vec3 dirt = vec3(85.0 / 255.0, 34.0 / 255.0, 0.0);
    vec3 soil = mix(grass_color, dirt, sqrt(clamp(w.x / 0.0003 + length(w.yz) / 0.015, 0.0, 1.0)));
    
    vec4 ground = texture2D(heights, vUv);
    float mix_factor = clamp(ground.z * 500.0, 0.0, 1.0);
    vec3 color = mix(rock_color, soil, mix_factor).xyz;
    vec3 normal = mix(rock_normal, grass_normal, mix_factor).xyz;

    float occlusion = mix(0.0, 1.0, texture2D(occlusions, vUv).x);
    float shadowed = 1.0;
    if (texture2D(shadowmap, vUv).r > 0.0) {
      shadowed = mix(0.3, 1.0, texture2D(shadowmap, vUv).x);
    }
    vec3 diffuse = shLight(normal, beach);
    vec3 exident = diffuse * occlusion * shadowed * color;
    float d = length(vWorldPos);
    vec3 incident = absorb(d, exident * selection, 2.5) + pow(Kr * d * 0.7, vec3(2.0));

    gl_FragColor = vec4(pow(incident, vec3(1.0 / 1.8)), 1.0);
  }
`;

export function createDisplayMaterial(width = 512, height = 512) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      heights: { value: null },
      normals: { value: null },
      occlusions: { value: null },
      shadowmap: { value: null },
      water: { value: null },
      rock: { value: null },
      rock_normals: { value: null },
      grass: { value: null },
      grass_normals: { value: null },
      mousepos: { value: new THREE.Vector2(0, 0) },
      viewport: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      inv_proj: { value: new THREE.Matrix4() },
      inv_view: { value: new THREE.Matrix4() },
      inv_rot: { value: new THREE.Matrix3() },
      editsize: { value: 3.0 }
    },
    side: THREE.DoubleSide
  });
}
