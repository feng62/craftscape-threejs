import { GPGPUProcessor } from './GPGPUProcessor.js';
import {
  createWaterDiffuseMaterial,
  createWaterMomentumMaterial,
  createWaterCycleMaterial,
  createWaterNormalsMaterial,
  createFlowsMaterial,
  createCopyMaterial
} from '../shaders/WaterShaders.js';

export class WaterSim {
  constructor(renderer, width, height, heightsProcessor, normalsProcessor) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;

    this.tmp = new GPGPUProcessor(renderer, width, height);
    this.last = new GPGPUProcessor(renderer, width, height);
    this.current = new GPGPUProcessor(renderer, width, height);
    this.normals = new GPGPUProcessor(renderer, width, height);

    // Dedicated 128x128 GPGPU processors for flows texture calculation
    this.tmpFlows = new GPGPUProcessor(renderer, 128, 128, { nearest: true });
    this.flows = new GPGPUProcessor(renderer, 128, 128, { nearest: true });

    this.diffuseMat = createWaterDiffuseMaterial(width, height);
    this.momentumMat = createWaterMomentumMaterial(width, height);
    this.cycleMat = createWaterCycleMaterial(width, height);
    this.normalsMat = createWaterNormalsMaterial(width, height);
    this.flowsMat = createFlowsMaterial(128, 128);
    this.copyMat = createCopyMaterial();

    this.heightsProcessor = heightsProcessor;

    // Set initial uniforms
    this.diffuseMat.uniforms.heights.value = heightsProcessor.texture;

    this.momentumMat.uniforms.ground.value = heightsProcessor.texture;
    this.momentumMat.uniforms.last.value = this.last.texture;
    this.momentumMat.uniforms.current.value = this.current.texture;

    this.cycleMat.uniforms.water.value = this.tmp.texture;

    this.normalsMat.uniforms.ground.value = heightsProcessor.texture;
    this.normalsMat.uniforms.water.value = this.current.texture;

    this.flowsMat.uniforms.flows.value = this.flows.texture;
    this.flowsMat.uniforms.water.value = this.current.texture;
  }

  update(controls, cameraState) {
    // 1. Water Diffuse Pass (Physical height exchange across 2 axes)
    this.diffuseMat.uniforms.heights.value = this.heightsProcessor.texture;
    this.diffuseMat.uniforms.axis.value.set(0, 1);
    this.diffuseMat.uniforms.source.value = this.current.texture;
    this.tmp.run(this.diffuseMat);

    this.diffuseMat.uniforms.axis.value.set(1, 0);
    this.diffuseMat.uniforms.source.value = this.tmp.texture;
    this.current.run(this.diffuseMat);

    // 2. Water Momentum Pass (Bernoulli shallow water acceleration)
    this.momentumMat.uniforms.ground.value = this.heightsProcessor.texture;
    this.momentumMat.uniforms.last.value = this.last.texture;
    this.momentumMat.uniforms.current.value = this.current.texture;
    this.momentumMat.uniforms.flow_speed.value = controls.flowSpeed !== undefined ? controls.flowSpeed : 1.0;
    this.tmp.run(this.momentumMat);

    // Copy current state to last state for next frame momentum step
    this.copyMat.uniforms.source.value = this.current.texture;
    this.last.run(this.copyMat);

    // 3. Water Cycle Pass (Rain, Evaporation, Sculpting)
    this.cycleMat.uniforms.water.value = this.tmp.texture;
    this.cycleMat.uniforms.rain.value = controls.rain;
    this.cycleMat.uniforms.rain_rate.value = controls.rainRate !== undefined ? controls.rainRate : 10.0;
    this.cycleMat.uniforms.evaporate.value = controls.evaporate;
    this.cycleMat.uniforms.evaporate_rate.value = controls.evaporateRate !== undefined ? controls.evaporateRate : 1.0;
    this.cycleMat.uniforms.create.value = controls.create;
    this.cycleMat.uniforms.editsize.value = controls.editsize;

    if (cameraState) {
      this.cycleMat.uniforms.mousepos.value.copy(cameraState.mousepos);
      this.cycleMat.uniforms.inv_view.value.copy(cameraState.inv_view);
      this.cycleMat.uniforms.inv_proj.value.copy(cameraState.inv_proj);
      this.cycleMat.uniforms.inv_rot.value.copy(cameraState.inv_rot);
      this.cycleMat.uniforms.screen.value.set(window.innerWidth, window.innerHeight);
    }

    this.current.run(this.cycleMat);

    // 4. Water Normals Pass (8-neighbor smooth cross-product)
    this.normalsMat.uniforms.ground.value = this.heightsProcessor.texture;
    this.normalsMat.uniforms.water.value = this.current.texture;
    this.normals.run(this.normalsMat);

    // 5. Flows Pass (128x128 dedicated target for width/depth velocity drift)
    this.flowsMat.uniforms.flows.value = this.flows.texture;
    this.flowsMat.uniforms.water.value = this.current.texture;
    this.flowsMat.uniforms.flow_speed.value = controls.flowSpeed !== undefined ? controls.flowSpeed : 1.0;
    this.tmpFlows.run(this.flowsMat);

    this.copyMat.uniforms.source.value = this.tmpFlows.texture;
    this.flows.run(this.copyMat);
  }
}
