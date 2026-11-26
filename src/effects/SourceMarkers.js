import * as THREE from 'three';

export class SourceMarkers {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.entries = new Map();
    this.ringGeo = new THREE.RingGeometry(0.84, 1.0, 48);
    this.ringGeo.rotateX(-Math.PI / 2);

    this.beaconGeo = new THREE.OctahedronGeometry(0.012, 0);
    this.stemGeo = new THREE.CylinderGeometry(0.0014, 0.0014, 0.055, 8);

    const stormRingGeo = new THREE.RingGeometry(0.95, 1.0, 64);
    stormRingGeo.rotateX(-Math.PI / 2);
    this.stormMat = new THREE.MeshBasicMaterial({
      color: 0x58b8ff,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.stormRing = new THREE.Mesh(stormRingGeo, this.stormMat);
    this.stormRing.visible = false;

    const stormCloudGeo = new THREE.CircleGeometry(1.0, 48);
    stormCloudGeo.rotateX(-Math.PI / 2);
    this.stormFillMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.stormFill = new THREE.Mesh(stormCloudGeo, this.stormFillMat);
    this.stormFill.visible = false;

    this.group.add(this.stormRing);
    this.group.add(this.stormFill);

    this.time = 0;
  }

  _createEntry(source) {
    const container = new THREE.Group();
    container.userData.sourceId = source.id;

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);

    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.92
    });
    const beacon = new THREE.Mesh(this.beaconGeo, beaconMat);
    beacon.position.y = 0.068;
    beacon.userData.sourceId = source.id;

    const stemMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.55
    });
    const stem = new THREE.Mesh(this.stemGeo, stemMat);
    stem.position.y = 0.032;

    container.add(ring);
    container.add(stem);
    container.add(beacon);

    this.group.add(container);
    return { container, ring, beacon, stem, ringMat, beaconMat, stemMat };
  }

  sync(waterSources, sampleHeightFn, delta = 0.016, worldSize = 1.0, verticalScale = 1.0) {
    this.time += delta;
    const validIds = new Set(waterSources.sources.map((s) => s.id));
    const markerScale = Math.pow(Math.max(1.0, worldSize), 0.72);

    for (const [id, entry] of this.entries.entries()) {
      if (!validIds.has(id)) {
        this.group.remove(entry.container);
        entry.ringMat.dispose();
        entry.beaconMat.dispose();
        entry.stemMat.dispose();
        this.entries.delete(id);
      }
    }

    for (const s of waterSources.sources) {
      let entry = this.entries.get(s.id);
      if (!entry) {
        entry = this._createEntry(s);
        this.entries.set(s.id, entry);
      }

      const wx = (s.u - 0.5) * worldSize;
      const wz = (s.v - 0.5) * worldSize;
      const wy = (sampleHeightFn ? sampleHeightFn(s.u, s.v) : 0.05) * verticalScale;

      entry.container.position.set(wx, wy + 0.004 * verticalScale, wz);
      entry.ring.scale.set(s.radius * worldSize, 1, s.radius * worldSize);

      const isSelected = waterSources.selectedId === s.id;
      let colorHex = 0x38bdf8;
      if (!s.enabled) {
        colorHex = 0x64748b;
      } else if (s.pulseActive) {
        colorHex = 0xff6b2b;
      } else if (s.mode === 'pulse') {
        colorHex = 0xf59e0b;
      }

      if (isSelected && s.enabled && !s.pulseActive) {
        colorHex = 0x22d3ee;
      }

      entry.ringMat.color.setHex(colorHex);
      entry.beaconMat.color.setHex(colorHex);
      entry.stemMat.color.setHex(colorHex);

      const pulseSpeed = s.pulseActive ? 8.0 : 2.6;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * pulseSpeed + s.id);
      entry.ringMat.opacity = s.enabled ? (isSelected ? 0.95 : 0.65 + pulse * 0.25) : 0.35;

      entry.stem.scale.set(markerScale, markerScale, markerScale);
      entry.stem.position.y = 0.032 * markerScale;

      entry.beacon.rotation.y += delta * (s.pulseActive ? 4.5 : 1.2);
      entry.beacon.position.y = (0.062 + Math.sin(this.time * 3.0 + s.id) * 0.006) * markerScale;

      const beaconScale = (isSelected ? 1.35 : 1.0) * markerScale;
      entry.beacon.scale.setScalar(beaconScale);
    }

    const storm = waterSources.storm;
    if (storm.enabled) {
      const sx = (storm.u - 0.5) * worldSize;
      const sz = (storm.v - 0.5) * worldSize;
      const sy = (sampleHeightFn ? sampleHeightFn(storm.u, storm.v) : 0.1) * verticalScale;

      this.stormRing.visible = true;
      this.stormFill.visible = true;
      this.stormRing.position.set(sx, sy + 0.008 * verticalScale, sz);
      this.stormRing.scale.set(storm.radius * worldSize, 1, storm.radius * worldSize);

      this.stormFill.position.set(sx, sy + 0.18 * verticalScale, sz);
      this.stormFill.scale.set(storm.radius * worldSize, 1, storm.radius * worldSize);
      this.stormMat.opacity = 0.55 + 0.25 * Math.sin(this.time * 4.0);
    } else {
      this.stormRing.visible = false;
      this.stormFill.visible = false;
    }
  }

  hitTest(raycaster) {
    const beacons = [];
    for (const entry of this.entries.values()) {
      beacons.push(entry.beacon);
    }
    const hits = raycaster.intersectObjects(beacons, false);
    if (hits.length > 0) {
      return hits[0].object.userData.sourceId ?? null;
    }
    return null;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  dispose() {
    for (const entry of this.entries.values()) {
      entry.ringMat.dispose();
      entry.beaconMat.dispose();
      entry.stemMat.dispose();
    }
    this.entries.clear();
    this.ringGeo.dispose();
    this.beaconGeo.dispose();
    this.stemGeo.dispose();
    this.stormRing.geometry.dispose();
    this.stormMat.dispose();
    this.stormFill.geometry.dispose();
    this.stormFillMat.dispose();
    this.scene.remove(this.group);
  }
}
