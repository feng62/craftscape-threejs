import { GPGPUProcessor } from './GPGPUProcessor.js';
import {
  createWaterFluxMaterial,
  createWaterUpdateMaterial,
  createWaterCycleMaterial,
  createWaterNormalsMaterial,
  createFlowsMaterial,
  createCopyMaterial,
  createClearMaterial
} from '../shaders/WaterShaders.js';

export class WaterSim {
  constructor(renderer, width, height, heightsProcessor, normalsProcessor) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;

    // NearestFilter ensures exact per-texel mass conservation in flux & depth passes
    this.tmp = new GPGPUProcessor(renderer, width, height, { nearest: true });
    this.flux = new GPGPUProcessor(renderer, width, height, { nearest: true });
    this.tmpFlux = new GPGPUProcessor(renderer, width, height, { nearest: true });
    this.current = new GPGPUProcessor(renderer, width, height, { nearest: true });
    this.normals = new GPGPUProcessor(renderer, width, height);

    // Dedicated 128x128 GPGPU processors for flows texture calculation
    this.tmpFlows = new GPGPUProcessor(renderer, 128, 128, { nearest: true });
    this.flows = new GPGPUProcessor(renderer, 128, 128, { nearest: true });

    this.fluxMat = createWaterFluxMaterial(width, height);
    this.updateMat = createWaterUpdateMaterial(width, height);
    this.cycleMat = createWaterCycleMaterial(width, height);
    this.normalsMat = createWaterNormalsMaterial(width, height);
    this.flowsMat = createFlowsMaterial(128, 128);
    this.copyMat = createCopyMaterial();
    this.clearMat = createClearMaterial();

    this.heightsProcessor = heightsProcessor;

    this.fluxMat.uniforms.heights.value = heightsProcessor.texture;
    this.normalsMat.uniforms.ground.value = heightsProcessor.texture;
    this.normalsMat.uniforms.water.value = this.current.texture;
    this.flowsMat.uniforms.flows.value = this.flows.texture;
    this.flowsMat.uniforms.water.value = this.current.texture;
  }

  clear() {
    this.tmp.run(this.clearMat);
    this.flux.run(this.clearMat);
    this.tmpFlux.run(this.clearMat);
    this.current.run(this.clearMat);
    this.tmpFlows.run(this.clearMat);
    this.flows.run(this.clearMat);
    this.normals.run(this.normalsMat);
  }

  update(controls, cameraState, waterSources) {
    const substeps = Math.max(1, Math.min(4, Math.round(controls.substeps || 2)));
    const flowSpeed = controls.flowSpeed !== undefined ? controls.flowSpeed : 1.0;
    const dtScale = 1.0 / substeps;

    if (waterSources) {
      waterSources.fillUniforms(
        this.cycleMat.uniforms.water_sources.value,
        this.cycleMat.uniforms.source_sediment.value,
        this.cycleMat.uniforms.storm_zone.value
      );
    }

    this.cycleMat.uniforms.ground.value = this.heightsProcessor.texture;
    this.cycleMat.uniforms.rain.value = controls.rain ? 1.0 : 0.0;
    this.cycleMat.uniforms.rain_rate.value = controls.rainRate !== undefined ? controls.rainRate : 10.0;
    this.cycleMat.uniforms.evaporate.value = controls.evaporate ? 1.0 : 0.0;
    this.cycleMat.uniforms.evaporate_rate.value = controls.evaporateRate !== undefined ? controls.evaporateRate : 1.0;
    this.cycleMat.uniforms.create.value = controls.create || 0.0;
    this.cycleMat.uniforms.editsize.value = controls.editsize || 3.0;
    this.cycleMat.uniforms.open_boundary.value = controls.openBoundary ? 1.0 : 0.0;
    this.cycleMat.uniforms.erode_rate.value = controls.erode ? (controls.erodeRate !== undefined ? controls.erodeRate : 1.0) : 0.0;
    this.cycleMat.uniforms.soil_erodibility.value = controls.soilErodibility !== undefined ? controls.soilErodibility : 1.5;
    this.cycleMat.uniforms.dt_scale.value = dtScale;
    this.cycleMat.uniforms.worldSize.value = controls.worldSize || 1.0;
    this.cycleMat.uniforms.verticalScale.value = controls.verticalScale || 1.0;

    if (cameraState) {
      this.cycleMat.uniforms.mousepos.value.copy(cameraState.mousepos);
      this.cycleMat.uniforms.inv_view.value.copy(cameraState.inv_view);
      this.cycleMat.uniforms.inv_proj.value.copy(cameraState.inv_proj);
      this.cycleMat.uniforms.inv_rot.value.copy(cameraState.inv_rot);
      this.cycleMat.uniforms.screen.value.set(window.innerWidth, window.innerHeight);
    }

    // Run multiple conservative substeps per frame for fast, smooth flash-flood propagation
    const effectiveSubsteps = substeps * 2;
    const subDt = 1.0 / effectiveSubsteps;
    this.cycleMat.uniforms.dt_scale.value = subDt;

    for (let step = 0; step < effectiveSubsteps; step++) {
      // 1. Compute Virtual Pipe Outflow Flux
      this.fluxMat.uniforms.heights.value = this.heightsProcessor.texture;
      this.fluxMat.uniforms.water.value = this.current.texture;
      this.fluxMat.uniforms.flux.value = this.flux.texture;
      this.fluxMat.uniforms.flow_speed.value = flowSpeed;
      this.fluxMat.uniforms.dt_scale.value = subDt * 1.4;
      this.tmpFlux.run(this.fluxMat);

      this.copyMat.uniforms.source.value = this.tmpFlux.texture;
      this.flux.run(this.copyMat);

      // 2. Update Water Depth, Velocity & Sediment Advection
      this.updateMat.uniforms.water.value = this.current.texture;
      this.updateMat.uniforms.flux.value = this.flux.texture;
      this.tmp.run(this.updateMat);

      // 3. Water Cycle Pass (Sources, Rain, Storm, Sediment Pickup, Open Boundary)
      this.cycleMat.uniforms.water.value = this.tmp.texture;
      this.current.run(this.cycleMat);
    }

    // 4. Water Normals Pass
    this.normalsMat.uniforms.ground.value = this.heightsProcessor.texture;
    this.normalsMat.uniforms.water.value = this.current.texture;
    this.normalsMat.uniforms.worldSize.value = controls.worldSize || 1.0;
    this.normalsMat.uniforms.verticalScale.value = controls.verticalScale || 1.0;
    this.normals.run(this.normalsMat);

    // 5. Flows Pass
    this.flowsMat.uniforms.flows.value = this.flows.texture;
    this.flowsMat.uniforms.water.value = this.current.texture;
    this.flowsMat.uniforms.flow_speed.value = flowSpeed;
    this.tmpFlows.run(this.flowsMat);

    this.copyMat.uniforms.source.value = this.tmpFlows.texture;
    this.flows.run(this.copyMat);
  }

  dispose() {
    this.tmp.dispose();
    this.flux.dispose();
    this.tmpFlux.dispose();
    this.current.dispose();
    this.normals.dispose();
    this.tmpFlows.dispose();
    this.flows.dispose();

    this.fluxMat.dispose();
    this.updateMat.dispose();
    this.cycleMat.dispose();
    this.normalsMat.dispose();
    this.flowsMat.dispose();
    this.copyMat.dispose();
    this.clearMat.dispose();
  }
}
