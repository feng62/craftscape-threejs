export const MAX_WATER_SOURCES = 24;

let nextSourceId = 1;

export class WaterSources {
  constructor() {
    this.sources = [];
    this.selectedId = null;

    this.storm = {
      enabled: false,
      u: 0.50,
      v: 0.78,
      radius: 0.16,
      intensity: 1.8
    };
  }

  addSource(u, v, opts = {}) {
    if (this.sources.length >= MAX_WATER_SOURCES) {
      return null;
    }

    const id = nextSourceId++;
    const source = {
      id,
      name: opts.name || `水源 #${id}`,
      u: Math.max(0.02, Math.min(0.98, u)),
      v: Math.max(0.02, Math.min(0.98, v)),
      radius: opts.radius !== undefined ? opts.radius : 0.04,
      flowRate: opts.flowRate !== undefined ? opts.flowRate : 1.8,
      mode: opts.mode === 'pulse' ? 'pulse' : 'continuous', // 'continuous' | 'pulse'
      sediment: opts.sediment !== undefined ? opts.sediment : 0.30,
      enabled: opts.enabled !== undefined ? opts.enabled : true,
      pulseActive: false,
      pulseTimer: 0,
      pulsePeakMult: 3.8,
      pulseDuration: 12.0,
      effectiveFlow: 0
    };

    this.sources.push(source);
    this.selectedId = source.id;
    return source;
  }

  removeSource(id) {
    const idx = this.sources.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.sources.splice(idx, 1);
      if (this.selectedId === id) {
        this.selectedId = this.sources.length > 0 ? this.sources[0].id : null;
      }
      return true;
    }
    return false;
  }

  clearAll() {
    this.sources = [];
    this.selectedId = null;
  }

  loadPresetSources(presetSources = []) {
    this.sources = [];
    this.selectedId = null;
    for (const s of presetSources) {
      if (this.sources.length >= MAX_WATER_SOURCES) break;
      this.addSource(s.u, s.v, s);
    }
    if (this.sources.length > 0) {
      this.selectedId = this.sources[0].id;
    }
  }

  /**
   * Expand preset sources across upstream watershed branches when worldSize >= 4
   */
  generateMultiBasinSources(baseSources = [], worldSize = 1) {
    if (worldSize < 3.5 || baseSources.length === 0) {
      this.loadPresetSources(baseSources);
      return;
    }

    const extraCount = worldSize >= 8 ? 5 : 4;
    const expanded = [];
    const baseTemplate = baseSources[0];

    for (let i = 0; i < extraCount; i++) {
      const t = extraCount === 1 ? 0.5 : i / (extraCount - 1);
      const u = 0.14 + t * 0.72;
      const v = 0.84 + (i % 2 === 0 ? 0.04 : -0.02);
      const orig = baseSources[i];
      expanded.push({
        name: orig ? orig.name : `流域支源 #${i + 1}`,
        u: orig ? orig.u : u,
        v: orig ? orig.v : v,
        radius: Math.max(0.022, (baseTemplate.radius || 0.038) * (worldSize >= 8 ? 0.78 : 0.9)),
        flowRate: baseTemplate.flowRate || 1.8,
        mode: orig ? orig.mode : 'continuous',
        sediment: baseTemplate.sediment || 0.32
      });
    }
    this.loadPresetSources(expanded);
  }

  getSource(id) {
    return this.sources.find((s) => s.id === id) || null;
  }

  triggerFlashFlood(targetId = null) {
    let triggered = 0;
    for (const s of this.sources) {
      if (targetId !== null && s.id !== targetId) continue;
      if (!s.enabled) s.enabled = true;
      s.pulseActive = true;
      s.pulseTimer = 0;
      triggered++;
    }
    return triggered;
  }

  getActivePulseRemaining() {
    let maxRem = 0;
    for (const s of this.sources) {
      if (s.pulseActive) {
        const rem = Math.max(0, s.pulseDuration - s.pulseTimer);
        if (rem > maxRem) maxRem = rem;
      }
    }
    return maxRem;
  }

  getActiveCount() {
    return this.sources.filter((s) => s.enabled).length;
  }

  /**
   * Hydrograph envelope:
   * 0.0s -> 1.5s: rapid surge rise to 1.0
   * 1.5s -> 4.0s: sustained peak flood wave
   * 4.0s -> 12.0s: exponential recession back to baseline
   */
  _evalEnvelope(t) {
    if (t < 1.5) {
      const k = t / 1.5;
      return k * k * (3.0 - 2.0 * k);
    }
    if (t < 4.0) {
      return 1.0;
    }
    if (t < 12.0) {
      const tail = (t - 4.0) / 8.0;
      return Math.exp(-3.2 * tail) * (1.0 - tail);
    }
    return 0.0;
  }

  update(delta) {
    const dt = Math.min(delta, 0.1);
    for (const s of this.sources) {
      if (!s.enabled) {
        s.effectiveFlow = 0;
        continue;
      }

      let base = s.mode === 'continuous' ? s.flowRate : 0.0;
      if (s.pulseActive) {
        s.pulseTimer += dt;
        const env = this._evalEnvelope(s.pulseTimer);
        base += s.flowRate * s.pulsePeakMult * env;
        if (s.pulseTimer >= s.pulseDuration) {
          s.pulseActive = false;
          s.pulseTimer = 0;
        }
      }
      s.effectiveFlow = base;
    }
  }

  fillUniforms(sourcesVec4Array, sedimentFloatArray, stormVec4) {
    for (let i = 0; i < MAX_WATER_SOURCES; i++) {
      const s = this.sources[i];
      if (s && s.enabled && s.effectiveFlow > 0.0001) {
        sourcesVec4Array[i].set(s.u, s.v, s.radius, s.effectiveFlow);
        // Surge carries extra silt
        const pulseBoost = s.pulseActive ? 0.25 : 0.0;
        sedimentFloatArray[i] = Math.min(1.0, s.sediment + pulseBoost);
      } else {
        sourcesVec4Array[i].set(0, 0, 0, 0);
        sedimentFloatArray[i] = 0;
      }
    }

    if (this.storm.enabled && this.storm.intensity > 0) {
      stormVec4.set(this.storm.u, this.storm.v, this.storm.radius, this.storm.intensity);
    } else {
      stormVec4.set(this.storm.u, this.storm.v, this.storm.radius, 0.0);
    }
  }

  toJSON() {
    return {
      sources: this.sources.map((s) => ({
        name: s.name,
        u: s.u,
        v: s.v,
        radius: s.radius,
        flowRate: s.flowRate,
        mode: s.mode,
        sediment: s.sediment,
        enabled: s.enabled
      })),
      storm: { ...this.storm }
    };
  }

  fromJSON(data) {
    if (!data) return;
    if (Array.isArray(data.sources)) {
      this.loadPresetSources(data.sources);
    }
    if (data.storm) {
      Object.assign(this.storm, data.storm);
    }
  }
}
