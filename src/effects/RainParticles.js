import * as THREE from 'three';

export class RainParticles {
  constructor(scene, maxParticleCount = 12000) {
    this.scene = scene;
    this.maxCount = maxParticleCount;

    const positions = new Float32Array(maxParticleCount * 3);
    const speeds = new Float32Array(maxParticleCount);

    for (let i = 0; i < maxParticleCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 1.05;
      positions[i * 3 + 1] = Math.random() * 1.1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.05;
      speeds[i] = 1.0 + Math.random() * 0.5;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.speeds = speeds;

    this.material = new THREE.PointsMaterial({
      color: 0x99ccff,
      size: 0.0075,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.lastWorldSize = 1.0;
    this.lastVerticalScale = 1.0;
  }

  _spawnXZ(stormActive, storm, worldSize) {
    if (stormActive) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * storm.radius * worldSize;
      return [
        (storm.u - 0.5) * worldSize + Math.cos(angle) * r,
        (storm.v - 0.5) * worldSize + Math.sin(angle) * r
      ];
    }
    return [(Math.random() - 0.5) * 1.05 * worldSize, (Math.random() - 0.5) * 1.05 * worldSize];
  }

  update(delta, isRaining, rainRate, rainSpeed, storm = null, worldSize = 1.0, verticalScale = 1.0) {
    const stormActive = Boolean(storm && storm.enabled && storm.intensity > 0);
    const globalActive = Boolean(isRaining && rainRate > 0);

    // Rescale existing particle positions when worldSize changes
    if (Math.abs(worldSize - this.lastWorldSize) > 0.01 || Math.abs(verticalScale - this.lastVerticalScale) > 0.01) {
      const posArr = this.geometry.attributes.position.array;
      const rx = worldSize / this.lastWorldSize;
      const ry = verticalScale / this.lastVerticalScale;
      for (let i = 0; i < this.maxCount; i++) {
        posArr[i * 3 + 0] *= rx;
        posArr[i * 3 + 1] *= ry;
        posArr[i * 3 + 2] *= rx;
      }
      this.geometry.attributes.position.needsUpdate = true;
      this.lastWorldSize = worldSize;
      this.lastVerticalScale = verticalScale;
    }

    if (!globalActive && !stormActive) {
      this.points.visible = false;
      return;
    }

    this.points.visible = true;
    this.material.size = 0.0075 * Math.pow(Math.max(1.0, worldSize), 0.55);

    const effectiveRate = Math.max(
      globalActive ? rainRate : 0,
      stormActive ? Math.min(100, storm.intensity * 32) : 0
    );

    this.material.opacity = Math.min(0.85, 0.25 + (effectiveRate / 100) * 0.6);

    const targetCount = Math.max(400, Math.floor((effectiveRate / 100) * this.maxCount));
    this.geometry.setDrawRange(0, targetCount);

    const positions = this.geometry.attributes.position.array;
    const stormShare = stormActive ? (globalActive ? 0.55 : 1.0) : 0.0;

    for (let i = 0; i < targetCount; i++) {
      let y = positions[i * 3 + 1];
      const speed = this.speeds[i] * rainSpeed * 0.85 * verticalScale;
      y -= speed * delta;

      if (y < 0.0) {
        y = (0.85 + Math.random() * 0.25) * verticalScale;
        const useStorm = stormActive && (i / targetCount) < stormShare;
        const [x, z] = this._spawnXZ(useStorm, storm, worldSize);
        positions[i * 3 + 0] = x;
        positions[i * 3 + 2] = z;
      }

      positions[i * 3 + 1] = y;
    }

    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
