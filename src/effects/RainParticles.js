import * as THREE from 'three';

export class RainParticles {
  constructor(scene, maxParticleCount = 10000) {
    this.scene = scene;
    this.maxCount = maxParticleCount;

    const positions = new Float32Array(maxParticleCount * 3);
    const speeds = new Float32Array(maxParticleCount);

    for (let i = 0; i < maxParticleCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 1.2; // X
      positions[i * 3 + 1] = Math.random() * 1.2;         // Y
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.2; // Z

      speeds[i] = 1.0 + Math.random() * 0.5;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.speeds = speeds;

    this.material = new THREE.PointsMaterial({
      color: 0xaaccff,
      size: 0.008,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.visibleCount = 1000;
  }

  update(delta, isRaining, rainRate, rainSpeed) {
    if (!isRaining || rainRate <= 0) {
      this.points.visible = false;
      return;
    }

    this.points.visible = true;
    this.material.opacity = Math.min(0.8, 0.2 + (rainRate / 100) * 0.6);

    // Calculate how many particles to draw based on rainRate (0 to 100)
    const targetCount = Math.floor((rainRate / 100) * this.maxCount);
    this.geometry.setDrawRange(0, targetCount);

    const positions = this.geometry.attributes.position.array;

    for (let i = 0; i < targetCount; i++) {
      let y = positions[i * 3 + 1];
      const speed = this.speeds[i] * rainSpeed * 0.8;

      y -= speed * delta;

      if (y < 0.0) {
        y = 1.0 + Math.random() * 0.2;
        positions[i * 3 + 0] = (Math.random() - 0.5) * 1.2;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
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
