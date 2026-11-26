import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import './style.css';
import { LANDFORM_PRESETS, GEOLOGY_PRESETS } from './config/presets.js';
import { HexGridGeometry } from './geometries/HexGridGeometry.js';
import { GridGeometry } from './geometries/GridGeometry.js';
import { SkirtGeometry } from './geometries/SkirtGeometry.js';
import { TerrainSim } from './simulation/TerrainSim.js';
import { WaterSources } from './simulation/WaterSources.js';
import { createDisplayMaterial } from './shaders/DisplayShader.js';
import { createWaterDisplayMaterial } from './shaders/WaterDisplayShader.js';
import { createSkirtMaterial } from './shaders/SkirtShader.js';
import { SculptController } from './controls/SculptController.js';
import { RainParticles } from './effects/RainParticles.js';
import { SourceMarkers } from './effects/SourceMarkers.js';
import { HudController } from './ui/HudController.js';

function createSkyDome() {
  const geo = new THREE.SphereGeometry(140, 32, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        vec3 zenith  = vec3(0.06, 0.11, 0.18);
        vec3 horizon = vec3(0.14, 0.21, 0.30);
        vec3 nadir   = vec3(0.04, 0.06, 0.09);
        vec3 col = h >= 0.0
          ? mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.6))
          : mix(horizon, nadir, pow(clamp(-h, 0.0, 1.0), 0.7));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  return new THREE.Mesh(geo, mat);
}

function calcVerticalScale(size) {
  return Math.pow(Math.max(1, size), 0.48);
}

async function init() {
  const container = document.getElementById('app');

  // 1. Renderer Setup
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0e141f, 1);
  container.appendChild(renderer.domElement);

  if (!renderer.capabilities.isWebGL2 && !renderer.extensions.get('OES_texture_float')) {
    alert('您的浏览器不支持浮点纹理（OES_texture_float / WebGL2），物理水动力模拟无法运行。');
    return;
  }

  // 2. Camera & OrbitControls
  const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.02, 280);
  camera.position.set(0.58, 0.78, -0.82);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 0.08, 0);
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 0.25;
  controls.maxDistance = 4.0;

  const sculptController = new SculptController(renderer.domElement);

  // 3. Textures
  const textureLoader = new THREE.TextureLoader();
  const loadTex = (path) => {
    const t = textureLoader.load(path);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    return t;
  };

  const rockTex = loadTex('/textures/rock2_material.png');
  const rockNormals = loadTex('/textures/rock2_normals.png');
  const grassTex = loadTex('/textures/grass_material.png');
  const grassNormals = loadTex('/textures/grass_normals.png');

  // 4. Simulation State
  const initialPreset = LANDFORM_PRESETS[0];
  const state = {
    activeLandformId: initialPreset.id,
    world: {
      size: 1,
      verticalScale: calcVerticalScale(1),
      landformScale: 1.0,
      simSize: 512,
      userLockedSimSize: false
    },
    terrain: { ...initialPreset.terrain },
    geology: { ...initialPreset.geology },
    physics: {
      paused: false,
      openBoundary: true,
      substeps: 2,
      flowSpeed: 1.4,
      erode: true,
      erodeRate: 1.2,
      rockHardness: 1.5,
      soilErodibility: 1.6,
      soilSlip: 1.1,
      evaporate: true,
      evaporateRate: 0.8,
      rain: false,
      rainRate: 18,
      rainSpeed: 1.6
    },
    visual: {
      mudIntensity: 1.1,
      grassDensity: 0.65,
      meshStyle: 'smooth',
      showSkirt: true,
      showMarkers: true,
      geologyView: false
    }
  };

  let terrainSim = new TerrainSim(renderer, state.world.simSize, state.world.simSize);
  const waterSources = new WaterSources();

  // 5. Geometries & Materials
  let gridGeometry = new GridGeometry({ xsize: state.world.simSize, ysize: state.world.simSize, width: 1, height: 1 });
  let hexGeometry = null;
  let skirtGeometry = new SkirtGeometry({ xsize: state.world.simSize, ysize: state.world.simSize, width: 1, height: 1, baseHeight: -0.075 });

  const displayMat = createDisplayMaterial(window.innerWidth, window.innerHeight);
  const waterDisplayMat = createWaterDisplayMaterial();
  const skirtMat = createSkirtMaterial();

  displayMat.uniforms.rock.value = rockTex;
  displayMat.uniforms.rock_normals.value = rockNormals;
  displayMat.uniforms.grass.value = grassTex;
  displayMat.uniforms.grass_normals.value = grassNormals;
  displayMat.uniforms.grassDensity.value = state.visual.grassDensity;

  waterDisplayMat.uniforms.detail_normals.value = grassNormals;
  waterDisplayMat.uniforms.mudIntensity.value = state.visual.mudIntensity;

  const bindSimTextures = () => {
    displayMat.uniforms.heights.value = terrainSim.heights.texture;
    displayMat.uniforms.normals.value = terrainSim.normals.texture;
    displayMat.uniforms.occlusions.value = terrainSim.occlusions.texture;
    displayMat.uniforms.water.value = terrainSim.water.current.texture;
    displayMat.uniforms.soilProps.value = terrainSim.soilProps.texture;
    displayMat.uniforms.initialHeights.value = terrainSim.initialHeights.texture;

    waterDisplayMat.uniforms.heights.value = terrainSim.heights.texture;
    waterDisplayMat.uniforms.water_heights.value = terrainSim.water.current.texture;
    waterDisplayMat.uniforms.normals.value = terrainSim.water.normals.texture;
    waterDisplayMat.uniforms.flows.value = terrainSim.water.flows.texture;
    waterDisplayMat.uniforms.simSize.value.set(terrainSim.width, terrainSim.height);

    skirtMat.uniforms.heights.value = terrainSim.heights.texture;
    skirtMat.uniforms.soilProps.value = terrainSim.soilProps.texture;
  };
  bindSimTextures();

  const scene = new THREE.Scene();
  scene.add(createSkyDome());

  let terrainMesh = new THREE.Mesh(gridGeometry, displayMat);
  const waterMesh = new THREE.Mesh(gridGeometry, waterDisplayMat);
  const skirtMesh = new THREE.Mesh(skirtGeometry, skirtMat);

  scene.add(terrainMesh);
  scene.add(waterMesh);
  scene.add(skirtMesh);

  // 6. Effects: Rain Particles & 3D Water Source Markers
  const rainParticles = new RainParticles(scene, 12000);
  const sourceMarkers = new SourceMarkers(scene);

  const frameCameraToWorld = () => {
    const s = state.world.size;
    const vs = state.world.verticalScale;
    camera.position.set(0.58 * s, 0.78 * Math.pow(s, 0.88), -0.82 * s);
    controls.target.set(0, 0.08 * vs, 0);
    controls.update();
  };

  const applyWorldScale = (reframeCamera = false) => {
    const s = state.world.size;
    const vs = calcVerticalScale(s);
    state.world.verticalScale = vs;

    displayMat.uniforms.worldSize.value = s;
    displayMat.uniforms.verticalScale.value = vs;
    waterDisplayMat.uniforms.worldSize.value = s;
    waterDisplayMat.uniforms.verticalScale.value = vs;
    skirtMat.uniforms.worldSize.value = s;
    skirtMat.uniforms.verticalScale.value = vs;

    terrainSim.setWorldScale(s, vs);

    camera.near = Math.max(0.02, 0.015 * s);
    camera.updateProjectionMatrix();
    controls.minDistance = 0.22 * s;
    controls.maxDistance = 3.8 * s;

    if (reframeCamera) {
      frameCameraToWorld();
    }
  };

  const rebuildSimulation = (newSimSize) => {
    if (newSimSize === state.world.simSize) return;
    state.world.simSize = newSimSize;

    terrainSim.dispose();
    terrainSim = new TerrainSim(renderer, newSimSize, newSimSize);

    const meshRes = Math.min(newSimSize, 1024);
    const oldGrid = gridGeometry;
    const oldSkirt = skirtGeometry;

    gridGeometry = new GridGeometry({ xsize: meshRes, ysize: meshRes, width: 1, height: 1 });
    skirtGeometry = new SkirtGeometry({ xsize: meshRes, ysize: meshRes, width: 1, height: 1, baseHeight: -0.075 });

    waterMesh.geometry = gridGeometry;
    skirtMesh.geometry = skirtGeometry;

    if (state.visual.meshStyle === 'hex') {
      if (hexGeometry) hexGeometry.dispose();
      const hexRes = Math.min(newSimSize, 384);
      hexGeometry = new HexGridGeometry({ xsize: hexRes, ysize: hexRes, width: 1, height: 1 });
      terrainMesh.geometry = hexGeometry;
    } else {
      terrainMesh.geometry = gridGeometry;
    }

    oldGrid.dispose();
    oldSkirt.dispose();

    bindSimTextures();
    applyWorldScale(false);
    terrainSim.generateTerrain(state.terrain, state.geology, state.world, true);
  };

  // Initial terrain + preset sources
  applyWorldScale(true);
  terrainSim.generateTerrain(state.terrain, state.geology, state.world, true);
  waterSources.loadPresetSources(initialPreset.defaultSources);

  // 7. Raycasting & Mode Helpers
  const raycaster = new THREE.Raycaster();

  const updateOrbitMapping = (mode) => {
    if (mode === 'orbit') {
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
      };
    } else {
      controls.mouseButtons = {
        LEFT: null,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE
      };
    }
  };

  let hud = null;

  const setMode = (mode) => {
    sculptController.mode = mode;
    updateOrbitMapping(mode);
    if (hud) hud.refreshInputs();
  };

  setMode('orbit');
  sculptController.onModeShortcut = setMode;

  sculptController.onPlaceSource = (ndc) => {
    raycaster.setFromCamera(ndc, camera);
    const hitSourceId = sourceMarkers.hitTest(raycaster);
    if (hitSourceId !== null) {
      waterSources.selectedId = hitSourceId;
      hud.switchTab('sources');
      hud.renderSourcesList();
      return;
    }

    const hit = terrainSim.raycastTerrain(raycaster.ray, state.world.size, state.world.verticalScale);
    if (hit) {
      const added = waterSources.addSource(hit.u, hit.v, {
        radius: sculptController.newSourceRadius,
        flowRate: sculptController.newSourceFlow,
        mode: sculptController.newSourceMode,
        sediment: 0.25 + state.geology.soilRatio * 0.35
      });
      if (added) {
        hud.switchTab('sources');
        hud.renderSourcesList();
      }
    }
  };

  sculptController.onPlaceStorm = (ndc) => {
    raycaster.setFromCamera(ndc, camera);
    const hit = terrainSim.raycastTerrain(raycaster.ray, state.world.size, state.world.verticalScale);
    if (hit) {
      waterSources.storm.enabled = true;
      waterSources.storm.u = hit.u;
      waterSources.storm.v = hit.v;
      hud.refreshInputs();
    }
  };

  const getCurrentPreset = () => LANDFORM_PRESETS.find((p) => p.id === state.activeLandformId) || LANDFORM_PRESETS[0];

  // 8. HUD Controller
  hud = new HudController({
    state,
    waterSources,
    sculptController,
    callbacks: {
      onSetMode: setMode,
      onResetCamera: () => frameCameraToWorld(),
      onSetWorldSize: (newSize) => {
        const clamped = Math.max(1, Math.min(16, Math.round(newSize)));
        if (clamped === state.world.size) return;
        state.world.size = clamped;
        state.world.verticalScale = calcVerticalScale(clamped);

        if (!state.world.userLockedSimSize) {
          const targetSim = clamped >= 4 ? 1024 : 512;
          if (targetSim !== state.world.simSize) {
            rebuildSimulation(targetSim);
          }
        }

        applyWorldScale(true);
        terrainSim.generateTerrain(state.terrain, state.geology, state.world, true);
        waterSources.generateMultiBasinSources(getCurrentPreset().defaultSources, clamped);
        hud.refreshAll();
      },
      onSetSimSize: (newSimSize) => {
        state.world.userLockedSimSize = true;
        rebuildSimulation(newSimSize);
        hud.refreshInputs();
      },
      onTriggerFlashFlood: () => {
        if (waterSources.sources.length === 0) {
          waterSources.generateMultiBasinSources(getCurrentPreset().defaultSources, state.world.size);
        }
        waterSources.triggerFlashFlood();
        hud.renderSourcesList();
      },
      onTogglePause: () => {
        state.physics.paused = !state.physics.paused;
        hud.refreshInputs();
      },
      onClearWater: () => {
        terrainSim.clearWater();
      },
      onRegenerateTerrain: (clearWater) => {
        terrainSim.generateTerrain(state.terrain, state.geology, state.world, clearWater);
      },
      onApplyLandformPreset: (presetId) => {
        const preset = LANDFORM_PRESETS.find((p) => p.id === presetId);
        if (!preset) return;
        state.activeLandformId = preset.id;
        Object.assign(state.terrain, preset.terrain);
        Object.assign(state.geology, preset.geology);
        terrainSim.generateTerrain(state.terrain, state.geology, state.world, true);
        waterSources.generateMultiBasinSources(preset.defaultSources, state.world.size);
        hud.refreshAll();
      },
      onApplyGeologyPreset: (geoId) => {
        const gp = GEOLOGY_PRESETS.find((g) => g.id === geoId);
        if (!gp) return;
        state.geology.soilType = gp.geology.soilType;
        state.geology.soilRatio = gp.geology.soilRatio;
        state.geology.soilDepth = gp.geology.soilDepth;
        state.geology.rockSlopeThreshold = gp.geology.rockSlopeThreshold;
        state.geology.soilPatchiness = gp.geology.soilPatchiness;
        state.geology.soilHeterogeneity = gp.geology.soilHeterogeneity;
        state.physics.rockHardness = gp.geology.rockHardness;
        state.physics.soilErodibility = gp.geology.soilErodibility;
        state.physics.soilSlip = gp.geology.soilSlip;
        terrainSim.generateTerrain(state.terrain, state.geology, state.world, false);
        hud.refreshInputs();
      },
      onSetSoilType: (soilTypeIndex) => {
        state.geology.soilType = soilTypeIndex;
        terrainSim.updateGeologyMap(state.terrain, state.geology, state.world);
        hud.refreshInputs();
      },
      onGeologyHeterogeneityChange: () => {
        terrainSim.updateGeologyMap(state.terrain, state.geology, state.world);
      },
      onToggleGeologyView: () => {
        state.visual.geologyView = !state.visual.geologyView;
        displayMat.uniforms.geologyView.value = state.visual.geologyView ? 1.0 : 0.0;
        hud.refreshInputs();
      },
      onRestorePresetSources: () => {
        waterSources.generateMultiBasinSources(getCurrentPreset().defaultSources, state.world.size);
        hud.renderSourcesList();
      },
      onPreErode: (steps) => {
        terrainSim.startPreErosion(steps);
      },
      onSetMeshStyle: (style) => {
        if (state.visual.meshStyle === style) return;
        state.visual.meshStyle = style;
        scene.remove(terrainMesh);
        if (style === 'hex') {
          const hexRes = Math.min(state.world.simSize, 384);
          if (!hexGeometry) {
            hexGeometry = new HexGridGeometry({ xsize: hexRes, ysize: hexRes, width: 1, height: 1 });
          }
          terrainMesh = new THREE.Mesh(hexGeometry, displayMat);
        } else {
          terrainMesh = new THREE.Mesh(gridGeometry, displayMat);
        }
        scene.add(terrainMesh);
      },
      onVisualChange: () => {
        displayMat.uniforms.grassDensity.value = state.visual.grassDensity;
        displayMat.uniforms.geologyView.value = state.visual.geologyView ? 1.0 : 0.0;
        waterDisplayMat.uniforms.mudIntensity.value = state.visual.mudIntensity;
        skirtMesh.visible = state.visual.showSkirt;
        sourceMarkers.setVisible(state.visual.showMarkers);
      },
      onExportJSON: () => {
        const payload = {
          version: 2,
          activeLandformId: state.activeLandformId,
          world: state.world,
          terrain: state.terrain,
          geology: state.geology,
          physics: state.physics,
          visual: state.visual,
          hydrology: waterSources.toJSON()
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `craftscape-${state.activeLandformId}-${state.world.size}x${state.world.size}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
      onImportJSON: (data) => {
        if (data.activeLandformId) state.activeLandformId = data.activeLandformId;
        if (data.world) {
          const nextSim = data.world.simSize || state.world.simSize;
          Object.assign(state.world, data.world);
          if (nextSim !== terrainSim.width) {
            rebuildSimulation(nextSim);
          }
        }
        if (data.terrain) Object.assign(state.terrain, data.terrain);
        if (data.geology) Object.assign(state.geology, data.geology);
        if (data.physics) Object.assign(state.physics, data.physics);
        if (data.visual) Object.assign(state.visual, data.visual);
        if (data.hydrology) waterSources.fromJSON(data.hydrology);

        scene.remove(terrainMesh);
        if (state.visual.meshStyle === 'hex') {
          const hexRes = Math.min(state.world.simSize, 384);
          if (!hexGeometry) hexGeometry = new HexGridGeometry({ xsize: hexRes, ysize: hexRes, width: 1, height: 1 });
          terrainMesh = new THREE.Mesh(hexGeometry, displayMat);
        } else {
          terrainMesh = new THREE.Mesh(gridGeometry, displayMat);
        }
        scene.add(terrainMesh);

        displayMat.uniforms.grassDensity.value = state.visual.grassDensity;
        displayMat.uniforms.geologyView.value = state.visual.geologyView ? 1.0 : 0.0;
        waterDisplayMat.uniforms.mudIntensity.value = state.visual.mudIntensity;
        skirtMesh.visible = state.visual.showSkirt;
        sourceMarkers.setVisible(state.visual.showMarkers);

        applyWorldScale(true);
        terrainSim.generateTerrain(state.terrain, state.geology, state.world, true);
        hud.refreshAll();
      }
    }
  });

  // 9. Camera & Window Resize
  const clock = new THREE.Clock();
  const inv_view = new THREE.Matrix4();
  const inv_proj = new THREE.Matrix4();
  const inv_rot = new THREE.Matrix3();
  const camForward = new THREE.Vector3();
  const camRight = new THREE.Vector3();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    displayMat.uniforms.viewport.value.set(window.innerWidth, window.innerHeight);
    waterDisplayMat.uniforms.viewport.value.set(window.innerWidth, window.innerHeight);
  });

  let fpsAccum = 0;
  let fpsFrames = 0;
  let currentFps = 60;

  // 10. Main Loop
  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);

    fpsAccum += delta;
    fpsFrames++;
    if (fpsAccum >= 0.4) {
      currentFps = fpsFrames / fpsAccum;
      fpsAccum = 0;
      fpsFrames = 0;
      hud.updateTelemetry(currentFps, terrainSim.preErodeRemaining);
    }

    // Scale WASD/QE pan speed with worldSize
    const panSpeed = 0.45 * state.world.size * delta;
    if (sculptController.keys.w || sculptController.keys.s || sculptController.keys.a || sculptController.keys.d || sculptController.keys.q || sculptController.keys.e) {
      camera.getWorldDirection(camForward);
      camForward.y = 0;
      if (camForward.lengthSq() > 1e-6) camForward.normalize();
      camRight.crossVectors(camForward, camera.up).normalize();

      const move = new THREE.Vector3();
      if (sculptController.keys.w) move.addScaledVector(camForward, panSpeed);
      if (sculptController.keys.s) move.addScaledVector(camForward, -panSpeed);
      if (sculptController.keys.d) move.addScaledVector(camRight, panSpeed);
      if (sculptController.keys.a) move.addScaledVector(camRight, -panSpeed);
      if (sculptController.keys.e) move.y += panSpeed;
      if (sculptController.keys.q) move.y -= panSpeed;
      camera.position.add(move);
      controls.target.add(move);
    }

    controls.enabled = !sculptController.isSculptActive();
    controls.update();

    if (!state.physics.paused) {
      waterSources.update(delta);
      rainParticles.update(
        delta,
        state.physics.rain,
        state.physics.rainRate,
        state.physics.rainSpeed,
        waterSources.storm,
        state.world.size,
        state.world.verticalScale
      );
    }

    inv_view.copy(camera.matrixWorld);
    inv_proj.copy(camera.projectionMatrixInverse);
    const rotMat4 = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    inv_rot.setFromMatrix4(rotMat4);

    const cameraState = {
      mousepos: sculptController.mousepos,
      inv_view,
      inv_proj,
      inv_rot
    };

    const simState = sculptController.getSimState(state.physics, state.world);
    terrainSim.update(simState, cameraState, waterSources);

    sourceMarkers.sync(
      waterSources,
      (u, v) => terrainSim.sampleHeight(u, v),
      delta,
      state.world.size,
      state.world.verticalScale
    );

    const cursor = sculptController.getCursorMode(waterSources.storm.radius);

    displayMat.uniforms.mousepos.value.copy(sculptController.mousepos);
    displayMat.uniforms.inv_view.value.copy(inv_view);
    displayMat.uniforms.inv_proj.value.copy(inv_proj);
    displayMat.uniforms.inv_rot.value.copy(inv_rot);
    displayMat.uniforms.editsize.value = sculptController.editsize;
    displayMat.uniforms.cursorMode.value = cursor.mode;
    displayMat.uniforms.cursorRadius.value = cursor.radius;

    waterDisplayMat.uniforms.mousepos.value.copy(sculptController.mousepos);
    waterDisplayMat.uniforms.inv_view.value.copy(inv_view);
    waterDisplayMat.uniforms.inv_proj.value.copy(inv_proj);
    waterDisplayMat.uniforms.inv_rot.value.copy(inv_rot);
    waterDisplayMat.uniforms.editsize.value = sculptController.editsize;
    waterDisplayMat.uniforms.cursorMode.value = cursor.mode;
    waterDisplayMat.uniforms.cursorRadius.value = cursor.radius;

    renderer.render(scene, camera);
  }

  animate();
}

init();
