import * as THREE from 'three';

export class GridGeometry extends THREE.BufferGeometry {
  constructor({ xsize = 512, ysize = 512, width = 1, height = 1 } = {}) {
    super();

    const cols = xsize + 1;
    const rows = ysize + 1;
    const vertexCount = cols * rows;

    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);

    const halfW = width * 0.5;
    const halfH = height * 0.5;

    let vPtr = 0;
    let uvPtr = 0;

    for (let y = 0; y <= ysize; y++) {
      const v = y / ysize;
      const pz = v * height - halfH;

      for (let x = 0; x <= xsize; x++) {
        const u = x / xsize;
        const px = u * width - halfW;

        positions[vPtr++] = px;
        positions[vPtr++] = 0;
        positions[vPtr++] = pz;

        uvs[uvPtr++] = u;
        uvs[uvPtr++] = v;
      }
    }

    const indexCount = xsize * ysize * 6;
    const indices = new Uint32Array(indexCount);
    let iPtr = 0;

    for (let y = 0; y < ysize; y++) {
      const row0 = y * cols;
      const row1 = (y + 1) * cols;

      for (let x = 0; x < xsize; x++) {
        const tl = row1 + x;
        const tr = row1 + x + 1;
        const bl = row0 + x;
        const br = row0 + x + 1;

        indices[iPtr++] = tl;
        indices[iPtr++] = bl;
        indices[iPtr++] = tr;

        indices[iPtr++] = bl;
        indices[iPtr++] = br;
        indices[iPtr++] = tr;
      }
    }

    this.setIndex(new THREE.BufferAttribute(indices, 1));
    this.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
}
