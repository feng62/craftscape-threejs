import * as THREE from 'three';

const normalVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const normalFragmentShader = `
  uniform sampler2D heights;
  uniform vec2 viewport;

  vec4 get(float x, float y) {
    return texture2D(heights, (gl_FragCoord.xy + vec2(x, y)) / viewport);
  }

  void main() {
    float top   = get( 0.0,  1.0).x;
    float bot   = get( 0.0, -1.0).x;
    float left  = get(-1.0,  0.0).x;
    float right = get( 1.0,  0.0).x;

    vec3 normal = normalize(vec3((left - right), 0.005, (bot - top)));
    gl_FragColor = vec4(normal, 1.0);
  }
`;

export function createNormalMaterial(width = 512, height = 512) {
  return new THREE.ShaderMaterial({
    vertexShader: normalVertexShader,
    fragmentShader: normalFragmentShader,
    uniforms: {
      heights: { value: null },
      viewport: { value: new THREE.Vector2(width, height) }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}

const occlusionVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const occlusionFragmentShader = `
  uniform sampler2D heights, normals;
  uniform vec2 viewport;

  vec4 get_height(float x, float y) {
    return texture2D(heights, (gl_FragCoord.xy + vec2(x, y)) / viewport);
  }
  vec3 get_normal(float x, float y) {
    return texture2D(normals, (gl_FragCoord.xy + vec2(x, y)) / viewport).xyz;
  }

  void main() {
    float h = get_height(0.0, 0.0).x;
    vec3 n  = get_normal(0.0, 0.0);

    float total_diff = 0.0;
    float samples = 0.0;

    for (float x = -3.0; x <= 3.0; x += 1.0) {
      for (float y = -3.0; y <= 3.0; y += 1.0) {
        if (x != 0.0 || y != 0.0) {
          float sample_h = get_height(x, y).x;
          vec3 diff_vec = vec3(x / viewport.x, sample_h - h, y / viewport.y);
          float d = length(diff_vec);
          float ao = max(0.0, dot(n, diff_vec / d)) / (1.0 + d * 50.0);
          total_diff += ao;
          samples += 1.0;
        }
      }
    }
    float occlusion = clamp(1.0 - (total_diff / samples) * 8.0, 0.0, 1.0);
    gl_FragColor = vec4(occlusion, occlusion, occlusion, 1.0);
  }
`;

export function createOcclusionMaterial(width = 512, height = 512) {
  return new THREE.ShaderMaterial({
    vertexShader: occlusionVertexShader,
    fragmentShader: occlusionFragmentShader,
    uniforms: {
      heights: { value: null },
      normals: { value: null },
      viewport: { value: new THREE.Vector2(width, height) }
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
}
