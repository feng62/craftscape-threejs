import * as THREE from 'three';

const vertexShader = `
  uniform sampler2D heights;
  uniform float worldSize;
  uniform float verticalScale;

  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    float y = texture2D(heights, uv).x;
    vec3 worldPos = vec3(position.x * worldSize, y * verticalScale, position.z * worldSize);
    vWorldPos = worldPos;
    vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform sampler2D heights, normals, occlusions, shadowmap, water;
  uniform sampler2D soilProps, initialHeights;
  uniform sampler2D rock, rock_normals;
  uniform sampler2D grass, grass_normals;
  uniform vec2 mousepos, viewport;
  uniform mat4 inv_proj, inv_view;
  uniform mat3 inv_rot;
  uniform float editsize;
  uniform float grassDensity;
  uniform float cursorMode;
  uniform float cursorRadius;
  uniform float worldSize;
  uniform float verticalScale;
  uniform float geologyView;

  varying vec2 vUv;
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
    float topY = 0.85 * verticalScale;
    float t = dir.y < -1e-4 ? max(0.0, (topY - O.y) / dir.y) : 0.0;

    float dt = 0.022 * worldSize;
    vec3 p = O + t * dir;
    bool hit = false;

    for (int i = 0; i < 100; i++) {
      p = O + t * dir;
      vec2 uv_step = vec2(p.x / worldSize + 0.5, p.z / worldSize + 0.5);
      if (uv_step.x >= 0.0 && uv_step.x <= 1.0 && uv_step.y >= 0.0 && uv_step.y <= 1.0) {
        float h = texture2D(heightTex, uv_step).x * verticalScale;
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
        float hm = texture2D(heightTex, uv_m).x * verticalScale;
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
    return color - color * pow(Kr, vec3(factor / max(0.001, dist)));
  }

  void main() {
    vec3 base_normal = normalize(texture2D(normals, vUv).xyz);
    vec3 tangent = normalize(cross(base_normal, vec3(0.0, 0.0, 1.0)));
    vec3 bitangent = normalize(cross(tangent, base_normal));
    mat3 orthobasis = mat3(tangent, base_normal, bitangent);

    vec3 selection = vec3(1.0, 1.0, 1.0);
    if (cursorMode > 0.5) {
      vec3 mousevec = get_world_normal(mousepos);
      vec4 eyepos = inv_view * vec4(0.0, 0.0, 0.0, 1.0);
      vec3 intersection = get_ray_terrain_intersection(eyepos.xyz, mousevec, heights);

      if (cursorMode < 1.5 && editsize > 0.0) {
        float normDist = length(vec3(
          (vWorldPos.x - intersection.x) / worldSize,
          (vWorldPos.y - intersection.y) / max(0.1, verticalScale),
          (vWorldPos.z - intersection.z) / worldSize
        ));
        float dist = normDist * pow(editsize, 3.0);
        if (dist > mix(0.99, 0.25, editsize / 20.0) && dist < 1.0) {
          selection = vec3(0.18, 0.95, 0.12);
        }
      } else if (cursorMode >= 1.5 && cursorRadius > 0.001) {
        float d2 = distance(vWorldPos.xz, intersection.xz) / worldSize;
        if (abs(d2 - cursorRadius) < 0.0035) {
          selection = cursorMode < 2.5 ? vec3(0.15, 0.88, 1.0) : vec3(0.45, 0.72, 1.0);
        }
      }
    }

    vec3 w = texture2D(water, vUv).xyz;
    vec4 ground = texture2D(heights, vUv);
    vec4 initG  = texture2D(initialHeights, vUv);
    vec4 prop   = texture2D(soilProps, vUv);

    float subsidence = prop.r;
    float incision   = prop.g;
    float cohesion   = prop.b;
    float typeId     = prop.a;

    float deltaH = ground.x - initG.x;
    float inciseHighlight = smoothstep(-0.0008, -0.009, deltaH);
    float depositHighlight = smoothstep(0.0008, 0.008, deltaH);

    float texScale = pow(max(1.0, worldSize), 0.72);
    float rock_factor = 18.0 * texScale;
    vec3 rock_tex = texture2D(rock, vUv * rock_factor).rgb * 0.78;
    vec3 rock_normal = orthobasis * normalize((texture2D(rock_normals, vUv * rock_factor).xyz - 0.5) * vec3(1.8, 2.8, 1.8));

    float grass_factor = 9.0 * texScale;
    vec3 grass_tex = texture2D(grass, vUv * grass_factor).rgb;
    vec3 grass_normal = orthobasis * normalize((texture2D(grass_normals, vUv * grass_factor).xyz - 0.5) * vec3(1.8, 1.2, 1.8));

    // Macro organic tint variation across large watersheds
    float macroVar = 0.90 + 0.18 * sin(vUv.x * 11.0 * texScale + sin(vUv.y * 8.0 * texScale));
    rock_tex *= macroVar;

    vec3 color;
    vec3 normal;

    if (geologyView > 0.5) {
      // --- Diagnostic Geotechnical Distribution View ---
      vec3 cLoess   = vec3(0.95, 0.68, 0.22); // Collapsible Loess (Amber-Gold)
      vec3 cClay    = vec3(0.84, 0.31, 0.24); // Cohesive Gully Clay (Terracotta Red)
      vec3 cGravel  = vec3(0.36, 0.66, 0.72); // Stable Gravel (Teal-Slate)
      vec3 cBedrock = vec3(0.32, 0.36, 0.42); // Bare Bedrock (Dark Slate)

      if (typeId < 0.30) {
        color = cLoess;
      } else if (typeId < 0.62) {
        color = cClay;
      } else if (typeId < 0.85) {
        color = cGravel;
      } else {
        color = cBedrock;
      }

      // Highlight fresh gully incision & subsidence zones in geology mode
      color = mix(color, vec3(1.0, 0.94, 0.45), inciseHighlight * (1.0 - subsidence) * 0.55);
      color = mix(color, vec3(0.45, 0.20, 0.08), inciseHighlight * subsidence * 0.60);
      color = mix(color, vec3(0.60, 0.85, 0.98), depositHighlight * 0.45);
      normal = base_normal;
    } else {
      // --- Realistic Aerial-DEM Palette ---
      // Distinct natural soil hues per soilTypeId
      vec3 loessBase  = vec3(0.56, 0.43, 0.24) * (0.82 + 0.36 * grass_tex.r);
      vec3 clayBase   = vec3(0.49, 0.26, 0.16) * (0.82 + 0.36 * grass_tex.r);
      vec3 gravelBase = vec3(0.40, 0.38, 0.35) * (0.80 + 0.40 * rock_tex.r);

      vec3 soilHue = loessBase;
      if (typeId >= 0.30 && typeId < 0.62) {
        soilHue = clayBase;
      } else if (typeId >= 0.62) {
        soilHue = gravelBase;
      }

      // Natural aerial meadow/woodland green cover on gentler vegetated slopes
      vec3 aerialGreen = mix(vec3(0.22, 0.31, 0.15), vec3(0.30, 0.38, 0.19), grass_tex.g) * (0.88 + 0.20 * macroVar);
      float vegSuitability = typeId < 0.30 ? 0.52 : (typeId < 0.62 ? 0.96 : 0.45);
      float flatness = clamp(base_normal.y, 0.0, 1.0);
      float vegMask = smoothstep(0.68, 0.92, flatness) * clamp(grassDensity, 0.0, 1.0) * vegSuitability;

      // Fresh gully incisions strip away vegetation and expose bright/terracotta soil walls
      float scour = clamp(w.x / 0.00028 + length(w.yz) / 0.012 + ground.w * 0.65 + inciseHighlight * 1.4, 0.0, 1.0);
      vec3 wetMud = soilHue * 0.44;
      vec3 freshCutWall = mix(soilHue * 1.18, vec3(0.62, 0.34, 0.18), cohesion * 0.55);

      vec3 bareSoil = mix(soilHue, wetMud, clamp(ground.w * 0.80 + clamp(w.x / 0.0004, 0.0, 1.0) * 0.45, 0.0, 1.0));
      bareSoil = mix(bareSoil, freshCutWall, inciseHighlight * cohesion * 0.72);
      // Subsidence slump zone darkens into damp slump mud
      bareSoil = mix(bareSoil, vec3(0.24, 0.16, 0.09), inciseHighlight * subsidence * 0.78);
      // Alluvial deposition fans get light sandy-ochre silt coat
      bareSoil = mix(bareSoil, vec3(0.55, 0.44, 0.30), depositHighlight * 0.60);

      vec3 soilColor = mix(bareSoil, aerialGreen, vegMask * (1.0 - scour * 0.92));

      float soilPresence = smoothstep(0.0008, 0.010, ground.z);
      color = mix(rock_tex * vec3(0.95, 0.93, 0.90), soilColor, soilPresence);
      normal = normalize(mix(rock_normal, grass_normal, soilPresence * 0.85));

      float rockWet = ground.w * (1.0 - soilPresence);
      color *= mix(1.0, 0.62, rockWet);
    }

    // Aerial sunlight + SH sky illumination + AO
    vec3 sunDir = normalize(vec3(0.62, 0.58, 0.52));
    float sunDiff = max(0.0, dot(normal, sunDir));
    float occlusion = mix(0.22, 1.0, texture2D(occlusions, vUv).x);
    float shadowed = 1.0;
    if (texture2D(shadowmap, vUv).r > 0.0) {
      shadowed = mix(0.38, 1.0, texture2D(shadowmap, vUv).x);
    }

    vec3 skyDiffuse = shLight(normal, beach) * 0.58;
    vec3 sunLight = vec3(1.05, 0.99, 0.90) * sunDiff * 0.58;
    vec3 exident = (skyDiffuse + sunLight) * occlusion * shadowed * color;

    float d = length(vWorldPos) / max(1.0, worldSize);
    vec3 incident = absorb(d, exident * selection, 2.8) + pow(Kr * d * 0.42, vec3(2.0));

    gl_FragColor = vec4(pow(max(incident, vec3(0.0)), vec3(1.0 / 1.8)), 1.0);
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
      soilProps: { value: null },
      initialHeights: { value: null },
      rock: { value: null },
      rock_normals: { value: null },
      grass: { value: null },
      grass_normals: { value: null },
      mousepos: { value: new THREE.Vector2(0, 0) },
      viewport: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      inv_proj: { value: new THREE.Matrix4() },
      inv_view: { value: new THREE.Matrix4() },
      inv_rot: { value: new THREE.Matrix3() },
      editsize: { value: 3.0 },
      grassDensity: { value: 0.65 },
      cursorMode: { value: 0.0 },
      cursorRadius: { value: 0.04 },
      worldSize: { value: 1.0 },
      verticalScale: { value: 1.0 },
      geologyView: { value: 0.0 }
    },
    side: THREE.DoubleSide
  });
}
