import * as THREE from 'three';

export class GPGPUProcessor {
  constructor(renderer, width, height, options = {}) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;

    const filter = options.nearest ? THREE.NearestFilter : THREE.LinearFilter;

    this.target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: filter,
      magFilter: filter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      depthBuffer: false,
      stencilBuffer: false,
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene.add(this.quad);
  }

  get texture() {
    return this.target.texture;
  }

  run(material) {
    this.quad.material = material;
    const oldTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(oldTarget);
  }

  dispose() {
    this.target.dispose();
    this.quad.geometry.dispose();
  }
}
