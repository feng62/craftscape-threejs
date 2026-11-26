import * as THREE from 'three';

export class SkirtGeometry extends THREE.BufferGeometry {
  constructor({ xsize = 512, ysize = 512, width = 1, height = 1, baseHeight = -0.075 } = {}) {
    super();

    const segX = Math.min(xsize, 512);
    const segY = Math.min(ysize, 512);

    const position = [];
    const uv = [];
    const normal = [];
    const isTop = [];

    const hw = width * 0.5;
    const hh = height * 0.5;

    const pushWall = (steps, getPoint) => {
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const p0 = getPoint(t0);
        const p1 = getPoint(t1);

        // Two triangles forming one vertical quad from baseHeight to terrain surface
        // Triangle 1: (p0 top, p0 bottom, p1 top)
        position.push(
          p0.x, 0, p0.z,
          p0.x, baseHeight, p0.z,
          p1.x, 0, p1.z
        );
        uv.push(p0.u, p0.v, p0.u, p0.v, p1.u, p1.v);
        normal.push(p0.nx, 0, p0.nz, p0.nx, 0, p0.nz, p1.nx, 0, p1.nz);
        isTop.push(1, 0, 1);

        // Triangle 2: (p0 bottom, p1 bottom, p1 top)
        position.push(
          p0.x, baseHeight, p0.z,
          p1.x, baseHeight, p1.z,
          p1.x, 0, p1.z
        );
        uv.push(p0.u, p0.v, p1.u, p1.v, p1.u, p1.v);
        normal.push(p0.nx, 0, p0.nz, p1.nx, 0, p1.nz, p1.nx, 0, p1.nz);
        isTop.push(0, 0, 1);
      }
    };

    // North edge (z = +hh, v = 1)
    pushWall(segX, (t) => ({ x: t * width - hw, z: hh, u: t, v: 1, nx: 0, nz: 1 }));
    // South edge (z = -hh, v = 0)
    pushWall(segX, (t) => ({ x: (1 - t) * width - hw, z: -hh, u: 1 - t, v: 0, nx: 0, nz: -1 }));
    // East edge (x = +hw, u = 1)
    pushWall(segY, (t) => ({ x: hw, z: (1 - t) * height - hh, u: 1, v: 1 - t, nx: 1, nz: 0 }));
    // West edge (x = -hw, u = 0)
    pushWall(segY, (t) => ({ x: -hw, z: t * height - hh, u: 0, v: t, nx: -1, nz: 0 }));

    // Bottom cap plate at baseHeight
    position.push(
      -hw, baseHeight, -hh,
       hw, baseHeight, -hh,
       hw, baseHeight,  hh,
      -hw, baseHeight, -hh,
       hw, baseHeight,  hh,
      -hw, baseHeight,  hh
    );
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    normal.push(0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0);
    isTop.push(0, 0, 0, 0, 0, 0);

    this.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    this.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    this.setAttribute('isTop', new THREE.Float32BufferAttribute(isTop, 1));
  }
}
