# Craftscape Three.js 🌊⛰️

> 基于 **Three.js (r185+)** 与 **WebGL GPGPU 浅水物理学** 的现代三维地形雕刻与水文模拟系统。
> 本项目重构移植自 Florian Boesch 的经典 WebGL 引擎 [pyalot/craftscape](https://github.com/pyalot/craftscape)。

[![Three.js](https://img.shields.io/badge/Three.js-r185+-blue.svg)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF.svg)](https://vitejs.dev/)
[![pnpm](https://img.shields.io/badge/pnpm-9.x-F69220.svg)](https://pnpm.io/)
[![License](https://img.shields.io/badge/License-AGPLv3-green.svg)](LICENSE)

---

## 📖 项目简介

**Craftscape Three.js** 是一个部署于 Web 端的实时三维地形交互雕刻与物理水动力学演变引擎。通过将 GPU Framebuffer Object (FBO) 双缓冲区技术与三维光线步进（Raymarching）相结合，系统能够在浏览器中以高帧率实时模拟山体建造、土壤漫延、重力侵蚀、降雨积水、水面蒸发以及复杂的水流奔涌现象。

---

## ✨ 核心特性

### 1. 🌊 GPU 浅水流体力学模拟 (GPGPU Hydrodynamics)
* **Saint-Venant 浅水方程解算**：基于浅水连续性方程在 GPU 中解算水面高度与二维动量矢量 $\mathbf{w}_{yz}$。
* **物理水面平衡 (Height Difference Exchange)**：沿 X/Y 轴双向解算高差与重力交换，实现精准的水面平衡。
* **128×128 矢量流速场 (Flow Velocity Drift)**：通过 128×128 专用 FBO 离屏解算全地图矢量流速 $\text{vel} = \frac{\mathbf{w}_{yz} \cdot 0.001}{w_x \cdot 0.1 + 0.001}$。**狭窄峡谷中水流迅猛疾驰，宽阔湖泊中水面平缓沉静**。
* **8 方向邻域平滑法线**：使用 8 方向邻域叉积均值生成连续柔和的水面折射法线，无锯齿过渡。

### 2. ⚡ 高真实度水体与白浪渲染 (Foam & Fluid Rendering)
* **流速驱动白浪与水花 (Foam & Froth)**：水流在坡度大或狭窄渠道处快速奔流时，基于流速因子 $\text{speed\_factor}$ 自动翻滚纯白浪花与水泡。
* **物理吸光与水色渐变**：实现从浅水区亮青色（Turbulent Blue）到深水区暗蓝色（Deep Ocean Blue）的自然指数吸光渐变（$Kr$ 因子）。
* **高光与球谐光照 (SH Lighting & Specular)**：结合太阳高光反射与球谐光照（Spherical Harmonics），呈现明亮动感的水面。

### 3. 🎯 高海拔 3D 拾取与精确定位 (3D Raymarching Elevation Pick)
* **GPU 3D 光线步进求交 (Raymarching + Binary Search)**：使用 45 步 GLSL Raymarching 配合 5 步二分法搜索，解决倾斜视角下倾斜山体（$y > 0$）与鼠标射线的精确 3D 表面交点。
* **选框与雕刻 100% 重合**：消除传统平地 $y = 0$ 假设带来的位移错位，绿色笔刷光圈与实际雕刻变形成型点绝对同步。

### 4. 🌧️ 降雨与天气系统 (Weather & Rain System)
* **3D 动态雨滴粒子系统**：在场景空中构建 10,000 个 3D 动态雨滴粒子（`RainParticles`），随雨量实时调节渲染密度与下落速度。
* **降雨强度 (Rainfall Intensity)**：GUI 支持 `0 ~ 100` 雨量连续调节，大雨时全地形洼地快速积水汇聚成河。
* **降雨与落速控制**：可随时开启/关闭降雨或调整雨滴下落速度。

### 5. 🛠️ 水文与泥沙物理调控 (Hydrology & Erosion Physics)
* **水流速度 / 倍率 (`0.1 ~ 5.0x`)**：同步缩放 GPU 浅水物理动量传递加速度与水面细观波纹漂移速率，轻松切换缓流与极速奔流。
* **蒸发量 / 速率 (`0.0 ~ 10.0`)**：支持开启/关闭蒸发，并调节太阳暴晒干涸速率。
* **侵蚀量 / 强度 (`0.0 ~ 10.0`)**：支持开启/关闭泥沙侵蚀，调高后急流可切蚀山体形成深谷。

### 6. 🎨 雕刻工具与双风格网格 (Sculpting & Dual Mesh Style)
* **雕刻工具开关 (Enable Sculpting)**：提供 GUI 总开关；开启时按住**鼠标左键拖拽**或**空格键**即可直接增减岩石、土壤或水体。
* **笔刷光圈隐显**：关闭雕刻工具时，自动隐藏绿色笔刷光圈 overlay；拖拽雕刻时自动暂停 OrbitControls 视角旋转。
* **双视觉网格风格**：
  * **HexGrid (六边形柱体)**：蜂窝状六角柱体渲染风格。
  * **SmoothGrid (平滑地形)**：连续平滑连续三维地形。

---

## 🛠️ 技术栈

* **核心渲染**: [Three.js (r185+)](https://threejs.org/)
* **构建工具**: [Vite 6.x](https://vitejs.dev/)
* **包管理器**: [pnpm](https://pnpm.io/)
* **着色器语言**: GLSL (WebGL 2.0 / WebGL 1.0 + `OES_texture_float`)
* **控制面板**: [lil-gui](https://lil-gui.georgealways.com/)

---

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/feng62/craftscape-threejs.git
cd craftscape-threejs
```

### 2. 安装依赖
```bash
pnpm install
```

### 3. 启动开发服务器
```bash
pnpm dev
```
在浏览器中打开 `http://localhost:5173` 即可开始体验！

### 4. 构建生产版本
```bash
pnpm build
```

---

## 🎮 操作指南

| 操作 | 响应 |
| :--- | :--- |
| **鼠标左键拖拽 / 空格键** | 雕刻地形（增加/减少 岩石、土壤或水体） |
| **鼠标右键拖拽 / 拖拽 (雕刻关闭时)** | 旋转场景视角 (OrbitControls) |
| **鼠标滚轮** | 缩放视角远近 |
| **GUI 笔刷半径** | 调节雕刻作用圈大小 |
| **GUI 降雨强度 / 雨量** | 控制全图降雨速率与雨滴粒子密度 |
| **GUI 水流速度** | 控制水流物理动量加速度与波纹漂移速率 |
| **GUI 蒸发量 / 侵蚀量** | 调控水面蒸发快慢与急流切蚀山体强度 |

---

## 🏛️ 项目结构

```text
craftscape-threejs/
├── public/                  # 静态资源 (草地/岩石纹理贴图)
├── src/
│   ├── controls/            # 键盘与鼠标雕刻控制器 (SculptController.js)
│   ├── effects/             # 3D 雨滴粒子系统 (RainParticles.js)
│   ├── geometries/          # 六边形网格与平滑网格生成器 (HexGridGeometry, GridGeometry)
│   ├── shaders/             # 着色器材质库
│   │   ├── DisplayShader.js         # 山体地形物理渲染材质
│   │   ├── WaterDisplayShader.js    # 水体白浪与水花物理材质
│   │   ├── GodShader.js             # 3D Raymarching 雕刻 Pass
│   │   ├── ErrodeShader.js          # 水文侵蚀 Pass
│   │   ├── DiffuseSoilShader.js     # 土壤重力扩散 Pass
│   │   ├── NormalShader.js          # 地形法线与环境光遮蔽 (AO) Pass
│   │   └── WaterShaders.js          # 浅水物理平衡、动量、循环与流速 Pass
│   ├── simulation/          # GPGPU 运算管线
│   │   ├── GPGPUProcessor.js        # WebGLRenderTarget 双缓冲区封装
│   │   ├── TerrainSim.js            # 地形物理解算器
│   │   └── WaterSim.js              # 水体 5-Pass 物理解算器
│   ├── style.css            # 应用全局与 GUI 响应式样式
│   └── main.js              # 入口文件 (场景、渲染循环与 GUI 配置)
├── index.html
├── package.json
└── vite.config.js
```

---

## 🙏 致谢与参考

* 感谢 **Florian Boesch** 原作者创作的 [craftscape](https://github.com/pyalot/craftscape) WebGL 经典项目。
* 本项目在此基础上全面使用现代 **Three.js + Vite** 重构，并修复了高程拾取偏差、流速截断 Bug，扩展了天气与物理控制系统。

---

## 📄 开源协议

本项目基于 [AGPL-3.0 License](LICENSE) 协议开源。
