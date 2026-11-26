export const SOIL_TYPE_PRESETS = [
  {
    id: 'loess',
    typeIndex: 0,
    name: '湿陷黄土',
    badge: '易沉降滑塌',
    desc: '结构疏松，无水时静止；过水浸润后产生不均匀湿陷沉降与坡脚滑塌'
  },
  {
    id: 'clay',
    typeIndex: 1,
    name: '黏性红壤',
    badge: '只切沟壑',
    desc: '土体黏聚力高、坡壁稳固不塌；被急流冲刷只向下切出清晰深邃的沟壑'
  },
  {
    id: 'gravel',
    typeIndex: 2,
    name: '砂砾冲积',
    badge: '抗沉降浅槽',
    desc: '粗粒透水抗塌抗沉降，山洪过境仅在表层冲出宽浅稳定的砾石河槽'
  },
  {
    id: 'composite',
    typeIndex: 3,
    name: '复合流域',
    badge: '分区差异响应',
    desc: '同流域自然分带：谷底粉砂沉降、山坡红壤切沟、高脊风化岩砾抗冲'
  }
];

export const LANDFORM_PRESETS = [
  {
    id: 'canyon',
    typeIndex: 0,
    name: '丘陵宽谷峡道',
    desc: '圆润山体夹持天然河谷，黏性坡壁耐塌陷、急流专注切沟',
    terrain: {
      landformType: 0,
      heightScale: 0.21,
      slopeTilt: 0.09,
      valleyDepth: 0.58,
      valleyWidth: 0.28,
      gullyDensity: 0.32,
      roughness: 0.34,
      seed: 101
    },
    geology: {
      soilType: 1, // clay
      soilHeterogeneity: 0.65,
      soilRatio: 0.58,
      soilDepth: 0.048,
      rockSlopeThreshold: 0.42,
      soilPatchiness: 0.45
    },
    defaultSources: [
      { name: '峡谷主源头', u: 0.50, v: 0.88, radius: 0.042, flowRate: 2.2, mode: 'continuous', sediment: 0.25 }
    ]
  },
  {
    id: 'dendritic',
    typeIndex: 1,
    name: '黄土树枝沟壑',
    desc: '黄土丘陵多支沟汇流，过水触发不均匀湿陷沉降与泥沙涌流',
    terrain: {
      landformType: 1,
      heightScale: 0.22,
      slopeTilt: 0.10,
      valleyDepth: 0.54,
      valleyWidth: 0.32,
      gullyDensity: 0.65,
      roughness: 0.38,
      seed: 204
    },
    geology: {
      soilType: 0, // loess
      soilHeterogeneity: 0.72,
      soilRatio: 0.78,
      soilDepth: 0.068,
      rockSlopeThreshold: 0.58,
      soilPatchiness: 0.50
    },
    defaultSources: [
      { name: '左支沟源头', u: 0.24, v: 0.85, radius: 0.036, flowRate: 1.5, mode: 'continuous', sediment: 0.35 },
      { name: '中支沟源头', u: 0.50, v: 0.90, radius: 0.038, flowRate: 1.7, mode: 'continuous', sediment: 0.35 },
      { name: '右支沟源头', u: 0.76, v: 0.84, radius: 0.036, flowRate: 1.5, mode: 'continuous', sediment: 0.35 }
    ]
  },
  {
    id: 'meander',
    typeIndex: 2,
    name: '蜿蜒河漫滩',
    desc: '宽缓S型河谷与阶地，谷底粉砂湿陷沉降、山坡红壤切沟',
    terrain: {
      landformType: 2,
      heightScale: 0.17,
      slopeTilt: 0.07,
      valleyDepth: 0.48,
      valleyWidth: 0.38,
      gullyDensity: 0.25,
      roughness: 0.30,
      seed: 318
    },
    geology: {
      soilType: 3, // composite
      soilHeterogeneity: 0.65,
      soilRatio: 0.72,
      soilDepth: 0.058,
      rockSlopeThreshold: 0.48,
      soilPatchiness: 0.42
    },
    defaultSources: [
      { name: '曲流上游口', u: 0.46, v: 0.90, radius: 0.045, flowRate: 2.3, mode: 'continuous', sediment: 0.30 }
    ]
  },
  {
    id: 'alluvial',
    typeIndex: 3,
    name: '出山口冲积扇',
    desc: '缓和山口接开阔扇状平原，砾石砂土抗沉降、冲出浅河槽',
    terrain: {
      landformType: 3,
      heightScale: 0.22,
      slopeTilt: 0.09,
      valleyDepth: 0.58,
      valleyWidth: 0.28,
      gullyDensity: 0.38,
      roughness: 0.32,
      seed: 409
    },
    geology: {
      soilType: 2, // gravel
      soilHeterogeneity: 0.60,
      soilRatio: 0.66,
      soilDepth: 0.052,
      rockSlopeThreshold: 0.44,
      soilPatchiness: 0.45
    },
    defaultSources: [
      { name: '峡口左源', u: 0.42, v: 0.89, radius: 0.038, flowRate: 1.8, mode: 'continuous', sediment: 0.28 },
      { name: '峡口右源', u: 0.58, v: 0.86, radius: 0.036, flowRate: 1.6, mode: 'continuous', sediment: 0.28 }
    ]
  },
  {
    id: 'dammed',
    typeIndex: 4,
    name: '梯级蓄水盆地',
    desc: '上游山谷汇入缓坡盆地，漫溢垭口后在复合土层切沟演进',
    terrain: {
      landformType: 4,
      heightScale: 0.20,
      slopeTilt: 0.08,
      valleyDepth: 0.55,
      valleyWidth: 0.34,
      gullyDensity: 0.34,
      roughness: 0.34,
      seed: 527
    },
    geology: {
      soilType: 3, // composite
      soilHeterogeneity: 0.68,
      soilRatio: 0.60,
      soilDepth: 0.050,
      rockSlopeThreshold: 0.44,
      soilPatchiness: 0.42
    },
    defaultSources: [
      { name: '盆地上游左支', u: 0.34, v: 0.88, radius: 0.040, flowRate: 1.9, mode: 'continuous', sediment: 0.28 },
      { name: '盆地上游右支', u: 0.66, v: 0.87, radius: 0.040, flowRate: 1.9, mode: 'pulse', sediment: 0.38 }
    ]
  },
  {
    id: 'ridges',
    typeIndex: 5,
    name: '连绵丘陵山系',
    desc: '典型卫星DEM中低山连绵起伏，黏性土坡面急流切沟清晰',
    terrain: {
      landformType: 5,
      heightScale: 0.19,
      slopeTilt: 0.08,
      valleyDepth: 0.42,
      valleyWidth: 0.40,
      gullyDensity: 0.45,
      roughness: 0.36,
      seed: 642
    },
    geology: {
      soilType: 1, // clay
      soilHeterogeneity: 0.65,
      soilRatio: 0.68,
      soilDepth: 0.050,
      rockSlopeThreshold: 0.48,
      soilPatchiness: 0.50
    },
    defaultSources: [
      { name: '西侧高坡源', u: 0.30, v: 0.86, radius: 0.040, flowRate: 1.6, mode: 'continuous', sediment: 0.28 },
      { name: '东侧高坡源', u: 0.70, v: 0.84, radius: 0.040, flowRate: 1.6, mode: 'continuous', sediment: 0.28 }
    ]
  }
];

export const GEOLOGY_PRESETS = [
  {
    id: 'rocky',
    name: '强岩硬谷地层',
    desc: '基岩裸露为主，仅谷底覆薄砂砾，极抗冲刷沉降',
    geology: {
      soilType: 2,
      soilRatio: 0.16,
      soilDepth: 0.025,
      rockSlopeThreshold: 0.26,
      soilPatchiness: 0.35,
      soilHeterogeneity: 0.55,
      rockHardness: 2.6,
      soilErodibility: 0.9,
      soilSlip: 0.4
    }
  },
  {
    id: 'clay_hills',
    name: '黏性红壤切沟地层',
    desc: '高黏聚红壤，遇水不塌不沉降，专注冲刷切出清晰沟壑',
    geology: {
      soilType: 1,
      soilRatio: 0.68,
      soilDepth: 0.054,
      rockSlopeThreshold: 0.48,
      soilPatchiness: 0.45,
      soilHeterogeneity: 0.65,
      rockHardness: 1.7,
      soilErodibility: 1.8,
      soilSlip: 0.9
    }
  },
  {
    id: 'loess',
    name: '湿陷黄土沟壑地层',
    desc: '深厚湿陷性黄土，干态静止、过水后显著不均匀沉降滑塌',
    geology: {
      soilType: 0,
      soilRatio: 0.88,
      soilDepth: 0.075,
      rockSlopeThreshold: 0.68,
      soilPatchiness: 0.45,
      soilHeterogeneity: 0.75,
      rockHardness: 1.1,
      soilErodibility: 2.2,
      soilSlip: 1.5
    }
  }
];
