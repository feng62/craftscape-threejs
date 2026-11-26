import { LANDFORM_PRESETS, GEOLOGY_PRESETS, SOIL_TYPE_PRESETS } from '../config/presets.js';

const WORLD_SIZE_PRESETS = [1, 2, 4, 8, 16];
const SIM_RES_OPTIONS = [
  { size: 512, label: '512 流畅' },
  { size: 1024, label: '1024 高清' },
  { size: 2048, label: '2048 超清' }
];

const MODE_LABELS = {
  orbit: '浏览视角 · 左键旋转 / 右键平移',
  placeSource: '放置水源 · 点击地形布设或选中水源（右键旋转）',
  placeStorm: '局地暴雨 · 点击或拖拽设定暴雨中心（右键旋转）',
  sculpt: '地形雕刻 · 左键拖拽或按住空格塑形（右键旋转）'
};

export class HudController {
  constructor({ state, waterSources, sculptController, callbacks }) {
    this.state = state;
    this.waterSources = waterSources;
    this.sculptController = sculptController;
    this.callbacks = callbacks;

    this.activeTab = 'terrain';
    this.collapsed = false;
    this.bindings = [];
    this.regenTimer = null;

    this.root = document.createElement('div');
    this.root.className = 'hud-root';
    document.body.appendChild(this.root);

    this._render();
    this._bindEvents();
    this.refreshAll();
  }

  _scheduleTerrainRegen(clearWater = false) {
    clearTimeout(this.regenTimer);
    this.regenTimer = setTimeout(() => {
      this.callbacks.onRegenerateTerrain(clearWater);
    }, 45);
  }

  _sliderRow(label, path, min, max, step, formatFn, onChange) {
    const id = `sl_${path.replace(/\./g, '_')}`;
    return `
      <div class="hud-field">
        <div class="hud-field-head">
          <span class="hud-label">${label}</span>
          <span class="hud-val" id="${id}_val"></span>
        </div>
        <input class="hud-range" id="${id}" type="range" min="${min}" max="${max}" step="${step}" data-path="${path}" />
      </div>
    `;
  }

  _toggleRow(label, path, hint = '') {
    const id = `tg_${path.replace(/\./g, '_')}`;
    return `
      <label class="hud-toggle-row" for="${id}">
        <div>
          <div class="hud-label">${label}</div>
          ${hint ? `<div class="hud-hint">${hint}</div>` : ''}
        </div>
        <input class="hud-switch" id="${id}" type="checkbox" data-path="${path}" />
      </label>
    `;
  }

  _render() {
    this.root.innerHTML = `
      <!-- Top-Left Status Bar -->
      <div class="hud-topbar">
        <div class="hud-brand">
          <span class="hud-dot"></span>
          <span class="hud-title">CRAFTSCAPE 山洪沙盘</span>
        </div>
        <div class="hud-chips">
          <span class="hud-chip" id="hud_mode_hint"></span>
          <span class="hud-chip hud-chip-area" id="hud_world_badge">1×1 km (1 km²) · 512²</span>
          <span class="hud-chip hud-chip-dim" id="hud_fps">60 FPS</span>
          <span class="hud-chip hud-chip-cyan" id="hud_source_count">水源 0</span>
          <span class="hud-chip hud-chip-flood" id="hud_flood_badge" style="display:none;">山洪洪峰</span>
        </div>
        <div class="hud-geo-legend" id="hud_geo_legend" style="display:none;">
          <span class="leg-item"><i style="background:#f2ad38;"></i>湿陷沉降黄土</span>
          <span class="leg-item"><i style="background:#d64f3d;"></i>切沟黏性红壤</span>
          <span class="leg-item"><i style="background:#5ca8b8;"></i>抗冲砂砾</span>
          <span class="leg-item"><i style="background:#525c6b;"></i>基岩</span>
        </div>
      </div>

      <!-- Bottom Center Action Dock -->
      <div class="hud-dock">
        <div class="hud-dock-group">
          <button class="hud-dock-btn" data-mode="orbit" title="快捷键 1">浏览视角</button>
          <button class="hud-dock-btn" data-mode="placeSource" title="快捷键 2">放置水源</button>
          <button class="hud-dock-btn" data-mode="placeStorm" title="快捷键 3">局地暴雨</button>
          <button class="hud-dock-btn" data-mode="sculpt" title="快捷键 4">地形雕刻</button>
        </div>
        <div class="hud-dock-sep"></div>
        <div class="hud-dock-group">
          <button class="hud-action-btn hud-btn-flood" id="btn_flash_flood">触发山洪</button>
          <button class="hud-action-btn" id="btn_geology_view" title="切换写实航拍与地质土体分布视图">地质视图</button>
          <button class="hud-action-btn" id="btn_pause">暂停</button>
          <button class="hud-action-btn" id="btn_clear_water">清空水体</button>
          <button class="hud-action-btn" id="btn_reset_terrain">重置地形</button>
          <button class="hud-action-btn" id="btn_reset_camera" title="自动居中拉至全景视角">重置视角</button>
        </div>
      </div>

      <!-- Collapse Toggle -->
      <button class="hud-toggle-btn" id="btn_collapse_panel" title="折叠/展开控制面板">收起面板</button>

      <!-- Right Sidebar Panel -->
      <aside class="hud-panel" id="hud_panel">
        <div class="hud-tabs">
          <button class="hud-tab active" data-tab="terrain">地形地貌</button>
          <button class="hud-tab" data-tab="geology">石土材质</button>
          <button class="hud-tab" data-tab="sources">水源降雨</button>
          <button class="hud-tab" data-tab="physics">物理场景</button>
        </div>

        <div class="hud-tab-body">
          <!-- TAB 1: TERRAIN -->
          <section class="hud-pane active" data-pane="terrain">
            <div class="hud-section-title">地貌面积与模拟精度</div>
            <div class="hud-area-grid">
              ${WORLD_SIZE_PRESETS.map((sz) => `
                <button class="hud-area-btn" data-worldsize="${sz}">
                  <strong>${sz}×${sz}</strong>
                  <small>${sz * sz} km²</small>
                </button>
              `).join('')}
            </div>
            ${this._sliderRow('自定义边长 (km)', 'world.size', 1, 16, 1)}
            ${this._sliderRow('地貌尺度倍率 (大流域↔宽峡谷)', 'world.landformScale', 0.50, 3.00, 0.05)}
            <div class="hud-field">
              <div class="hud-field-head"><span class="hud-label">GPU 模拟网格精度</span></div>
              <div class="hud-seg">
                ${SIM_RES_OPTIONS.map((opt) => `
                  <button class="hud-seg-btn" data-simsize="${opt.size}">${opt.label}</button>
                `).join('')}
              </div>
            </div>

            <div class="hud-section-title">地貌预设模板</div>
            <div class="hud-preset-grid" id="landform_preset_grid">
              ${LANDFORM_PRESETS.map((p) => `
                <button class="hud-preset-card" data-landform="${p.id}">
                  <div class="hud-preset-name">${p.name}</div>
                  <div class="hud-preset-desc">${p.desc}</div>
                </button>
              `).join('')}
            </div>

            <div class="hud-section-title">地貌精细参数</div>
            ${this._sliderRow('地形起伏高度', 'terrain.heightScale', 0.06, 0.36, 0.01)}
            ${this._sliderRow('整体上游坡降', 'terrain.slopeTilt', 0.0, 0.22, 0.01)}
            ${this._sliderRow('主谷下切深度', 'terrain.valleyDepth', 0.0, 1.0, 0.02)}
            ${this._sliderRow('河谷宽度', 'terrain.valleyWidth', 0.08, 0.70, 0.02)}
            ${this._sliderRow('支沟沟壑密度', 'terrain.gullyDensity', 0.0, 1.0, 0.02)}
            ${this._sliderRow('地表粗糙度', 'terrain.roughness', 0.0, 1.0, 0.02)}
            ${this._sliderRow('噪声随机种子', 'terrain.seed', 1, 999, 1)}

            <div class="hud-btn-row">
              <button class="hud-mini-btn" id="btn_random_seed">随机种子</button>
              <button class="hud-mini-btn hud-mini-accent" id="btn_pre_erode">水力预侵蚀 (+80步)</button>
            </div>
          </section>

          <!-- TAB 2: GEOLOGY -->
          <section class="hud-pane" data-pane="geology">
            <div class="hud-section-title">地质土体类型（冲刷行为模式）</div>
            <div class="hud-soil-grid">
              ${SOIL_TYPE_PRESETS.map((st) => `
                <button class="hud-soil-card" data-soiltype="${st.typeIndex}">
                  <div class="hud-soil-head">
                    <span>${st.name}</span>
                    <em>${st.badge}</em>
                  </div>
                  <small>${st.desc}</small>
                </button>
              `).join('')}
            </div>
            ${this._sliderRow('空间地质不均匀度', 'geology.soilHeterogeneity', 0.0, 1.0, 0.02)}
            ${this._toggleRow('地质土体分布视图', 'visual.geologyView', '用专题色直观分辨湿陷沉降区与切沟区')}

            <div class="hud-section-title">石土结构预设</div>
            <div class="hud-geo-grid" id="geology_preset_grid">
              ${GEOLOGY_PRESETS.map((g) => `
                <button class="hud-geo-btn" data-geology="${g.id}">
                  <span>${g.name}</span>
                  <small>${g.desc}</small>
                </button>
              `).join('')}
            </div>

            <div class="hud-section-title">岩石与泥土分布（实时重建）</div>
            ${this._sliderRow('泥土占比 (0%全岩 ~ 100%覆土)', 'geology.soilRatio', 0.0, 1.0, 0.01)}
            ${this._sliderRow('表层覆土厚度', 'geology.soilDepth', 0.01, 0.12, 0.005)}
            ${this._sliderRow('陡坡裸岩阈值', 'geology.rockSlopeThreshold', 0.10, 0.90, 0.02)}
            ${this._sliderRow('石土斑块扰动', 'geology.soilPatchiness', 0.0, 1.0, 0.02)}

            <div class="hud-section-title">差异化冲刷与滑坡</div>
            ${this._toggleRow('启用水流侵蚀搬运', 'physics.erode', '急流掏蚀基岩、搬运并淤积泥沙')}
            ${this._sliderRow('全局侵蚀强度', 'physics.erodeRate', 0.0, 5.0, 0.1)}
            ${this._sliderRow('基岩抗冲硬度', 'physics.rockHardness', 0.3, 4.0, 0.1)}
            ${this._sliderRow('泥土易蚀度', 'physics.soilErodibility', 0.2, 4.0, 0.1)}
            ${this._sliderRow('湿土坡面滑移率', 'physics.soilSlip', 0.0, 3.0, 0.1)}
          </section>

          <!-- TAB 3: SOURCES & RAIN -->
          <section class="hud-pane" data-pane="sources">
            <div class="hud-btn-row">
              <button class="hud-mini-btn hud-mini-flood" id="btn_tab_flood">全员山洪爆发</button>
              <button class="hud-mini-btn" id="btn_restore_sources">恢复谷头默认</button>
              <button class="hud-mini-btn hud-mini-danger" id="btn_clear_sources">清空水源</button>
            </div>

            <div class="hud-section-title">点击地形新增水源默认值</div>
            ${this._sliderRow('新水源出流半径', 'placement.radius', 0.015, 0.10, 0.005)}
            ${this._sliderRow('新水源基础流量', 'placement.flowRate', 0.3, 5.0, 0.1)}
            <div class="hud-field">
              <div class="hud-field-head"><span class="hud-label">新水源模式</span></div>
              <div class="hud-seg">
                <button class="hud-seg-btn active" data-newsrcmode="continuous">持续来水</button>
                <button class="hud-seg-btn" data-newsrcmode="pulse">待命洪峰</button>
              </div>
            </div>

            <div class="hud-section-title">已布设水源点 (<span id="sources_list_count">0</span>/24)</div>
            <div class="hud-source-list" id="sources_list"></div>

            <div class="hud-section-title">全局降雨与局地暴雨</div>
            ${this._toggleRow('开启全局降雨', 'physics.rain')}
            ${this._sliderRow('全局降雨强度', 'physics.rainRate', 0, 100, 1)}
            ${this._sliderRow('雨滴下落速度', 'physics.rainSpeed', 0.5, 4.0, 0.1)}
            ${this._toggleRow('开启局地强暴雨区', 'storm.enabled', '切换“局地暴雨”模式可点击移动位置')}
            ${this._sliderRow('局地暴雨半径', 'storm.radius', 0.05, 0.35, 0.01)}
            ${this._sliderRow('局地暴雨强度', 'storm.intensity', 0.2, 5.0, 0.1)}
          </section>

          <!-- TAB 4: PHYSICS & SCENE -->
          <section class="hud-pane" data-pane="physics">
            <div class="hud-section-title">水动力学与边界</div>
            ${this._toggleRow('开放边界自由排水', 'physics.openBoundary', '关闭则四周封闭形成蓄水盆地')}
            ${this._sliderRow('物理子步加速 (Substeps)', 'physics.substeps', 1, 4, 1)}
            ${this._sliderRow('水流速度倍率', 'physics.flowSpeed', 0.2, 4.0, 0.1)}
            ${this._toggleRow('开启水面蒸发', 'physics.evaporate')}
            ${this._sliderRow('蒸发速率', 'physics.evaporateRate', 0.0, 5.0, 0.1)}

            <div class="hud-section-title">视觉材质与沙盘样式</div>
            ${this._sliderRow('山洪泥沙浑浊度', 'visual.mudIntensity', 0.0, 2.0, 0.05)}
            ${this._sliderRow('缓坡植被覆盖度', 'visual.grassDensity', 0.0, 1.0, 0.05)}
            ${this._toggleRow('显示立体地质切面底座', 'visual.showSkirt')}
            ${this._toggleRow('显示水源 3D 标记', 'visual.showMarkers')}

            <div class="hud-field">
              <div class="hud-field-head"><span class="hud-label">地形网格风格</span></div>
              <div class="hud-seg">
                <button class="hud-seg-btn active" data-meshstyle="smooth">平滑地形</button>
                <button class="hud-seg-btn" data-meshstyle="hex">六边形柱体</button>
              </div>
            </div>

            <div class="hud-section-title">地形雕刻笔刷</div>
            <div class="hud-field">
              <div class="hud-field-head"><span class="hud-label">雕刻物质 / 操作</span></div>
              <div class="hud-seg">
                <button class="hud-seg-btn active" data-modtype="rock">岩石</button>
                <button class="hud-seg-btn" data-modtype="soil">泥土</button>
                <button class="hud-seg-btn" data-modtype="water">水体</button>
              </div>
              <div class="hud-seg" style="margin-top:6px;">
                <button class="hud-seg-btn active" data-modop="add">抬高 / 加水</button>
                <button class="hud-seg-btn" data-modop="sub">挖深 / 抽水</button>
              </div>
            </div>
            ${this._sliderRow('笔刷作用半径', 'sculpt.editsize', 2.0, 16.0, 0.5)}

            <div class="hud-section-title">场景参数导出 / 导入</div>
            <div class="hud-btn-row">
              <button class="hud-mini-btn" id="btn_export_json">导出配置 (JSON)</button>
              <button class="hud-mini-btn" id="btn_import_json">导入配置 (JSON)</button>
              <input type="file" id="file_import_json" accept=".json,application/json" style="display:none;" />
            </div>
          </section>
        </div>
      </aside>
    `;
  }

  _getByPath(path) {
    if (path.startsWith('storm.')) {
      return this.waterSources.storm[path.slice(6)];
    }
    if (path.startsWith('placement.')) {
      const k = path.slice(10);
      if (k === 'radius') return this.sculptController.newSourceRadius;
      if (k === 'flowRate') return this.sculptController.newSourceFlow;
    }
    if (path.startsWith('sculpt.')) {
      return this.sculptController[path.slice(7)];
    }
    const parts = path.split('.');
    let cur = this.state;
    for (const p of parts) cur = cur?.[p];
    return cur;
  }

  _setByPath(path, value) {
    if (path.startsWith('storm.')) {
      const k = path.slice(6);
      this.waterSources.storm[k] = value;
      return;
    }
    if (path.startsWith('placement.')) {
      const k = path.slice(10);
      if (k === 'radius') this.sculptController.newSourceRadius = value;
      if (k === 'flowRate') this.sculptController.newSourceFlow = value;
      return;
    }
    if (path.startsWith('sculpt.')) {
      this.sculptController[path.slice(7)] = value;
      return;
    }
    const parts = path.split('.');
    let cur = this.state;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts[parts.length - 1]] = value;
  }

  _formatValue(path, val) {
    if (typeof val !== 'number') return '';
    if (path === 'world.size' || path.includes('seed') || path.includes('substeps') || path.includes('rainRate')) {
      return Math.round(val).toString();
    }
    if (path.includes('soilRatio') || path.includes('grassDensity')) {
      return `${Math.round(val * 100)}%`;
    }
    if (path.includes('Radius') || path.includes('radius') || path.includes('soilDepth')) {
      return val.toFixed(3);
    }
    return val.toFixed(2);
  }

  _bindEvents() {
    // Tab switches
    this.root.querySelectorAll('.hud-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.dataset.tab);
      });
    });

    // Collapse panel
    this.root.querySelector('#btn_collapse_panel').addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.root.querySelector('#hud_panel').classList.toggle('collapsed', this.collapsed);
      this.root.querySelector('#btn_collapse_panel').textContent = this.collapsed ? '展开面板' : '收起面板';
    });

    // Dock mode buttons
    this.root.querySelectorAll('.hud-dock-btn[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onSetMode(btn.dataset.mode);
      });
    });

    // Dock action buttons
    this.root.querySelector('#btn_flash_flood').addEventListener('click', () => this.callbacks.onTriggerFlashFlood());
    this.root.querySelector('#btn_geology_view').addEventListener('click', () => this.callbacks.onToggleGeologyView());
    this.root.querySelector('#btn_tab_flood').addEventListener('click', () => this.callbacks.onTriggerFlashFlood());
    this.root.querySelector('#btn_pause').addEventListener('click', () => this.callbacks.onTogglePause());
    this.root.querySelector('#btn_clear_water').addEventListener('click', () => this.callbacks.onClearWater());
    this.root.querySelector('#btn_reset_terrain').addEventListener('click', () => this.callbacks.onRegenerateTerrain(true));
    this.root.querySelector('#btn_reset_camera').addEventListener('click', () => this.callbacks.onResetCamera());

    // World size quick buttons
    this.root.querySelectorAll('.hud-area-btn[data-worldsize]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const size = Number(btn.dataset.worldsize);
        this.callbacks.onSetWorldSize(size);
      });
    });

    // Simulation resolution segmented control
    this.root.querySelectorAll('.hud-seg-btn[data-simsize]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const simSize = Number(btn.dataset.simsize);
        this.callbacks.onSetSimSize(simSize);
      });
    });

    // Landform presets
    this.root.querySelectorAll('.hud-preset-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onApplyLandformPreset(btn.dataset.landform);
      });
    });

    // Geology presets & soil type cards
    this.root.querySelectorAll('.hud-soil-card[data-soiltype]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onSetSoilType(Number(btn.dataset.soiltype));
      });
    });

    this.root.querySelectorAll('.hud-geo-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onApplyGeologyPreset(btn.dataset.geology);
      });
    });

    // Random seed & pre-erosion
    this.root.querySelector('#btn_random_seed').addEventListener('click', () => {
      this.state.terrain.seed = Math.floor(Math.random() * 990) + 1;
      this.refreshInputs();
      this.callbacks.onRegenerateTerrain(false);
    });
    this.root.querySelector('#btn_pre_erode').addEventListener('click', () => {
      this.callbacks.onPreErode(80);
    });

    // Sources quick actions
    this.root.querySelector('#btn_restore_sources').addEventListener('click', () => this.callbacks.onRestorePresetSources());
    this.root.querySelector('#btn_clear_sources').addEventListener('click', () => {
      this.waterSources.clearAll();
      this.renderSourcesList();
    });

    // New source mode segmented control
    this.root.querySelectorAll('[data-newsrcmode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.sculptController.newSourceMode = btn.dataset.newsrcmode;
        this.root.querySelectorAll('[data-newsrcmode]').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    // Mesh style segmented control
    this.root.querySelectorAll('[data-meshstyle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onSetMeshStyle(btn.dataset.meshstyle);
        this.root.querySelectorAll('[data-meshstyle]').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    // Sculpt type & op
    this.root.querySelectorAll('[data-modtype]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.sculptController.modtype = btn.dataset.modtype;
        this.root.querySelectorAll('[data-modtype]').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
    this.root.querySelectorAll('[data-modop]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.sculptController.modop = btn.dataset.modop;
        this.root.querySelectorAll('[data-modop]').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    // Export / Import JSON
    this.root.querySelector('#btn_export_json').addEventListener('click', () => this.callbacks.onExportJSON());
    const fileInput = this.root.querySelector('#file_import_json');
    this.root.querySelector('#btn_import_json').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          this.callbacks.onImportJSON(parsed);
        } catch (err) {
          alert('JSON 配置文件解析失败：' + err.message);
        }
        fileInput.value = '';
      };
      reader.readAsText(file);
    });

    // Range sliders binding
    this.root.querySelectorAll('.hud-range').forEach((input) => {
      const path = input.dataset.path;
      const valEl = this.root.querySelector(`#${input.id}_val`);
      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        this._setByPath(path, val);
        if (valEl) valEl.textContent = this._formatValue(path, val);

        if (path === 'world.size') {
          this.callbacks.onSetWorldSize(Math.round(val));
          return;
        }
        if (path === 'world.landformScale') {
          this._scheduleTerrainRegen(false);
          return;
        }
        if (path === 'geology.soilHeterogeneity') {
          this.callbacks.onGeologyHeterogeneityChange();
          return;
        }
        if (path.startsWith('terrain.') || path.startsWith('geology.')) {
          this._scheduleTerrainRegen(false);
        }
        if (path === 'visual.mudIntensity' || path === 'visual.grassDensity') {
          this.callbacks.onVisualChange();
        }
      });
    });

    // Checkboxes binding
    this.root.querySelectorAll('.hud-switch').forEach((input) => {
      const path = input.dataset.path;
      input.addEventListener('change', () => {
        this._setByPath(path, input.checked);
        if (path === 'visual.showSkirt' || path === 'visual.showMarkers' || path === 'visual.geologyView') {
          this.callbacks.onVisualChange();
          this.refreshInputs();
        }
      });
    });
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    this.root.querySelectorAll('.hud-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
    this.root.querySelectorAll('.hud-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tabName));
  }

  refreshInputs() {
    this.root.querySelectorAll('.hud-range').forEach((input) => {
      const path = input.dataset.path;
      const val = this._getByPath(path);
      if (val !== undefined) {
        input.value = val;
        const valEl = this.root.querySelector(`#${input.id}_val`);
        if (valEl) valEl.textContent = this._formatValue(path, val);
      }
    });

    this.root.querySelectorAll('.hud-switch').forEach((input) => {
      const path = input.dataset.path;
      const val = this._getByPath(path);
      if (val !== undefined) {
        input.checked = Boolean(val);
      }
    });

    // Active landform preset highlight
    this.root.querySelectorAll('.hud-preset-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.landform === this.state.activeLandformId);
    });

    // World area & simulation resolution highlight
    const wSize = this.state.world.size;
    const sSize = this.state.world.simSize;
    this.root.querySelectorAll('.hud-area-btn[data-worldsize]').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.worldsize) === wSize);
    });
    this.root.querySelectorAll('.hud-seg-btn[data-simsize]').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.simsize) === sSize);
    });
    const worldBadge = this.root.querySelector('#hud_world_badge');
    if (worldBadge) {
      worldBadge.textContent = `${wSize}×${wSize} km (${wSize * wSize} km²) · ${sSize}²`;
    }

    // Active mode & pause state
    this.root.querySelectorAll('.hud-dock-btn[data-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === this.sculptController.mode);
    });
    this.root.querySelector('#hud_mode_hint').textContent = MODE_LABELS[this.sculptController.mode] || '';
    const pauseBtn = this.root.querySelector('#btn_pause');
    pauseBtn.textContent = this.state.physics.paused ? '继续' : '暂停';
    pauseBtn.classList.toggle('active', this.state.physics.paused);

    // Soil type highlight & geology view state
    this.root.querySelectorAll('.hud-soil-card[data-soiltype]').forEach((card) => {
      card.classList.toggle('active', Number(card.dataset.soiltype) === this.state.geology.soilType);
    });
    const geoBtn = this.root.querySelector('#btn_geology_view');
    const geoLegend = this.root.querySelector('#hud_geo_legend');
    if (geoBtn) geoBtn.classList.toggle('active', Boolean(this.state.visual.geologyView));
    if (geoLegend) geoLegend.style.display = this.state.visual.geologyView ? 'flex' : 'none';

    // Segmented buttons sync
    this.root.querySelectorAll('[data-meshstyle]').forEach((b) => {
      b.classList.toggle('active', b.dataset.meshstyle === this.state.visual.meshStyle);
    });
  }

  renderSourcesList() {
    const listEl = this.root.querySelector('#sources_list');
    const countEl = this.root.querySelector('#sources_list_count');
    const sources = this.waterSources.sources;
    countEl.textContent = String(sources.length);

    if (sources.length === 0) {
      listEl.innerHTML = `<div class="hud-empty">暂无水源点。请切换底部「放置水源」后点击地形添加。</div>`;
      return;
    }

    listEl.innerHTML = sources.map((s) => {
      const isSelected = s.id === this.waterSources.selectedId;
      return `
        <div class="hud-src-card ${isSelected ? 'selected' : ''} ${s.pulseActive ? 'pulsing' : ''}" data-src-id="${s.id}">
          <div class="hud-src-top">
            <label class="hud-src-title">
              <input type="checkbox" class="src-enable" ${s.enabled ? 'checked' : ''} />
              <span>${s.name}</span>
            </label>
            <div class="hud-src-actions">
              <button class="src-mode-btn">${s.mode === 'continuous' ? '持续' : '洪峰'}</button>
              <button class="src-pulse-btn" title="对该点单独触发一次山洪">涌浪</button>
              <button class="src-del-btn" title="删除水源">×</button>
            </div>
          </div>
          <div class="hud-src-sliders">
            <div class="hud-src-row">
              <span>流量 <b>${s.flowRate.toFixed(1)}</b></span>
              <input type="range" class="src-flow" min="0.2" max="5.0" step="0.1" value="${s.flowRate}" />
            </div>
            <div class="hud-src-row">
              <span>半径 <b>${s.radius.toFixed(3)}</b></span>
              <input type="range" class="src-rad" min="0.015" max="0.10" step="0.005" value="${s.radius}" />
            </div>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.hud-src-card').forEach((card) => {
      const id = Number(card.dataset.srcId);
      const src = this.waterSources.getSource(id);
      if (!src) return;

      card.addEventListener('click', (e) => {
        if (!e.target.closest('button, input')) {
          this.waterSources.selectedId = id;
          this.renderSourcesList();
        }
      });

      card.querySelector('.src-enable').addEventListener('change', (e) => {
        src.enabled = e.target.checked;
      });

      card.querySelector('.src-mode-btn').addEventListener('click', () => {
        src.mode = src.mode === 'continuous' ? 'pulse' : 'continuous';
        this.renderSourcesList();
      });

      card.querySelector('.src-pulse-btn').addEventListener('click', () => {
        this.waterSources.triggerFlashFlood(id);
        this.renderSourcesList();
      });

      card.querySelector('.src-del-btn').addEventListener('click', () => {
        this.waterSources.removeSource(id);
        this.renderSourcesList();
      });

      const flowInput = card.querySelector('.src-flow');
      const flowLabel = flowInput.previousElementSibling.querySelector('b');
      flowInput.addEventListener('input', () => {
        src.flowRate = parseFloat(flowInput.value);
        flowLabel.textContent = src.flowRate.toFixed(1);
      });

      const radInput = card.querySelector('.src-rad');
      const radLabel = radInput.previousElementSibling.querySelector('b');
      radInput.addEventListener('input', () => {
        src.radius = parseFloat(radInput.value);
        radLabel.textContent = src.radius.toFixed(3);
      });
    });
  }

  refreshAll() {
    this.refreshInputs();
    this.renderSourcesList();
  }

  updateTelemetry(fps, preErodeRemaining) {
    const fpsEl = this.root.querySelector('#hud_fps');
    const srcEl = this.root.querySelector('#hud_source_count');
    const floodBadge = this.root.querySelector('#hud_flood_badge');
    const preBtn = this.root.querySelector('#btn_pre_erode');

    fpsEl.textContent = `${Math.round(fps)} FPS`;
    srcEl.textContent = `水源 ${this.waterSources.getActiveCount()}/${this.waterSources.sources.length}`;

    const rem = this.waterSources.getActivePulseRemaining();
    if (rem > 0) {
      floodBadge.style.display = 'inline-flex';
      floodBadge.textContent = `洪峰演进 ${rem.toFixed(1)}s`;
    } else {
      floodBadge.style.display = 'none';
    }

    if (preBtn) {
      preBtn.textContent = preErodeRemaining > 0
        ? `预侵蚀计算中 (${preErodeRemaining})...`
        : '水力预侵蚀 (+80步)';
    }
  }
}
