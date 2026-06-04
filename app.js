const STORAGE_KEY = "simuladorRobotPerfumeriaConfigV1";
const HALF_LAYERS_PER_PALLET = 12;

const LANES = [1, 2, 3, 4];
const SCENARIO = {
  id: "PERFUMERIA",
  boxesPerHalfLayer: 2,
  boxesPerPallet: 24
};

const HALF_LAYER_HEIGHT = 0.18;
const HALF_LAYER_FRONT_Z = -0.48;
const HALF_LAYER_BACK_Z = 0.48;
const HALF_LAYER_FRONT_COLOR = 0x2f7ed8;
const HALF_LAYER_BACK_COLOR = 0xe07a1f;

const DEFAULT_CONFIG = {
  simulationMinutes: 60,
  pickDropSeconds: [10, 10, 10, 10],
  palletChangeSeconds: [18, 18, 18, 18],
  boxArrivalSeconds: [2, 2, 2, 2],
  transitionSeconds: [
    [0, 4, 6, 7],
    [4, 0, 4, 6],
    [6, 4, 0, 4],
    [7, 6, 4, 0]
  ]
};

const pickDropGrid = document.getElementById("pickDropGrid");
const palletChangeGrid = document.getElementById("palletChangeGrid");
const arrivalGrid = document.getElementById("arrivalGrid");
const transitionMatrix = document.getElementById("transitionMatrix");
const configForm = document.getElementById("configForm");
const persistState = document.getElementById("persistState");
const resultsContainer = document.getElementById("results");
const rerunBtn = document.getElementById("rerunBtn");
const resetBtn = document.getElementById("resetBtn");

const playerAlgorithm = document.getElementById("playerAlgorithm");
const playerSpeed = document.getElementById("playerSpeed");
const playerPlayBtn = document.getElementById("playerPlayBtn");
const playerPauseBtn = document.getElementById("playerPauseBtn");
const playerResetBtn = document.getElementById("playerResetBtn");
const playerTimeline = document.getElementById("playerTimeline");
const playerTimeLabel = document.getElementById("playerTimeLabel");
const playerStatus = document.getElementById("playerStatus");
const viewer3d = document.getElementById("viewer3d");

const simulationsByMode = {
  "2vias": null,
  "4vias": null
};

const playback = {
  mode: "2vias",
  speed: Number(playerSpeed.value),
  isPlaying: false,
  simTime: 0,
  duration: 1,
  lastFrameMs: 0
};

const viewer = {
  enabled: false,
  renderer: null,
  scene: null,
  camera: null,
  robot: null,
  laneVisuals: [],
  lanePositions: [],
  feederPosition: { x: 0, y: 0, z: -2.2 },
  width: 0,
  height: 0
};

bootstrap();

function bootstrap() {
  renderDynamicInputs();
  loadConfigToForm(readStoredConfig());
  updatePersistenceState();
  init3DViewer();
  rerunSimulation();

  configForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const config = getConfigFromForm();
    if (!config) {
      return;
    }
    saveConfig(config);
    updatePersistenceState("Configuracion guardada en este navegador");
    runAndRender(config);
  });

  rerunBtn.addEventListener("click", () => {
    rerunSimulation();
  });

  resetBtn.addEventListener("click", () => {
    const config = structuredClone(DEFAULT_CONFIG);
    loadConfigToForm(config);
    saveConfig(config);
    updatePersistenceState("Configuracion restablecida y guardada");
    runAndRender(config);
  });

  configForm.addEventListener("input", () => {
    const config = getConfigFromForm(true);
    if (!config) {
      updatePersistenceState("Hay valores pendientes de corregir");
      return;
    }
    saveConfig(config);
    updatePersistenceState("Cambios guardados automaticamente");
  });

  playerAlgorithm.addEventListener("change", () => {
    playback.mode = playerAlgorithm.value;
    playback.isPlaying = false;
    syncPlaybackMode(false);
  });

  playerSpeed.addEventListener("change", () => {
    playback.speed = Number(playerSpeed.value);
  });

  playerPlayBtn.addEventListener("click", () => {
    if (!simulationsByMode[playback.mode]) {
      return;
    }
    playback.isPlaying = true;
    playerStatus.textContent = "Reproduciendo";
  });

  playerPauseBtn.addEventListener("click", () => {
    playback.isPlaying = false;
    playerStatus.textContent = "Pausado";
  });

  playerResetBtn.addEventListener("click", () => {
    playback.isPlaying = false;
    playback.simTime = 0;
    playerStatus.textContent = "Reinicio";
    syncTimelineUI();
  });

  playerTimeline.addEventListener("input", () => {
    playback.isPlaying = false;
    playback.simTime = Number(playerTimeline.value);
    playerStatus.textContent = "Manual";
    syncTimelineUI();
  });

  window.addEventListener("resize", resizeViewer);
}

function rerunSimulation() {
  const config = getConfigFromForm(true) || readStoredConfig();
  runAndRender(config);
}

function renderDynamicInputs() {
  LANES.forEach((lane, i) => {
    pickDropGrid.appendChild(makeLabeledNumberInput(`Via ${lane}`, `pickDrop-${i}`, DEFAULT_CONFIG.pickDropSeconds[i], 0.1));
    palletChangeGrid.appendChild(makeLabeledNumberInput(`Via ${lane}`, `palletChange-${i}`, DEFAULT_CONFIG.palletChangeSeconds[i], 0.1));
    arrivalGrid.appendChild(makeLabeledNumberInput(`Via ${lane}`, `arrival-${i}`, DEFAULT_CONFIG.boxArrivalSeconds[i], 0.1));
  });

  const table = document.createElement("table");
  table.className = "matrix";

  const headRow = document.createElement("tr");
  headRow.appendChild(document.createElement("th"));
  LANES.forEach((lane) => {
    const th = document.createElement("th");
    th.textContent = `A via ${lane}`;
    headRow.appendChild(th);
  });
  const thead = document.createElement("thead");
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  LANES.forEach((fromLane, fromIndex) => {
    const row = document.createElement("tr");
    const rowTitle = document.createElement("th");
    rowTitle.textContent = `Desde via ${fromLane}`;
    row.appendChild(rowTitle);

    LANES.forEach((_, toIndex) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = "number";
      input.step = "0.1";
      input.min = "0";
      input.value = String(DEFAULT_CONFIG.transitionSeconds[fromIndex][toIndex]);
      input.name = `transition-${fromIndex}-${toIndex}`;
      if (fromIndex === toIndex) {
        input.disabled = true;
      }
      td.appendChild(input);
      row.appendChild(td);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  transitionMatrix.appendChild(table);
}

function makeLabeledNumberInput(labelText, name, value, step) {
  const label = document.createElement("label");
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "number";
  input.name = name;
  input.step = String(step);
  input.min = "0";
  input.value = String(value);

  label.appendChild(input);
  return label;
}

function loadConfigToForm(config) {
  configForm.elements.simulationMinutes.value = config.simulationMinutes;

  config.pickDropSeconds.forEach((value, i) => {
    configForm.elements[`pickDrop-${i}`].value = value;
  });

  config.palletChangeSeconds.forEach((value, i) => {
    configForm.elements[`palletChange-${i}`].value = value;
  });

  config.boxArrivalSeconds.forEach((value, i) => {
    configForm.elements[`arrival-${i}`].value = value;
  });

  config.transitionSeconds.forEach((row, r) => {
    row.forEach((value, c) => {
      const element = configForm.elements[`transition-${r}-${c}`];
      if (element) {
        element.value = value;
      }
    });
  });
}

function getConfigFromForm(quiet = false) {
  const simulationMinutes = Number(configForm.elements.simulationMinutes.value);
  const pickDropSeconds = LANES.map((_, i) => Number(configForm.elements[`pickDrop-${i}`].value));
  const palletChangeSeconds = LANES.map((_, i) => Number(configForm.elements[`palletChange-${i}`].value));
  const boxArrivalSeconds = LANES.map((_, i) => Number(configForm.elements[`arrival-${i}`].value));

  const transitionSeconds = LANES.map((_, r) => {
    return LANES.map((_, c) => {
      if (r === c) {
        return 0;
      }
      return Number(configForm.elements[`transition-${r}-${c}`].value);
    });
  });

  const allValues = [simulationMinutes, ...pickDropSeconds, ...palletChangeSeconds, ...boxArrivalSeconds, ...transitionSeconds.flat()];
  const invalid = allValues.some((value) => Number.isNaN(value) || value < 0);

  if (simulationMinutes <= 0) {
    if (!quiet) {
      alert("El periodo de simulacion debe ser mayor que 0 minutos.");
    }
    return null;
  }

  if (invalid) {
    if (!quiet) {
      alert("Todos los tiempos deben ser numeros validos mayores o iguales a 0.");
    }
    return null;
  }

  return {
    simulationMinutes,
    pickDropSeconds,
    palletChangeSeconds,
    boxArrivalSeconds,
    transitionSeconds
  };
}

function updatePersistenceState(message = "Se guarda en este navegador") {
  Array.from(configForm.querySelectorAll("input")).forEach((input) => {
    if (input.name.includes("transition-")) {
      const [, fromIndex, toIndex] = input.name.split("-");
      input.disabled = fromIndex === toIndex;
    }
  });

  persistState.textContent = message;
}

function saveConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function readStoredConfig() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return structuredClone(DEFAULT_CONFIG);
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      simulationMinutes: parsed.simulationMinutes ?? DEFAULT_CONFIG.simulationMinutes,
      pickDropSeconds: parsed.pickDropSeconds ?? DEFAULT_CONFIG.pickDropSeconds,
      palletChangeSeconds: parsed.palletChangeSeconds ?? DEFAULT_CONFIG.palletChangeSeconds,
      boxArrivalSeconds: parsed.boxArrivalSeconds ?? DEFAULT_CONFIG.boxArrivalSeconds,
      transitionSeconds: parsed.transitionSeconds ?? DEFAULT_CONFIG.transitionSeconds
    };
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

function runAndRender(config) {
  const strictTwo = simulate("2vias", config);
  const fourWays = simulate("4vias", config);

  simulationsByMode["2vias"] = strictTwo;
  simulationsByMode["4vias"] = fourWays;

  renderResults(strictTwo, fourWays, config);
  syncPlaybackMode(true);
}

function createLaneState(index) {
  return {
    index,
    queueBoxes: 0,
    pendingArrivals: 0,
    nextArrivalAt: Infinity,
    palletHalfLayers: 0,
    completedPallets: 0,
    everCompleted: 0
  };
}

function requestNewPalletFlow(lane, now, config) {
  lane.pendingArrivals += SCENARIO.boxesPerPallet;
  lane.nextArrivalAt = Math.min(lane.nextArrivalAt, now + config.boxArrivalSeconds[lane.index]);
}

function processArrivalsUntil(lanes, time, config) {
  lanes.forEach((lane) => {
    if (lane.pendingArrivals <= 0 || lane.nextArrivalAt === Infinity) {
      return;
    }

    while (lane.pendingArrivals > 0 && lane.nextArrivalAt <= time && lane.queueBoxes < SCENARIO.boxesPerPallet) {
      lane.queueBoxes += 1;
      lane.pendingArrivals -= 1;
      lane.nextArrivalAt += config.boxArrivalSeconds[lane.index];
    }

    if (lane.pendingArrivals <= 0) {
      lane.nextArrivalAt = Infinity;
    }
  });
}

function findNextArrivalTime(lanes) {
  return lanes.reduce((minTime, lane) => Math.min(minTime, lane.nextArrivalAt), Infinity);
}

function simulate(mode, config) {
  const simDuration = config.simulationMinutes * 60;
  const lanes = LANES.map((_, i) => createLaneState(i));
  const events = [];

  lanes.forEach((lane) => requestNewPalletFlow(lane, 0, config));

  let t = 0;
  let currentLane = null;

  let activePair = 0;
  let pairTargetLaneIndex = 0;
  const pairDefinitions = [
    [0, 1],
    [2, 3]
  ];
  const pairBaseline = [
    [0, 0],
    [0, 0]
  ];

  while (t < simDuration) {
    processArrivalsUntil(lanes, t, config);

    const decision = mode === "2vias"
      ? decideStrictTwoLanes(lanes, pairDefinitions[activePair], pairTargetLaneIndex)
      : decideFourWays(lanes, currentLane);

    if (!decision.canExecute) {
      const nextArrival = findNextArrivalTime(lanes);
      if (!Number.isFinite(nextArrival) || nextArrival > simDuration) {
        break;
      }
      t = nextArrival;
      continue;
    }

    const laneIndex = decision.laneIndex;
    const lane = lanes[laneIndex];

    const transitionTime = currentLane !== null && currentLane !== laneIndex
      ? config.transitionSeconds[currentLane][laneIndex]
      : 0;
    const pickDropTime = config.pickDropSeconds[laneIndex];

    const moveStart = t;
    const pickStart = moveStart + transitionTime;
    const pickEnd = pickStart + pickDropTime;

    if (pickEnd > simDuration) {
      break;
    }

    if (transitionTime > 0) {
      events.push({
        type: "move",
        fromLane: currentLane,
        toLane: laneIndex,
        start: moveStart,
        end: pickStart
      });
    }

    const pickEvent = {
      type: "pickdrop",
      lane: laneIndex,
      start: pickStart,
      end: pickEnd,
      completedPallet: false
    };
    events.push(pickEvent);

    t = pickEnd;
    processArrivalsUntil(lanes, t, config);

    lane.queueBoxes -= SCENARIO.boxesPerHalfLayer;
    lane.palletHalfLayers += 1;

    if (lane.palletHalfLayers * SCENARIO.boxesPerHalfLayer >= SCENARIO.boxesPerPallet) {
      lane.completedPallets += 1;
      lane.everCompleted += 1;
      lane.palletHalfLayers = 0;
      pickEvent.completedPallet = true;
      requestNewPalletFlow(lane, t, config);

      const changeEnd = t + config.palletChangeSeconds[laneIndex];
      if (changeEnd > simDuration) {
        break;
      }

      events.push({
        type: "palletChange",
        lane: laneIndex,
        start: t,
        end: changeEnd
      });

      t = changeEnd;
      processArrivalsUntil(lanes, t, config);
    }

    currentLane = laneIndex;

    if (mode === "2vias") {
      const pair = pairDefinitions[activePair];
      pairTargetLaneIndex = pairTargetLaneIndex === 0 ? 1 : 0;

      const firstLane = lanes[pair[0]];
      const secondLane = lanes[pair[1]];
      const base = pairBaseline[activePair];

      if (firstLane.everCompleted > base[0] && secondLane.everCompleted > base[1]) {
        activePair = activePair === 0 ? 1 : 0;
        pairTargetLaneIndex = 0;
        const newPair = pairDefinitions[activePair];
        pairBaseline[activePair] = [lanes[newPair[0]].everCompleted, lanes[newPair[1]].everCompleted];
      }
    }
  }

  const byLane = lanes.map((lane, i) => ({
    lane: i + 1,
    completedPallets: lane.completedPallets,
    queueBoxesLeft: lane.queueBoxes,
    halfLayersDoneCurrentPallet: lane.palletHalfLayers
  }));

  const totalPallets = byLane.reduce((sum, item) => sum + item.completedPallets, 0);

  return {
    mode,
    simulationMinutes: config.simulationMinutes,
    durationSeconds: simDuration,
    totalPallets,
    byLane,
    events
  };
}

function decideStrictTwoLanes(lanes, pair, targetPositionInPair) {
  const laneIndex = pair[targetPositionInPair];
  const lane = lanes[laneIndex];

  if (lane.queueBoxes >= SCENARIO.boxesPerHalfLayer) {
    return {
      canExecute: true,
      laneIndex
    };
  }

  return {
    canExecute: false
  };
}

function decideFourWays(lanes, currentLane) {
  let startIndex = 0;
  if (currentLane !== null) {
    startIndex = (currentLane + 1) % LANES.length;
  }

  for (let step = 0; step < LANES.length; step += 1) {
    const laneIndex = (startIndex + step) % LANES.length;
    if (lanes[laneIndex].queueBoxes >= SCENARIO.boxesPerHalfLayer) {
      return {
        canExecute: true,
        laneIndex
      };
    }
  }

  return {
    canExecute: false
  };
}

function renderResults(twoWaysResult, fourWaysResult, config) {
  const totalMax = Math.max(twoWaysResult.totalPallets, fourWaysResult.totalPallets, 1);
  const delta = fourWaysResult.totalPallets - twoWaysResult.totalPallets;

  const deltaClass = delta > 0 ? "delta-good" : delta < 0 ? "delta-bad" : "delta-neutral";
  const deltaText = delta > 0
    ? `4 VIAS produce ${delta} pales mas que 2 VIAS Estricto.`
    : delta < 0
      ? `2 VIAS Estricto produce ${Math.abs(delta)} pales mas que 4 VIAS.`
      : "Ambos algoritmos producen el mismo numero de pales.";

  resultsContainer.className = "";
  resultsContainer.innerHTML = `
    <div class="result-grid">
      <article class="result-card">
        <h3>2 VIAS Estricto</h3>
        <div class="metric"><span>Total pales</span><strong>${twoWaysResult.totalPallets}</strong></div>
        <div class="bar-wrap"><div class="bar bar-a" style="width: ${(twoWaysResult.totalPallets / totalMax) * 100}%"></div></div>
        ${renderLaneTable(twoWaysResult.byLane)}
      </article>

      <article class="result-card">
        <h3>4 VIAS</h3>
        <div class="metric"><span>Total pales</span><strong>${fourWaysResult.totalPallets}</strong></div>
        <div class="bar-wrap"><div class="bar bar-b" style="width: ${(fourWaysResult.totalPallets / totalMax) * 100}%"></div></div>
        ${renderLaneTable(fourWaysResult.byLane)}
      </article>
    </div>

    <div class="delta-box ${deltaClass}">
      <strong>Comparativa:</strong> ${deltaText}
      <div class="metric"><span>Periodo simulado</span><span>${config.simulationMinutes} min</span></div>
      <div class="metric"><span>Escenario</span><span>${SCENARIO.id} (24 bultos/pale)</span></div>
    </div>
  `;
}

function renderLaneTable(byLane) {
  const rows = byLane.map((item) => {
    return `
      <tr>
        <td>Via ${item.lane}</td>
        <td>${item.completedPallets}</td>
        <td>${item.queueBoxesLeft}</td>
        <td>${item.halfLayersDoneCurrentPallet}</td>
      </tr>
    `;
  }).join("");

  return `
    <table class="table" aria-label="Detalle por via">
      <thead>
        <tr>
          <th>Via</th>
          <th>Pales completos</th>
          <th>Bultos en FIFO</th>
          <th>Medias capas en curso</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function init3DViewer() {
  if (!window.THREE) {
    viewer3d.innerHTML = "<div class='viewer3d-fallback'>No se pudo cargar el motor 3D. Comprueba conexion a internet para cargar la libreria Three.js.</div>";
    playerStatus.textContent = "3D no disponible";
    return;
  }

  viewer.enabled = true;
  viewer.scene = new THREE.Scene();
  viewer.scene.background = new THREE.Color(0xf7f7f5);

  viewer.lanePositions = [
    new THREE.Vector3(-9, 0, 2),
    new THREE.Vector3(-3, 0, 2),
    new THREE.Vector3(3, 0, 2),
    new THREE.Vector3(9, 0, 2)
  ];

  viewer.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 300);
  viewer.camera.position.set(0, 9.2, 18.5);
  viewer.camera.lookAt(0, 1.7, 1.6);

  viewer.renderer = new THREE.WebGLRenderer({ antialias: true });
  viewer.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  viewer3d.innerHTML = "";
  viewer3d.appendChild(viewer.renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 0.76);
  const directional = new THREE.DirectionalLight(0xffffff, 0.72);
  directional.position.set(20, 19, 11);
  viewer.scene.add(ambient, directional);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 36),
    new THREE.MeshStandardMaterial({ color: 0xebeae6, roughness: 0.9, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  viewer.scene.add(floor);

  const feeder = new THREE.Mesh(
    new THREE.BoxGeometry(7.5, 0.8, 4.2),
    new THREE.MeshStandardMaterial({ color: 0xb5b3ab, roughness: 0.85 })
  );
  feeder.position.set(viewer.feederPosition.x, 0.4, viewer.feederPosition.z);
  viewer.scene.add(feeder);

  const laneLabelMat = new THREE.MeshStandardMaterial({ color: 0x2d2d2a, roughness: 0.9 });

  viewer.lanePositions.forEach((lanePos, laneIndex) => {
    const laneGroup = new THREE.Group();

    const laneBase = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.25, 2.8),
      new THREE.MeshStandardMaterial({ color: 0xccccca, roughness: 0.88 })
    );
    laneBase.position.y = 0.125;
    laneGroup.add(laneBase);

    const pallet = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.35, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x8d7155, roughness: 0.95 })
    );
    pallet.position.y = 0.36;
    laneGroup.add(pallet);

    const palletTopY = pallet.position.y + 0.35 / 2;
    const halfLayerMeshes = [];
    for (let halfLayerIndex = 0; halfLayerIndex < HALF_LAYERS_PER_PALLET; halfLayerIndex += 1) {
      const placement = describeHalfLayerPlacement(halfLayerIndex);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.75, HALF_LAYER_HEIGHT, 0.9),
        new THREE.MeshStandardMaterial({
          color: placement.side === "frontal" ? HALF_LAYER_FRONT_COLOR : HALF_LAYER_BACK_COLOR,
          roughness: 0.88,
          transparent: true,
          opacity: 1
        })
      );

      mesh.visible = false;
      mesh.position.set(
        0,
        palletTopY + HALF_LAYER_HEIGHT / 2 + placement.layerIndex * HALF_LAYER_HEIGHT,
        placement.side === "frontal" ? HALF_LAYER_FRONT_Z : HALF_LAYER_BACK_Z
      );

      laneGroup.add(mesh);
      halfLayerMeshes.push(mesh);
    }

    const changeRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.7, 0.06, 12, 40),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000 })
    );
    changeRing.rotation.x = Math.PI / 2;
    changeRing.position.y = 0.16;
    changeRing.visible = false;
    laneGroup.add(changeRing);

    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.08, 0.6),
      laneLabelMat
    );
    marker.position.set(0, 0.08, 2.1 + laneIndex * 0.02);
    laneGroup.add(marker);

    laneGroup.position.set(lanePos.x, 0, lanePos.z);
    viewer.scene.add(laneGroup);

    viewer.laneVisuals.push({
      halfLayerMeshes,
      changeRing
    });
  });

  viewer.robot = createRobotMesh();
  viewer.scene.add(viewer.robot);

  resizeViewer();
  playback.lastFrameMs = performance.now();
  requestAnimationFrame(update3DFrame);
}

function createRobotMesh() {
  const robotGroup = new THREE.Group();

  const whitePaint = new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.58, metalness: 0.2 });
  const whiteShade = new THREE.MeshStandardMaterial({ color: 0xe3e5e4, roughness: 0.62, metalness: 0.18 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.46, metalness: 0.5 });
  const blackMatt = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.72, metalness: 0.2 });

  const basePlate = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.25, 0.28, 28),
    darkMetal
  );
  basePlate.position.y = 0.14;
  robotGroup.add(basePlate);

  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 2.35, 1.35),
    whitePaint
  );
  pedestal.position.y = 1.32;
  robotGroup.add(pedestal);

  const topHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 0.46, 24),
    darkMetal
  );
  topHousing.position.y = 2.7;
  robotGroup.add(topHousing);

  const turretPivot = new THREE.Group();
  turretPivot.position.set(0, 2.82, 0);
  robotGroup.add(turretPivot);

  const shoulderJoint = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.62, 20),
    darkMetal
  );
  shoulderJoint.rotation.z = Math.PI / 2;
  turretPivot.add(shoulderJoint);

  const upperPivot = new THREE.Group();
  upperPivot.position.set(0.12, 0.1, 0);
  turretPivot.add(upperPivot);

  const upperArm = new THREE.Mesh(
    new THREE.BoxGeometry(3.9, 0.5, 0.62),
    whitePaint
  );
  upperArm.position.x = 1.95;
  upperPivot.add(upperArm);

  const elbowPivot = new THREE.Group();
  elbowPivot.position.set(3.9, 0, 0);
  upperPivot.add(elbowPivot);

  const elbowJoint = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.56, 20),
    darkMetal
  );
  elbowJoint.rotation.z = Math.PI / 2;
  elbowPivot.add(elbowJoint);

  const forearm = new THREE.Mesh(
    new THREE.BoxGeometry(2.9, 0.45, 0.56),
    whiteShade
  );
  forearm.position.x = 1.45;
  elbowPivot.add(forearm);

  const wristPivot = new THREE.Group();
  wristPivot.position.set(2.9, 0, 0);
  elbowPivot.add(wristPivot);

  const wristCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.4, 20),
    darkMetal
  );
  wristCore.rotation.z = Math.PI / 2;
  wristPivot.add(wristCore);

  const toolFrame = new THREE.Mesh(
    new THREE.BoxGeometry(1.25, 0.16, 1.1),
    blackMatt
  );
  toolFrame.position.set(0, -0.52, 0);
  wristPivot.add(toolFrame);

  const suctionBlock = new THREE.Mesh(
    new THREE.BoxGeometry(0.98, 0.28, 0.78),
    darkMetal
  );
  suctionBlock.position.set(0, -0.75, 0);
  wristPivot.add(suctionBlock);

  const bumperLeft = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.52, 0.12),
    darkMetal
  );
  bumperLeft.position.set(0.08, -0.66, 0.44);
  wristPivot.add(bumperLeft);

  const bumperRight = bumperLeft.clone();
  bumperRight.position.z = -0.44;
  wristPivot.add(bumperRight);

  const statusLed = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 14, 14),
    new THREE.MeshStandardMaterial({ color: 0x37e56b, emissive: 0x1cb347, emissiveIntensity: 0.55 })
  );
  statusLed.position.set(0.56, 0.4, 0.7);
  robotGroup.add(statusLed);

  robotGroup.userData.joints = {
    turretPivot,
    upperPivot,
    elbowPivot,
    wristPivot,
    toolFrame,
    baseToolY: toolFrame.position.y,
    upperLength: 3.9,
    forearmLength: 2.9,
    shoulderHeight: turretPivot.position.y,
    robotScale: 1.55,
    toolDrop: Math.abs(suctionBlock.position.y)
  };

  robotGroup.position.copy(viewer.feederPosition);
  robotGroup.position.y = 0;
  robotGroup.scale.set(1.55, 1.55, 1.55);
  return robotGroup;
}

function resizeViewer() {
  if (!viewer.enabled || !viewer.renderer || !viewer.camera) {
    return;
  }

  const width = viewer3d.clientWidth;
  const height = viewer3d.clientHeight;

  if (width === 0 || height === 0) {
    return;
  }

  if (width === viewer.width && height === viewer.height) {
    return;
  }

  viewer.width = width;
  viewer.height = height;

  viewer.camera.aspect = width / height;
  viewer.camera.updateProjectionMatrix();
  viewer.renderer.setSize(width, height);
}

function syncPlaybackMode(resetTime) {
  const sim = simulationsByMode[playback.mode];
  if (!sim) {
    return;
  }

  playback.duration = Math.max(0.1, sim.durationSeconds);

  if (resetTime) {
    playback.simTime = 0;
    playback.isPlaying = false;
    playerStatus.textContent = "Listo";
  } else {
    playback.simTime = clamp(playback.simTime, 0, playback.duration);
  }

  playerTimeline.max = String(playback.duration);
  playerTimeline.step = "0.1";
  syncTimelineUI();
}

function update3DFrame(now) {
  if (!viewer.enabled || !viewer.renderer || !viewer.scene || !viewer.camera) {
    return;
  }

  resizeViewer();

  const deltaSeconds = Math.max(0, (now - playback.lastFrameMs) / 1000);
  playback.lastFrameMs = now;

  const activeSim = simulationsByMode[playback.mode];

  if (activeSim && playback.isPlaying) {
    playback.simTime += deltaSeconds * playback.speed;
    if (playback.simTime >= playback.duration) {
      playback.simTime = playback.duration;
      playback.isPlaying = false;
      playerStatus.textContent = "Fin de reproduccion";
    }
  }

  if (activeSim) {
    const state = computeReplayState(activeSim, playback.simTime);
    applyReplayState(state);
    if (!playback.isPlaying) {
      playerStatus.textContent = state.actionLabel;
    }
  }

  syncTimelineUI();
  viewer.renderer.render(viewer.scene, viewer.camera);
  requestAnimationFrame(update3DFrame);
}

function computeReplayState(simulation, time) {
  const laneHalfLayers = [0, 0, 0, 0];
  const laneChanging = [false, false, false, false];
  const laneCompleted = [0, 0, 0, 0];

  let activeEvent = null;
  let lastLane = null;
  let activePick = null;

  for (const event of simulation.events) {
    if ((event.type === "pickdrop" || event.type === "palletChange") && event.end <= time) {
      lastLane = event.lane;
    }

    if (event.type === "pickdrop" && event.end <= time) {
      if (event.completedPallet) {
        laneCompleted[event.lane] += 1;
        laneHalfLayers[event.lane] = 0;
      } else {
        laneHalfLayers[event.lane] += 1;
      }
    }

    if (event.type === "palletChange" && event.start <= time && time < event.end) {
      laneChanging[event.lane] = true;
    }

    if (event.start <= time && time < event.end) {
      activeEvent = event;
    }
  }

  let robotTarget = {
    x: viewer.feederPosition.x,
    y: 0,
    z: viewer.feederPosition.z
  };
  let actionLabel = "Espera";

  if (activeEvent) {
    if (activeEvent.type === "move") {
      const from = viewer.lanePositions[activeEvent.fromLane];
      const to = viewer.lanePositions[activeEvent.toLane];
      const ratio = (time - activeEvent.start) / Math.max(0.001, activeEvent.end - activeEvent.start);
      robotTarget = {
        x: THREE.MathUtils.lerp(from.x, to.x, ratio),
        y: 0,
        z: THREE.MathUtils.lerp(from.z, to.z, ratio)
      };
      actionLabel = `Moviendo de via ${activeEvent.fromLane + 1} a via ${activeEvent.toLane + 1}`;
    }

    if (activeEvent.type === "pickdrop") {
      const lanePos = viewer.lanePositions[activeEvent.lane];
      const ratio = (time - activeEvent.start) / Math.max(0.001, activeEvent.end - activeEvent.start);
      const slotIndex = laneHalfLayers[activeEvent.lane];
      const placement = describeHalfLayerPlacement(slotIndex);
      robotTarget = {
        x: lanePos.x,
        y: Math.sin(ratio * Math.PI * 2) * 0.08,
        z: lanePos.z
      };
      activePick = {
        laneIndex: activeEvent.lane,
        slotIndex,
        pulseRatio: ratio
      };
      actionLabel = `Bajando ${placement.side} de capa ${placement.layerNumber} en via ${activeEvent.lane + 1}`;
    }

    if (activeEvent.type === "palletChange") {
      const lanePos = viewer.lanePositions[activeEvent.lane];
      robotTarget = {
        x: lanePos.x,
        y: 0,
        z: lanePos.z
      };
      actionLabel = `Cambio de pale en via ${activeEvent.lane + 1}`;
    }
  } else if (lastLane !== null) {
    const lanePos = viewer.lanePositions[lastLane];
    robotTarget = {
      x: lanePos.x,
      y: 0,
      z: lanePos.z
    };
  }

  return {
    laneHalfLayers,
    laneChanging,
    laneCompleted,
    robotTarget,
    actionLabel,
    activePick
  };
}

function applyReplayState(state) {
  viewer.robot.position.set(viewer.feederPosition.x, 0, viewer.feederPosition.z);

  const joints = viewer.robot.userData.joints;
  if (joints) {
    const worldTargetX = state.robotTarget.x;
    const worldTargetZ = state.robotTarget.z;
    const worldTargetY = state.activePick ? 1.05 : 1.5;

    const localX = worldTargetX - viewer.feederPosition.x;
    const localZ = worldTargetZ - viewer.feederPosition.z;
    joints.turretPivot.rotation.y = Math.atan2(-localZ, localX);

    const radialDistanceWorld = Math.hypot(localX, localZ);
    const shoulderWorldY = joints.shoulderHeight * joints.robotScale;
    const wristTargetWorldY = worldTargetY + joints.toolDrop * joints.robotScale;
    const radialDistance = radialDistanceWorld / joints.robotScale;
    const verticalDistance = (wristTargetWorldY - shoulderWorldY) / joints.robotScale;

    const l1 = joints.upperLength;
    const l2 = joints.forearmLength;
    const minReach = Math.abs(l1 - l2) + 0.01;
    const maxReach = l1 + l2 - 0.01;
    const targetDistance = clamp(Math.hypot(radialDistance, verticalDistance), minReach, maxReach);

    const elbowCos = clamp((radialDistance * radialDistance + verticalDistance * verticalDistance - l1 * l1 - l2 * l2) / (2 * l1 * l2), -1, 1);
    const elbowAngle = -Math.acos(elbowCos);
    const shoulderAngle = Math.atan2(verticalDistance, radialDistance)
      - Math.atan2(l2 * Math.sin(elbowAngle), l1 + l2 * Math.cos(elbowAngle));

    const pickPulse = state.activePick
      ? Math.sin(state.activePick.pulseRatio * Math.PI * 2)
      : -0.25;

    joints.upperPivot.rotation.z = shoulderAngle + pickPulse * 0.04;
    joints.elbowPivot.rotation.z = elbowAngle - pickPulse * 0.06;
    joints.wristPivot.rotation.z = -(joints.upperPivot.rotation.z + joints.elbowPivot.rotation.z) + pickPulse * 0.04;
    joints.toolFrame.position.y = joints.baseToolY - Math.abs(pickPulse) * 0.1;
  }

  viewer.laneVisuals.forEach((laneVisual, laneIndex) => {
    const placedHalfLayers = state.laneHalfLayers[laneIndex];
    laneVisual.halfLayerMeshes.forEach((mesh, index) => {
      const isPlaced = index < placedHalfLayers;
      mesh.visible = isPlaced;
      mesh.material.opacity = 1;
      mesh.material.emissive = new THREE.Color(0x000000);
    });

    if (state.activePick && state.activePick.laneIndex === laneIndex) {
      const pendingMesh = laneVisual.halfLayerMeshes[state.activePick.slotIndex];
      if (pendingMesh) {
        pendingMesh.visible = true;
        pendingMesh.material.opacity = 0.55 + Math.abs(Math.sin(state.activePick.pulseRatio * Math.PI * 4)) * 0.3;
        pendingMesh.material.emissive = new THREE.Color(0x111111);
      }
    }

    laneVisual.changeRing.visible = state.laneChanging[laneIndex];
    laneVisual.changeRing.material.emissive = new THREE.Color(state.laneChanging[laneIndex] ? 0x222222 : 0x000000);
  });
}

function describeHalfLayerPlacement(halfLayerIndex) {
  const boundedIndex = clamp(halfLayerIndex, 0, HALF_LAYERS_PER_PALLET - 1);
  const side = boundedIndex % 2 === 0 ? "frontal" : "posterior";
  const layerIndex = Math.floor(boundedIndex / 2);

  return {
    side,
    layerIndex,
    layerNumber: layerIndex + 1
  };
}

function syncTimelineUI() {
  playerTimeline.value = String(clamp(playback.simTime, 0, playback.duration));
  playerTimeLabel.textContent = `${formatTime(playback.simTime)} / ${formatTime(playback.duration)}`;
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)}`;
  }

  return `${pad2(minutes)}:${pad2(secs)}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
