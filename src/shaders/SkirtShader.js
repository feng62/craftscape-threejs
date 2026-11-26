import * as THREE from 'three';

const vertexShader = `
  uniform sampler2D heights;
  uniform float worldSize;
  uniform float verticalScale;
  attribute float isTop;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying float vNormY;

  void main() {
    vUv = uv;
    vNormal = normal;

    float surfaceY = texture2D(heights, uv).x;
    float normY = isTop > 0.5 ? surfaceY : position.y;
    vNormY = normY;

    vec3 worldPos = vec3(position.x * worldSize, normY * verticalScale, position.z * worldSize);
    vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform sampler2D heights, soilProps;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying float vNormY;

  void main() {
    if (vNormal.y < -0.5) {
      gl_FragColor = vec4(0.06, 0.07, 0.09, 1.0);
      return;
    }

    vec4 g = texture2D(heights, vUv);
    float typeId = texture2D(soilProps, vUv).a;
    float rockTop = g.y;

    // Match cross-section soil hue to geotechnical soilTypeId
    vec3 soilLayer = vec3(0.45, 0.33, 0.17); // Loess
    if (typeId >= 0.30 && typeId < 0.62) {
      soilLayer = vec3(0.44, 0.21, 0.13);   // Cohesive Red Clay
    } else if (typeId >= 0.62) {
      soilLayer = vec3(0.34, 0.32, 0.29);   // Alluvial Gravel
    }
    vec3 subSoil = soilLayer * 0.72;

    float strata = sin(vNormY * 140.0 + sin(vUv.x * 24.0 + vUv.y * 24.0) * 1.4) * 0.5 + 0.5;
    vec3 rockDark  = vec3(0.16, 0.17, 0.20);
    vec3 rockLight = vec3(0.26, 0.25, 0.24);
    vec3 rockLayer = mix(rockDark, rockLight, strata * 0.65);

    float depthDark = smoothstep(-0.08, 0.12, vNormY);
    rockLayer *= mix(0.55, 1.0, depthDark);

    float isSoil = smoothstep(rockTop - 0.002, rockTop + 0.002, vNormY);
    float soilDepthFade = clamp((g.x - vNormY) / max(0.005, g.z), 0.0, 1.0);
    vec3 soilColor = mix(soilLayer, subSoil, soilDepthFade * 0.6);

    vec3 baseColor = mix(rockLayer, soilColor, isSoil * step(0.001, g.z));

    vec3 lightDir = normalize(vec3(0.6, 0.55, 0.45));
    float ndl = max(0.0, dot(normalize(vNormal), lightDir));
    float sideLight = 0.52 + 0.48 * ndl;

    float bottomRim = smoothstep(-0.075, -0.055, vNormY);
    vec3 finalCol = baseColor * sideLight * mix(0.6, 1.0, bottomRim);

    gl_FragColor = vec4(finalCol, 1.0);
  }
`;

export function createSkirtMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      heights: { value: null },
      soilProps: { value: null },
      worldSize: { value: 1.0 },
      verticalScale: { value: 1.0 }
    },
    side: THREE.DoubleSide
  });
}
