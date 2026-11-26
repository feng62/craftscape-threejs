import * as THREE from 'three';

export class SculptController {
  constructor(domElement) {
    this.domElement = domElement;

    this.mousepos = new THREE.Vector2(0, 0);
    this.ndc = new THREE.Vector2(0, 0);

    // Interaction mode: 'orbit' | 'placeSource' | 'placeStorm' | 'sculpt'
    this.mode = 'orbit';
    this.isLeftDown = false;
    this.pointerInsideCanvas = false;

    this.keys = {
      space: false,
      w: false,
      a: false,
      s: false,
      d: false,
      q: false,
      e: false
    };

    // Sculpt brush settings
    this.modtype = 'rock'; // 'rock' | 'soil' | 'water'
    this.modop = 'add';    // 'add' | 'sub'
    this.editsize = 3.5;

    // Placement defaults
    this.newSourceRadius = 0.04;
    this.newSourceFlow = 1.8;
    this.newSourceMode = 'continuous';

    // Callbacks registered by main.js
    this.onPlaceSource = null;
    this.onPlaceStorm = null;
    this.onModeShortcut = null;

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);

    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _isHudTarget(target) {
    return Boolean(target && target.closest && target.closest('.hud-root, .hud-panel, .hud-dock, .hud-topbar, .hud-toggle-btn'));
  }

  _updateCoords(event) {
    this.mousepos.x = event.clientX;
    this.mousepos.y = window.innerHeight - event.clientY;
    this.ndc.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.ndc.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  _onMouseMove(event) {
    this._updateCoords(event);
    this.pointerInsideCanvas = !this._isHudTarget(event.target);

    if (this.isLeftDown && this.mode === 'placeStorm' && this.onPlaceStorm) {
      this.onPlaceStorm(this.ndc);
    }
  }

  _onMouseDown(event) {
    this._updateCoords(event);
    if (this._isHudTarget(event.target)) return;

    if (event.button === 0) {
      this.isLeftDown = true;
      if (this.mode === 'placeSource' && this.onPlaceSource) {
        this.onPlaceSource(this.ndc);
      } else if (this.mode === 'placeStorm' && this.onPlaceStorm) {
        this.onPlaceStorm(this.ndc);
      }
    }
  }

  _onMouseUp(event) {
    if (event.button === 0) {
      this.isLeftDown = false;
    }
  }

  _onKeyDown(event) {
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (event.code === 'Space') {
      event.preventDefault();
      this.keys.space = true;
    }
    if (event.code === 'KeyW') this.keys.w = true;
    if (event.code === 'KeyA') this.keys.a = true;
    if (event.code === 'KeyS') this.keys.s = true;
    if (event.code === 'KeyD') this.keys.d = true;
    if (event.code === 'KeyQ') this.keys.q = true;
    if (event.code === 'KeyE') this.keys.e = true;

    if (this.onModeShortcut) {
      if (event.key === '1') this.onModeShortcut('orbit');
      if (event.key === '2') this.onModeShortcut('placeSource');
      if (event.key === '3') this.onModeShortcut('placeStorm');
      if (event.key === '4') this.onModeShortcut('sculpt');
    }
  }

  _onKeyUp(event) {
    if (event.code === 'Space') this.keys.space = false;
    if (event.code === 'KeyW') this.keys.w = false;
    if (event.code === 'KeyA') this.keys.a = false;
    if (event.code === 'KeyS') this.keys.s = false;
    if (event.code === 'KeyD') this.keys.d = false;
    if (event.code === 'KeyQ') this.keys.q = false;
    if (event.code === 'KeyE') this.keys.e = false;
  }

  isSculptActive() {
    return (this.mode === 'sculpt' && this.isLeftDown) || this.keys.space;
  }

  getCursorMode(stormRadius) {
    if (!this.pointerInsideCanvas) return { mode: 0.0, radius: 0.0 };
    if (this.mode === 'sculpt' || this.keys.space) {
      return { mode: 1.0, radius: 0.0 };
    }
    if (this.mode === 'placeSource') {
      return { mode: 2.0, radius: this.newSourceRadius };
    }
    if (this.mode === 'placeStorm') {
      return { mode: 3.0, radius: stormRadius };
    }
    return { mode: 0.0, radius: 0.0 };
  }

  getSimState(simParams, worldParams = { size: 1, verticalScale: 1 }) {
    const dir = this.modop === 'add' ? 1.0 : -1.0;
    const isSculpting = this.isSculptActive();

    return {
      rock: this.modtype === 'rock' ? 1.0 : 0.0,
      soil: this.modtype === 'soil' ? 1.0 : 0.0,
      water: this.modtype === 'water' ? 1.0 : 0.0,
      dir,
      editsize: this.editsize,
      isSculpting,
      create: isSculpting && this.modtype === 'water' ? 1.0 * dir : 0.0,

      worldSize: worldParams.size || 1.0,
      verticalScale: worldParams.verticalScale || 1.0,

      paused: simParams.paused,
      rain: simParams.rain,
      rainRate: simParams.rainRate,
      rainSpeed: simParams.rainSpeed,
      erode: simParams.erode,
      erodeRate: simParams.erodeRate,
      evaporate: simParams.evaporate,
      evaporateRate: simParams.evaporateRate,
      flowSpeed: simParams.flowSpeed,
      substeps: simParams.substeps,
      openBoundary: simParams.openBoundary,
      rockHardness: simParams.rockHardness,
      soilErodibility: simParams.soilErodibility,
      soilSlip: simParams.soilSlip
    };
  }

  dispose() {
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
