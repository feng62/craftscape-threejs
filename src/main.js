import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GUI from 'lil-gui';

import './style.css';
import { HexGridGeometry } from './geometries/HexGridGeometry.js';
import { GridGeometry } from './geometries/GridGeometry.js';
import { TerrainSim } from './simulation/TerrainSim.js';
import { createDisplayMaterial } from './shaders/DisplayShader.js';
import { createWaterDisplayMaterial } from './shaders/WaterDisplayShader.js';
import { SculptController } from './controls/SculptController.js';
import { RainParticles } from './effects/RainParticles.js';

async function init() {
  const container = document.getElementById('app');

  // 1. Renderer Setup
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x1a1a24, 1);
  container.appendChild(renderer.domElement);

  // Check float texture support
  if (!renderer.capabilities.isWebGL2 && !renderer.extensions.get('OES_texture_float')) {
    alert('您的浏览器不支持 OES_texture_float，物理水动力模拟无法运行。');
    return;
  }

  // 2. Camera & Controls
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 20);
  camera.position.set(0, 0.6, 0.8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0, 0);

  const sculptController = new SculptController(renderer.domElement);

  // 3. Texture Loader
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

  // 4. Simulation Pipeline Init
  const simSize = 512;
  const terrainSim = new TerrainSim(renderer, simSize, simSize);

  // 5. Geometries & Meshes
  const hexGeometry = new HexGridGeometry({ xsize: simSize, ysize: simSize, width: 1, height: 1 });
  const gridGeometry = new GridGeometry({ xsize: simSize, ysize: simSize, width: 1, height: 1 });

  const displayMat = createDisplayMaterial(window.innerWidth, window.innerHeight);
  const waterDisplayMat = createWaterDisplayMaterial();

  displayMat.uniforms.rock.value = rockTex;
  displayMat.uniforms.rock_normals.value = rockNormals;
  displayMat.uniforms.grass.value = grassTex;
  displayMat.uniforms.grass_normals.value = grassNormals;

  displayMat.uniforms.heights.value = terrainSim.heights.texture;
  displayMat.uniforms.normals.value = terrainSim.normals.texture;
  displayMat.uniforms.occlusions.value = terrainSim.occlusions.texture;
  displayMat.uniforms.water.value = terrainSim.water.current.texture;

  waterDisplayMat.uniforms.heights.value = terrainSim.heights.texture;
  waterDisplayMat.uniforms.water_heights.value = terrainSim.water.current.texture;
  waterDisplayMat.uniforms.normals.value = terrainSim.water.normals.texture;
  waterDisplayMat.uniforms.detail_normals.value = grassNormals;
  waterDisplayMat.uniforms.flows.value = terrainSim.water.flows.texture;

  const scene = new THREE.Scene();

  let terrainMesh = new THREE.Mesh(hexGeometry, displayMat);
  const waterMesh = new THREE.Mesh(gridGeometry, waterDisplayMat);

  scene.add(terrainMesh);
  scene.add(waterMesh);

  // 6. Rain Particles System
  const rainParticles = new RainParticles(scene, 10000);
  const clock = new THREE.Clock();

  // 7. GUI (lil-gui)
  const gui = new GUI({ title: 'Craftscape 模拟器', width: 320 });

  const guiParams = {
    enableSculpt: true,
    modtype: 'rock',
    modop: 'add',
    rain: true,
    rainRate: 10.0,
    rainSpeed: 1.5,
    erode: true,
    erodeRate: 1.0,
    evaporate: true,
    evaporateRate: 1.0,
    flowSpeed: 1.0,
    seed: 1,
    meshStyle: 'HexGrid (六边形柱体)',
    editsize: 3.0
  };

  const weatherFolder = gui.addFolder('天气与降雨系统');
  weatherFolder.add(guiParams, 'rain')
    .name('开启降雨')
    .onChange((v) => sculptController.rain = v);

  weatherFolder.add(guiParams, 'rainRate', 0, 100, 1)
    .name('降雨强度 / 雨量')
    .onChange((v) => sculptController.rainRate = v);

  weatherFolder.add(guiParams, 'rainSpeed', 0.5, 4.0, 0.1)
    .name('雨滴落速')
    .onChange((v) => sculptController.rainSpeed = v);

  const editFolder = gui.addFolder('雕刻编辑工具');
  editFolder.add(guiParams, 'enableSculpt')
    .name('开启雕刻工具 (Enable)')
    .onChange((v) => sculptController.enableSculpt = v);

  editFolder.add(guiParams, 'modtype', { '岩石 (Rock)': 'rock', '土壤 (Soil)': 'soil', '水体 (Water)': 'water' })
    .name('目标物质')
    .onChange((v) => sculptController.modtype = v);

  editFolder.add(guiParams, 'modop', { '增加 (Add)': 'add', '减少 (Remove)': 'sub' })
    .name('编辑模式')
    .onChange((v) => sculptController.modop = v);

  editFolder.add(guiParams, 'editsize', 2, 20, 0.5)
    .name('笔刷半径')
    .listen()
    .onChange((v) => sculptController.editsize = v);

  const physFolder = gui.addFolder('水文与泥沙物理');
  physFolder.add(guiParams, 'flowSpeed', 0.1, 5.0, 0.1).name('水流速度 / 倍率').onChange((v) => sculptController.flowSpeed = v);
  physFolder.add(guiParams, 'evaporate').name('蒸发开关').onChange((v) => sculptController.evaporate = v);
  physFolder.add(guiParams, 'evaporateRate', 0, 10, 0.1).name('蒸发量 / 速率').onChange((v) => sculptController.evaporateRate = v);
  physFolder.add(guiParams, 'erode').name('侵蚀开关').onChange((v) => sculptController.erode = v);
  physFolder.add(guiParams, 'erodeRate', 0, 10, 0.1).name('侵蚀量 / 强度').onChange((v) => sculptController.erodeRate = v);

  const envFolder = gui.addFolder('地形与视觉设置');
  envFolder.add(guiParams, 'seed', 1, 1000, 1)
    .name('噪声种子 (Seed)')
    .onChange((v) => terrainSim.reset(v));

  envFolder.add(guiParams, 'meshStyle', ['HexGrid (六边形柱体)', 'SmoothGrid (平滑连续地形)'])
    .name('地形网格风格')
    .onChange((v) => {
      scene.remove(terrainMesh);
      if (v.includes('HexGrid')) {
        terrainMesh = new THREE.Mesh(hexGeometry, displayMat);
      } else {
        terrainMesh = new THREE.Mesh(gridGeometry, displayMat);
      }
      scene.add(terrainMesh);
    });

  // 7. Matrix & Camera State Helpers
  const inv_view = new THREE.Matrix4();
  const inv_proj = new THREE.Matrix4();
  const inv_rot = new THREE.Matrix3();

  // 8. Window Resize Listener
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    displayMat.uniforms.viewport.value.set(window.innerWidth, window.innerHeight);
    waterDisplayMat.uniforms.viewport.value.set(window.innerWidth, window.innerHeight);
  });

  // 9. Main Animation Loop
  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    
    // Disable OrbitControls during active sculpting to allow left-click drag terrain editing
    controls.enabled = !(sculptController.enableSculpt && (sculptController.isMouseDown || sculptController.keys.space));
    controls.update();

    // Update 3D Rain Particles System
    rainParticles.update(delta, sculptController.rain, sculptController.rainRate, sculptController.rainSpeed);

    // Update Matrix & Camera State for God Pass & Shader picking
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

    // Run GPGPU Physical Simulation Pass
    terrainSim.update(sculptController.state, cameraState);

    // Update Shader Material Uniforms
    const activeEditSize = sculptController.enableSculpt ? sculptController.editsize : 0.0;

    displayMat.uniforms.mousepos.value.copy(sculptController.mousepos);
    displayMat.uniforms.inv_view.value.copy(inv_view);
    displayMat.uniforms.inv_proj.value.copy(inv_proj);
    displayMat.uniforms.inv_rot.value.copy(inv_rot);
    displayMat.uniforms.editsize.value = activeEditSize;

    waterDisplayMat.uniforms.mousepos.value.copy(sculptController.mousepos);
    waterDisplayMat.uniforms.inv_view.value.copy(inv_view);
    waterDisplayMat.uniforms.inv_proj.value.copy(inv_proj);
    waterDisplayMat.uniforms.inv_rot.value.copy(inv_rot);
    waterDisplayMat.uniforms.editsize.value = activeEditSize;

    // Render Scene
    renderer.render(scene, camera);
  }

  animate();
}

init();
