import { GPGPUProcessor } from './GPGPUProcessor.js';
import { WaterSim } from './WaterSim.js';
import { createSimplex3DMaterial } from '../shaders/Simplex3DShader.js';
import { createErrodeMaterial } from '../shaders/ErrodeShader.js';
import { createDiffuseSoilMaterial } from '../shaders/DiffuseSoilShader.js';
import { createGodMaterial } from '../shaders/GodShader.js';
import { createNormalMaterial, createOcclusionMaterial } from '../shaders/NormalShader.js';
import { createCopyMaterial } from '../shaders/WaterShaders.js';

export class TerrainSim {
  constructor(renderer, width = 512, height = 512) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;

    this.heights = new GPGPUProcessor(renderer, width, height);
    this.normals = new GPGPUProcessor(renderer, width, height);
    this.occlusions = new GPGPUProcessor(renderer, width, height);
    this.tmp = new GPGPUProcessor(renderer, width, height);

    this.simplexMat = createSimplex3DMaterial(width, height);
    this.errodeMat = createErrodeMaterial(width, height);
    this.diffuseSoilMat = createDiffuseSoilMaterial(width, height);
    this.godMat = createGodMaterial();
    this.normalMat = createNormalMaterial(width, height);
    this.occlusionMat = createOcclusionMaterial(width, height);
    this.copyMat = createCopyMaterial();

    this.water = new WaterSim(renderer, width, height, this.heights, this.normals);

    // Bind initial uniforms
    this.normalMat.uniforms.heights.value = this.heights.texture;
    this.occlusionMat.uniforms.heights.value = this.heights.texture;
    this.occlusionMat.uniforms.normals.value = this.normals.texture;

    this.errodeMat.uniforms.ground.value = this.heights.texture;
    this.errodeMat.uniforms.water.value = this.water.current.texture;

    this.diffuseSoilMat.uniforms.ground.value = this.tmp.texture;
    this.diffuseSoilMat.uniforms.water.value = this.water.current.texture;

    this.reset(1);
  }

  reset(seed = 1) {
    this.seed = seed;
    this.simplexMat.uniforms.delta.value = seed;
    this.heights.run(this.simplexMat);
  }

  update(controls, cameraState) {
    // 1. Water update
    this.water.update(controls, cameraState);

    // 2. Erosion Pass
    this.errodeMat.uniforms.factor.value = controls.erode ? (controls.erodeRate !== undefined ? controls.erodeRate : 1.0) : 0.0;
    this.tmp.run(this.errodeMat);

    // 3. Soil Diffusion Pass
    this.heights.run(this.diffuseSoilMat);

    // 4. God Mode Sculpting Pass (if active)
    if (controls.isSculpting && (controls.rock || controls.soil)) {
      this.godMat.uniforms.ground.value = this.heights.texture;
      if (cameraState) {
        this.godMat.uniforms.mousepos.value.copy(cameraState.mousepos);
        this.godMat.uniforms.inv_view.value.copy(cameraState.inv_view);
        this.godMat.uniforms.inv_proj.value.copy(cameraState.inv_proj);
        this.godMat.uniforms.inv_rot.value.copy(cameraState.inv_rot);
        this.godMat.uniforms.screen.value.set(window.innerWidth, window.innerHeight);
      }
      this.godMat.uniforms.rockfactor.value = controls.rock * controls.dir;
      this.godMat.uniforms.soilfactor.value = controls.soil * controls.dir;
      this.godMat.uniforms.editsize.value = controls.editsize;
      this.godMat.uniforms.delta.value = performance.now() / 1000;

      this.tmp.run(this.godMat);

      this.copyMat.uniforms.source.value = this.tmp.texture;
      this.heights.run(this.copyMat);
    }

    // 5. Compute Terrain Normals & AO
    this.normals.run(this.normalMat);
    this.occlusions.run(this.occlusionMat);
  }
}
