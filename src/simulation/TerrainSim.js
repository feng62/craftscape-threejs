import * as THREE from 'three';
import { GPGPUProcessor } from './GPGPUProcessor.js';
import { WaterSim } from './WaterSim.js';
import { createTerrainGenMaterial, createSmoothTerrainMaterial } from '../shaders/TerrainGenShader.js';
import { createGeologyMapMaterial } from '../shaders/GeologyMapShader.js';
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
    this.initialHeights = new GPGPUProcessor(renderer, width, height);
    this.soilProps = new GPGPUProcessor(renderer, width, height);
    this.normals = new GPGPUProcessor(renderer, width, height);
    this.occlusions = new GPGPUProcessor(renderer, width, height);
    this.tmp = new GPGPUProcessor(renderer, width, height);

    // Lightweight 256x256 downsampled readback target so 1024/2048 simulations stay 60 FPS
    this.cacheSize = 256;
    this.cacheProcessor = new GPGPUProcessor(renderer, this.cacheSize, this.cacheSize);
    this.heightCache = new Float32Array(this.cacheSize * this.cacheSize * 4);
    this.cacheDirty = true;

    this.terrainGenMat = createTerrainGenMaterial(width, height);
    this.smoothTerrainMat = createSmoothTerrainMaterial(width, height);
    this.geologyMapMat = createGeologyMapMaterial(width, height);
    this.errodeMat = createErrodeMaterial(width, height);
    this.diffuseSoilMat = createDiffuseSoilMaterial(width, height);
    this.godMat = createGodMaterial(width, height);
    this.normalMat = createNormalMaterial(width, height);
    this.occlusionMat = createOcclusionMaterial(width, height);
    this.copyMat = createCopyMaterial();

    this.water = new WaterSim(renderer, width, height, this.heights, this.normals);

    // Bind initial uniforms
    this.normalMat.uniforms.heights.value = this.heights.texture;
    this.occlusionMat.uniforms.heights.value = this.heights.texture;
    this.occlusionMat.uniforms.normals.value = this.normals.texture;

    this.geologyMapMat.uniforms.heights.value = this.heights.texture;

    this.errodeMat.uniforms.ground.value = this.heights.texture;
    this.errodeMat.uniforms.water.value = this.water.current.texture;
    this.errodeMat.uniforms.soilProps.value = this.soilProps.texture;

    this.diffuseSoilMat.uniforms.ground.value = this.tmp.texture;
    this.diffuseSoilMat.uniforms.water.value = this.water.current.texture;
    this.diffuseSoilMat.uniforms.soilProps.value = this.soilProps.texture;
    this.diffuseSoilMat.uniforms.initialHeights.value = this.initialHeights.texture;

    this.water.cycleMat.uniforms.soilProps.value = this.soilProps.texture;

    this.worldSize = 1.0;
    this.verticalScale = 1.0;
    this.frameCount = 0;
    this.preErodeRemaining = 0;
  }

  setWorldScale(worldSize, verticalScale) {
    this.worldSize = worldSize;
    this.verticalScale = verticalScale;
    this.normalMat.uniforms.worldSize.value = worldSize;
    this.normalMat.uniforms.verticalScale.value = verticalScale;
    this.occlusionMat.uniforms.worldSize.value = worldSize;
    this.occlusionMat.uniforms.verticalScale.value = verticalScale;
    this.godMat.uniforms.worldSize.value = worldSize;
    this.godMat.uniforms.verticalScale.value = verticalScale;
  }

  updateGeologyMap(terrainParams, geologyParams, worldParams = {}) {
    const worldSize = worldParams.size || this.worldSize;
    const verticalScale = worldParams.verticalScale || this.verticalScale;
    const landformScale = worldParams.landformScale || 1.0;

    const gu = this.geologyMapMat.uniforms;
    gu.heights.value = this.heights.texture;
    gu.seed.value = terrainParams.seed;
    gu.worldSize.value = worldSize;
    gu.verticalScale.value = verticalScale;
    gu.landformScale.value = landformScale;
    gu.soilType.value = geologyParams.soilType !== undefined ? geologyParams.soilType : 1;
    gu.soilHeterogeneity.value = geologyParams.soilHeterogeneity !== undefined ? geologyParams.soilHeterogeneity : 0.65;

    this.soilProps.run(this.geologyMapMat);
  }

  generateTerrain(terrainParams, geologyParams, worldParams = {}, clearWater = true) {
    const worldSize = worldParams.size || 1.0;
    const verticalScale = worldParams.verticalScale || Math.pow(worldSize, 0.48);
    const landformScale = worldParams.landformScale || 1.0;
    this.setWorldScale(worldSize, verticalScale);

    const u = this.terrainGenMat.uniforms;
    u.seed.value = terrainParams.seed;
    u.landformType.value = terrainParams.landformType;
    u.heightScale.value = terrainParams.heightScale;
    u.slopeTilt.value = terrainParams.slopeTilt;
    u.valleyDepth.value = terrainParams.valleyDepth;
    u.valleyWidth.value = terrainParams.valleyWidth;
    u.gullyDensity.value = terrainParams.gullyDensity;
    u.roughness.value = terrainParams.roughness;

    u.worldSize.value = worldSize;
    u.verticalScale.value = verticalScale;
    u.landformScale.value = landformScale;

    u.soilRatio.value = geologyParams.soilRatio;
    u.soilDepth.value = geologyParams.soilDepth;
    u.rockSlopeThreshold.value = geologyParams.rockSlopeThreshold;
    u.soilPatchiness.value = geologyParams.soilPatchiness;

    // 1. Procedural terrain generation
    this.heights.run(this.terrainGenMat);

    // 2. Two gentle 3x3 weathering passes to eliminate any residual micro-spikes
    this.smoothTerrainMat.uniforms.source.value = this.heights.texture;
    this.tmp.run(this.smoothTerrainMat);
    this.smoothTerrainMat.uniforms.source.value = this.tmp.texture;
    this.heights.run(this.smoothTerrainMat);

    // 3. Save clean initial elevation snapshot for erosion/subsidence diffing
    this.copyMat.uniforms.source.value = this.heights.texture;
    this.initialHeights.run(this.copyMat);

    // 4. Generate per-pixel geotechnical property map
    this.updateGeologyMap(terrainParams, geologyParams, worldParams);

    if (clearWater) {
      this.water.clear();
    }
    this.normals.run(this.normalMat);
    this.occlusions.run(this.occlusionMat);
    this.syncHeightCache();
  }

  clearWater() {
    this.water.clear();
  }

  syncHeightCache() {
    try {
      this.copyMat.uniforms.source.value = this.heights.texture;
      this.cacheProcessor.run(this.copyMat);
      this.renderer.readRenderTargetPixels(
        this.cacheProcessor.target,
        0,
        0,
        this.cacheSize,
        this.cacheSize,
        this.heightCache
      );
      this.cacheDirty = false;
    } catch {
      // Ignore readback failures on unsupported drivers
    }
  }

  sampleHeight(u, v) {
    const cu = Math.max(0, Math.min(0.999, u));
    const cv = Math.max(0, Math.min(0.999, v));
    const x = Math.floor(cu * this.cacheSize);
    const y = Math.floor(cv * this.cacheSize);
    const idx = (y * this.cacheSize + x) * 4;
    return this.heightCache[idx] || 0.05;
  }

  raycastTerrain(ray, worldSize = this.worldSize, verticalScale = this.verticalScale) {
    const O = ray.origin;
    const D = ray.direction;
    if (Math.abs(D.y) < 1e-5 && O.y > 0.85 * verticalScale) return null;

    const topY = 0.85 * verticalScale;
    let t = D.y < -1e-5 ? Math.max(0, (topY - O.y) / D.y) : 0;
    const dt = 0.015 * worldSize;
    const maxT = 10.0 * worldSize;
    let hit = false;
    const p = new THREE.Vector3();

    for (let i = 0; i < 160; i++) {
      p.copy(O).addScaledVector(D, t);
      const u = p.x / worldSize + 0.5;
      const v = p.z / worldSize + 0.5;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        const h = this.sampleHeight(u, v) * verticalScale;
        if (p.y <= h) {
          hit = true;
          break;
        }
      }
      t += dt;
      if (t > maxT) break;
    }

    if (hit) {
      let t0 = Math.max(0, t - dt);
      let t1 = t;
      for (let j = 0; j < 6; j++) {
        const tm = (t0 + t1) * 0.5;
        p.copy(O).addScaledVector(D, tm);
        const u = Math.max(0, Math.min(1, p.x / worldSize + 0.5));
        const v = Math.max(0, Math.min(1, p.z / worldSize + 0.5));
        if (p.y <= this.sampleHeight(u, v) * verticalScale) {
          t1 = tm;
        } else {
          t0 = tm;
        }
      }
      p.copy(O).addScaledVector(D, t1);
      const u = Math.max(0.01, Math.min(0.99, p.x / worldSize + 0.5));
      const v = Math.max(0.01, Math.min(0.99, p.z / worldSize + 0.5));
      return {
        u,
        v,
        worldPos: new THREE.Vector3((u - 0.5) * worldSize, this.sampleHeight(u, v) * verticalScale, (v - 0.5) * worldSize)
      };
    }

    if (Math.abs(D.y) > 1e-5) {
      const tPlane = (0 - O.y) / D.y;
      if (tPlane > 0) {
        p.copy(O).addScaledVector(D, tPlane);
        const u = p.x / worldSize + 0.5;
        const v = p.z / worldSize + 0.5;
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
          return {
            u,
            v,
            worldPos: new THREE.Vector3((u - 0.5) * worldSize, this.sampleHeight(u, v) * verticalScale, (v - 0.5) * worldSize)
          };
        }
      }
    }
    return null;
  }

  startPreErosion(steps = 80) {
    this.preErodeRemaining = Math.max(this.preErodeRemaining, steps);
  }

  _runPreErosionBatch(controls, batchSize = 8) {
    const count = Math.min(batchSize, this.preErodeRemaining);
    if (count <= 0) return;

    const preControls = {
      ...controls,
      rain: true,
      rainRate: 85,
      erode: true,
      erodeRate: Math.max(2.2, controls.erodeRate || 1.5),
      evaporate: false,
      substeps: 1,
      create: 0
    };

    for (let i = 0; i < count; i++) {
      this.water.update(preControls, null, null);

      this.errodeMat.uniforms.factor.value = preControls.erodeRate;
      this.errodeMat.uniforms.rockHardness.value = controls.rockHardness ?? 1.5;
      this.errodeMat.uniforms.soilErodibility.value = controls.soilErodibility ?? 1.5;
      this.errodeMat.uniforms.evaporateRate.value = 1.0;
      this.tmp.run(this.errodeMat);

      this.diffuseSoilMat.uniforms.rockHardness.value = controls.rockHardness ?? 1.5;
      this.diffuseSoilMat.uniforms.soilSlip.value = controls.soilSlip ?? 1.0;
      this.heights.run(this.diffuseSoilMat);
    }

    this.preErodeRemaining -= count;
    if (this.preErodeRemaining <= 0) {
      this.water.clear();
      this.syncHeightCache();
    }

    this.normals.run(this.normalMat);
    this.occlusions.run(this.occlusionMat);
  }

  update(controls, cameraState, waterSources) {
    this.frameCount++;

    if (this.preErodeRemaining > 0) {
      this._runPreErosionBatch(controls, 8);
      return;
    }

    if (controls.paused) {
      if (controls.isSculpting && (controls.rock || controls.soil)) {
        this._runSculptPass(controls, cameraState);
        this.normals.run(this.normalMat);
        this.occlusions.run(this.occlusionMat);
        this.cacheDirty = true;
      }
      if (this.cacheDirty && this.frameCount % 12 === 0) {
        this.syncHeightCache();
      }
      return;
    }

    this.water.update(controls, cameraState, waterSources);

    this.errodeMat.uniforms.factor.value = controls.erode
      ? (controls.erodeRate !== undefined ? controls.erodeRate : 1.0)
      : 0.0;
    this.errodeMat.uniforms.rockHardness.value = controls.rockHardness ?? 1.5;
    this.errodeMat.uniforms.soilErodibility.value = controls.soilErodibility ?? 1.5;
    this.errodeMat.uniforms.evaporateRate.value = controls.evaporateRate ?? 1.0;
    this.tmp.run(this.errodeMat);

    this.diffuseSoilMat.uniforms.rockHardness.value = controls.rockHardness ?? 1.5;
    this.diffuseSoilMat.uniforms.soilSlip.value = controls.soilSlip ?? 1.0;
    this.heights.run(this.diffuseSoilMat);

    if (controls.isSculpting && (controls.rock || controls.soil)) {
      this._runSculptPass(controls, cameraState);
      this.cacheDirty = true;
    }

    this.normals.run(this.normalMat);
    this.occlusions.run(this.occlusionMat);

    if (this.frameCount % 20 === 0 || this.cacheDirty) {
      this.syncHeightCache();
    }
  }

  _runSculptPass(controls, cameraState) {
    this.godMat.uniforms.ground.value = this.heights.texture;
    this.godMat.uniforms.worldSize.value = controls.worldSize || this.worldSize;
    this.godMat.uniforms.verticalScale.value = controls.verticalScale || this.verticalScale;

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

  dispose() {
    this.water.dispose();
    this.heights.dispose();
    this.initialHeights.dispose();
    this.soilProps.dispose();
    this.normals.dispose();
    this.occlusions.dispose();
    this.tmp.dispose();
    this.cacheProcessor.dispose();

    this.terrainGenMat.dispose();
    this.smoothTerrainMat.dispose();
    this.geologyMapMat.dispose();
    this.errodeMat.dispose();
    this.diffuseSoilMat.dispose();
    this.godMat.dispose();
    this.normalMat.dispose();
    this.occlusionMat.dispose();
    this.copyMat.dispose();
  }
}
