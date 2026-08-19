import * as THREE from 'three';

const vertexShader = `
  uniform sampler2D heights, water_heights;
  attribute vec4 cell_uv;
  
  varying float h;
  varying vec2 vUv;
  varying vec4 vPosition;
  varying vec4 vCellUv;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vCellUv = cell_uv;
    float h1 = texture2D(heights, uv).x;
    float h2 = texture2D(water_heights, uv).x;
    h = h2;
    
    vec3 worldPos = vec3(position.x, h1 + h2 - 0.0001, position.z);
    vWorldPos = worldPos;
    vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
    vPosition = mvPosition;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  varying float h;
  varying vec2 vUv;
  varying vec4 vPosition;
  varying vec4 vCellUv;
  varying vec3 vWorldPos;

  uniform vec2 viewport, mousepos;
  uniform mat3 inv_rot;
  uniform mat4 inv_proj, lightview, inv_view;
  uniform float editsize;
  uniform sampler2D water_heights, heights, normals, detail_normals, shadowmap, flows;

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
      vec2 uv_step = vec2(p.x + 0.5, p.z + 0.5);
      if (uv_step.x >= 0.0 && uv_step.x <= 1.0 && uv_step.y >= 0.0 && uv_step.y <= 1.0) {
        float h_ground = texture2D(heights, uv_step).x;
        float h_water = texture2D(heightTex, uv_step).x;
        if (p.y <= h_ground + h_water) {
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
        float hm = texture2D(heights, uv_m).x + texture2D(heightTex, uv_m).x;
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

  vec3 getnormal() {
    float s = 1.0 / 128.0;

    vec2 off = vCellUv.zw * s;

    vec2 center_uv = vCellUv.xy + 1.0 / 2048.0;
    vec2 right_uv = center_uv + vec2(s, 0.0);
    vec2 top_uv = center_uv + vec2(0.0, s);
    vec2 topright_uv = center_uv + vec2(s, s);

    vec2 center_pos = texture2D(flows, center_uv).xy;
    vec2 right_pos = texture2D(flows, right_uv).xy;
    vec2 top_pos = texture2D(flows, top_uv).xy;
    vec2 topright_pos = texture2D(flows, topright_uv).xy;

    vec3 center = normalize(texture2D(detail_normals, vUv * 32.0 - center_pos * 2.0).xyz * 2.0 - 1.0);
    vec3 right = normalize(texture2D(detail_normals, vUv * 32.0 - right_pos * 2.0).xyz * 2.0 - 1.0);
    vec3 top = normalize(texture2D(detail_normals, vUv * 32.0 - top_pos * 2.0).xyz * 2.0 - 1.0);
    vec3 topright = normalize(texture2D(detail_normals, vUv * 32.0 - topright_pos * 2.0).xyz * 2.0 - 1.0);

    vec3 normal1 = mix(center, right, off.x / s);
    vec3 normal2 = mix(top, topright, off.x / s);
    vec3 normal = mix(normal1, normal2, off.y / s);
    return normalize(normal * vec3(1.0, 0.2, 1.0));
  }

  void main() {
    vec3 w = texture2D(water_heights, vUv).xyz;
    
    if (w.x < 0.00001) {
      discard;
    }

    vec3 selection = vec3(1.0, 1.0, 1.0);
    if (editsize > 0.0) {
      vec3 mousevec = get_world_normal(mousepos);
      vec4 eyepos = inv_view * vec4(0.0, 0.0, 0.0, 1.0);
      vec3 intersection = get_ray_terrain_intersection(eyepos.xyz, mousevec, water_heights);
      float dist = distance(vWorldPos, intersection) * pow(editsize, 3.0);
      
      if (dist > mix(0.99, 0.25, editsize / 20.0) && dist < 1.0) {
        selection = vec3(0.12, 0.92, 0.0);
      }
    }

    float speed_factor = clamp(length(w.yz) / 0.02, 0.0, 1.0);
    float depth_factor = clamp(w.x / 0.001, 0.0, 1.0);

    vec3 base_normal = normalize(texture2D(normals, vUv).xyz);
    vec3 tangent = normalize(cross(base_normal, vec3(0.0, 0.0, 1.0)));
    vec3 bitangent = normalize(cross(tangent, base_normal));
    mat3 orthobasis = mat3(tangent, base_normal, bitangent);
    vec3 detail_normal = orthobasis * getnormal();
    vec3 normal = normalize(mix(base_normal * 0.5 + detail_normal * 0.5, detail_normal, speed_factor));
    normal = normalize(mix(normal, base_normal, sqrt(clamp(w.x / 0.0075, 0.0, 1.0)) * 0.75));

    vec3 lightdir = (lightview * vec4(0.0, 0.0, 1.0, 1.0)).xyz;
    vec3 eye_normal = get_world_normal(gl_FragCoord.xy);
    vec3 specular_normal = reflect(eye_normal, normalize(normal * vec3(1.0, 0.35, 1.0)));
    float lambert = pow(max(0.0, dot(specular_normal, lightdir)), 0.5);
    float specular = pow(lambert, 20.0) * 0.9;
    
    vec3 deep = vec3(0.0, 51.0 / 255.0, 128.0 / 255.0) * 0.5;
    vec3 turbulent = vec3(42.0 / 255.0, 212.0 / 255.0, 255.0 / 255.0) * 0.9;

    vec3 color = mix(turbulent, deep, sqrt(clamp(w.x / 0.0075, 0.0, 1.0)));
    // White foam & froth when water flows fast!
    color = mix(color, vec3(1.0, 1.0, 1.0), clamp(pow(speed_factor * 2.0, 3.0), 0.0, 1.0));

    vec3 exident = color * mix(shLight(specular_normal, beach), shLight(normal, beach), 0.75);

    float d = length(vPosition.xyz);
    float shadow = 1.0;
    if (texture2D(shadowmap, vUv).r > 0.0) {
      shadow = texture2D(shadowmap, vUv).x;
    }
    vec3 incident = absorb(d, exident * mix(0.45, 1.0, shadow) * selection + specular * shadow, 2.5) + pow(Kr * d * 0.7, vec3(2.0));

    gl_FragColor = vec4(pow(incident, vec3(1.0 / 1.8)), depth_factor);
  }
`;

export function createWaterDisplayMaterial() {
  const lightviewMatrix = new THREE.Matrix4();
  const mRotX = new THREE.Matrix4().makeRotationX(15 * Math.PI / 180);
  const mRotY = new THREE.Matrix4().makeRotationY(60 * Math.PI / 180);
  lightviewMatrix.multiplyMatrices(mRotX, mRotY).invert();

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      heights: { value: null },
      water_heights: { value: null },
      normals: { value: null },
      detail_normals: { value: null },
      shadowmap: { value: null },
      flows: { value: null },
      viewport: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      mousepos: { value: new THREE.Vector2(0, 0) },
      inv_proj: { value: new THREE.Matrix4() },
      inv_view: { value: new THREE.Matrix4() },
      inv_rot: { value: new THREE.Matrix3() },
      lightview: { value: lightviewMatrix },
      editsize: { value: 3.0 }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}
