import * as THREE from 'three';

export class SculptController {
  constructor(domElement) {
    this.domElement = domElement;

    this.mousepos = new THREE.Vector2(0, 0);
    this.editsize = 3.0;

    this.enableSculpt = true; // Boolean toggle for sculpting tool
    this.isMouseDown = false;

    this.keys = {
      space: false,
      w: false,
      a: false,
      s: false,
      d: false,
      q: false,
      e: false
    };

    this.modtype = 'rock'; // 'rock', 'soil', 'water'
    this.modop = 'add'; // 'add', 'sub'
    this.rain = true;
    this.rainRate = 10.0;
    this.rainSpeed = 1.5;
    this.stormMuddy = 0.5;
    this.erode = true;
    this.erodeRate = 1.0;
    this.evaporate = true;
    this.evaporateRate = 1.0;
    this.flowSpeed = 1.0;

    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);

    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  onMouseMove(event) {
    this.mousepos.x = event.clientX;
    this.mousepos.y = window.innerHeight - event.clientY;
  }

  onMouseDown(event) {
    // Only respond to left click (button === 0) on canvas (target !== GUI)
    if (event.button === 0 && !event.target.closest('.lil-gui')) {
      this.isMouseDown = true;
    }
  }

  onMouseUp(event) {
    if (event.button === 0) {
      this.isMouseDown = false;
    }
  }

  onKeyDown(event) {
    if (event.code === 'Space') this.keys.space = true;
    if (event.code === 'KeyW') this.keys.w = true;
    if (event.code === 'KeyA') this.keys.a = true;
    if (event.code === 'KeyS') this.keys.s = true;
    if (event.code === 'KeyD') this.keys.d = true;
    if (event.code === 'KeyQ') this.keys.q = true;
    if (event.code === 'KeyE') this.keys.e = true;
  }

  onKeyUp(event) {
    if (event.code === 'Space') this.keys.space = false;
    if (event.code === 'KeyW') this.keys.w = false;
    if (event.code === 'KeyA') this.keys.a = false;
    if (event.code === 'KeyS') this.keys.s = false;
    if (event.code === 'KeyD') this.keys.d = false;
    if (event.code === 'KeyQ') this.keys.q = false;
    if (event.code === 'KeyE') this.keys.e = false;
  }

  get state() {
    const dir = this.modop === 'add' ? 1.0 : -1.0;
    const isSculpting = this.enableSculpt && (this.keys.space || this.isMouseDown);
    return {
      rock: this.modtype === 'rock' ? 1.0 : 0.0,
      soil: this.modtype === 'soil' ? 1.0 : 0.0,
      water: this.modtype === 'water' ? 1.0 : 0.0,
      dir,
      enableSculpt: this.enableSculpt,
      rain: this.rain ? 1.0 : 0.0,
      rainRate: this.rainRate,
      rainSpeed: this.rainSpeed,
      stormMuddy: this.stormMuddy,
      erode: this.erode ? 1.0 : 0.0,
      erodeRate: this.erodeRate,
      evaporate: this.evaporate ? 1.0 : 0.0,
      evaporateRate: this.evaporateRate,
      flowSpeed: this.flowSpeed,
      editsize: this.editsize,
      isSculpting,
      create: isSculpting && this.modtype === 'water' ? 1.0 * dir : 0.0
    };
  }

  dispose() {
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}
