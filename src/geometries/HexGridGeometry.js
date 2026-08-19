import * as THREE from 'three';

export class HexGridGeometry extends THREE.BufferGeometry {
  constructor({ xsize = 512, ysize = 512, width = 1, height = 1 } = {}) {
    super();

    const position = [];
    const uv = [];
    const barycentric = [];

    const hw = width / 2;
    const hh = height / 2;

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

    for (let x = 0; x <= xsize; x++) {
      const x1 = clamp((x - 0.5) / xsize, 0, 1);
      const x2 = clamp((x + 0.0) / xsize, 0, 1);
      const x3 = clamp((x + 0.5) / xsize, 0, 1);
      const x4 = clamp((x + 1.0) / xsize, 0, 1);

      for (let y = 0; y < ysize; y += 2) {
        const t = (y + 0) / ysize;
        const m = (y + 1) / ysize;
        const b = (y + 2) / ysize;

        // Positions (in XZ plane)
        position.push(
          x1 * width - hw, 0, t * height - hh,
          x3 * width - hw, 0, t * height - hh,
          x2 * width - hw, 0, m * height - hh,

          x2 * width - hw, 0, m * height - hh,
          x3 * width - hw, 0, t * height - hh,
          x4 * width - hw, 0, m * height - hh,

          x1 * width - hw, 0, b * height - hh,
          x2 * width - hw, 0, m * height - hh,
          x3 * width - hw, 0, b * height - hh,

          x2 * width - hw, 0, m * height - hh,
          x4 * width - hw, 0, m * height - hh,
          x3 * width - hw, 0, b * height - hh
        );

        // Texcoords (UV)
        uv.push(
          x1, t,  x3, t,  x2, m,
          x2, m,  x3, t,  x4, m,

          x1, b,  x2, m,  x3, b,
          x2, m,  x4, m,  x3, b
        );

        // Barycentric coordinates
        barycentric.push(
          1, 0, 0,  0, 1, 0,  0, 0, 1,
          1, 0, 0,  0, 1, 0,  0, 0, 1,

          1, 0, 0,  0, 1, 0,  0, 0, 1,
          1, 0, 0,  0, 1, 0,  0, 0, 1
        );
      }
    }

    this.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    this.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.setAttribute('barycentric', new THREE.Float32BufferAttribute(barycentric, 3));
  }
}
