import * as THREE from 'three';

export class GridGeometry extends THREE.BufferGeometry {
  constructor({ xsize = 512, ysize = 512, width = 1, height = 1, cell_width = 4, cell_height = 4 } = {}) {
    super();

    const position = [];
    const uv = [];
    const barycentric = [];
    const cell_uv = [];

    const cell_count_x = xsize / cell_width;
    const cell_count_y = ysize / cell_height;

    for (let x = 0; x < xsize; x++) {
      const left = x / xsize;
      const right = (x + 1) / xsize;
      const pleft = left * width - width / 2;
      const pright = right * width - width / 2;

      const cell_x = Math.floor(x / cell_width) / cell_count_x;
      const cell_l = (x % cell_width) / cell_width;
      const cell_r = ((x % cell_width) + 1) / cell_width;

      for (let y = 0; y < ysize; y++) {
        const bottom = y / ysize;
        const top = (y + 1) / ysize;
        const pbottom = bottom * height - height / 2;
        const ptop = top * height - height / 2;

        const cell_y = Math.floor(y / cell_height) / cell_count_y;
        const cell_b = (y % cell_height) / cell_height;
        const cell_t = ((y % cell_height) + 1) / cell_height;

        // Position in XZ plane
        position.push(
          pleft, 0, ptop,
          pleft, 0, pbottom,
          pright, 0, ptop,

          pleft, 0, pbottom,
          pright, 0, pbottom,
          pright, 0, ptop
        );

        uv.push(
          left, top,
          left, bottom,
          right, top,

          left, bottom,
          right, bottom,
          right, top
        );

        cell_uv.push(
          cell_x, cell_y, cell_l, cell_t,
          cell_x, cell_y, cell_l, cell_b,
          cell_x, cell_y, cell_r, cell_t,

          cell_x, cell_y, cell_l, cell_b,
          cell_x, cell_y, cell_r, cell_b,
          cell_x, cell_y, cell_r, cell_t
        );

        barycentric.push(
          1, 0, 0,
          0, 1, 0,
          0, 0, 1,

          1, 0, 0,
          0, 1, 0,
          0, 0, 1
        );
      }
    }

    this.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    this.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.setAttribute('barycentric', new THREE.Float32BufferAttribute(barycentric, 3));
    this.setAttribute('cell_uv', new THREE.Float32BufferAttribute(cell_uv, 4));
  }
}
