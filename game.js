const GAME_JS_VERSION = "GAME_JS_MOLD_LIMIT_HEALTH_FINAL_20260716";

const explainPage = document.getElementById("explainPage");
const experimentPage = document.getElementById("experimentPage");

const showExplainBtn = document.getElementById("showExplainBtn");
const showExperimentBtn = document.getElementById("showExperimentBtn");
const goExperimentA = document.getElementById("goExperimentA");
const goExperimentB = document.getElementById("goExperimentB");
const goExplainFromExperiment = document.getElementById("goExplainFromExperiment");

const sceneCanvas = document.getElementById("sceneCanvas");
const scene = sceneCanvas.getContext("2d");

const graphCanvas = document.getElementById("graphCanvas");
const graph = graphCanvas.getContext("2d");

const mainMessage = document.getElementById("mainMessage");

const heatBtn = document.getElementById("heatBtn");
const rainBtn = document.getElementById("rainBtn");
const snowBtn = document.getElementById("snowBtn");
const quakeBtn = document.getElementById("quakeBtn");
const megaQuakeBtn = document.getElementById("megaQuakeBtn");
const stressBtn = document.getElementById("stressBtn");
const holdEnvBtn = document.getElementById("holdEnvBtn");
const experimentResetBtn = document.getElementById("experimentResetBtn");
const pauseBtn = document.getElementById("pauseBtn");

const tempGain = document.getElementById("tempGain");
const humGain = document.getElementById("humGain");
const vibGain = document.getElementById("vibGain");

const tempGainText = document.getElementById("tempGainText");
const humGainText = document.getElementById("humGainText");
const vibGainText = document.getElementById("vibGainText");

const normalTiltText = document.getElementById("normalTiltText");
const pidTiltText = document.getElementById("pidTiltText");
const normalPlantScore = document.getElementById("normalPlantScore");
const pidPlantScore = document.getElementById("pidPlantScore");
const tempPower = document.getElementById("tempPower");
const humPower = document.getElementById("humPower");
const vibPower = document.getElementById("vibPower");
const protectText = document.getElementById("protectText");

const envModeChip = document.getElementById("envModeChip");
const outsideTempChip = document.getElementById("outsideTempChip");
const outsideHumChip = document.getElementById("outsideHumChip");
const quakeChip = document.getElementById("quakeChip");

const allEnvButtons = [
  heatBtn,
  rainBtn,
  snowBtn,
  quakeBtn,
  megaQuakeBtn,
  stressBtn,
  holdEnvBtn
];

const targetTemp = 22;
const targetHum = 45;

let running = false;
let paused = false;
let lastTimestamp = 0;
let time = 0;

let envMode = "정상";
let envTempTarget = 22;
let envHumTarget = 45;

let outsideTemp = 22;
let outsideHum = 45;

let quake = 0;
let quakeTimer = 0;
let screenShake = 0;
let pidLimitReached = false;
let rainIntensity = 0;
let snowIntensity = 0;
let envModeElapsed = 0;
let lastEnvModeForTimer = "정상";
let maxHeatReached = 22;

let particles = [];
let eventTexts = [];

const normal = makeBuilding();
const pid = makeBuilding();

function makeBuilding() {
  return {
    temp: 22,
    hum: 45,
    angle: 0,
    angularVelocity: 0,
    plantHealth: 100,
    plantMood: "healthy",
    envState: "normal",
    tempIntegral: 0,
    humIntegral: 0,
    vibIntegral: 0,
    prevTempError: 0,
    prevHumError: 0,
    prevVibError: 0,
    tempOutput: 0,
    humOutput: 0,
    vibOutput: 0,
    tempHistory: [22],
    humHistory: [45],
    vibHistory: [0],
    plantHistory: [100]
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safe(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function showPage(pageName) {
  explainPage.classList.remove("active");
  experimentPage.classList.remove("active");

  if (pageName === "explain") {
    explainPage.classList.add("active");
    window.scrollTo(0, 0);
    return;
  }

  experimentPage.classList.add("active");
  window.scrollTo(0, 0);

  requestAnimationFrame(() => {
    resizeCanvases();
    drawScene();
    drawGraphs();
    updateDomVisualLayer();
    updateDomVisualLayer();
  });
}

showExplainBtn.addEventListener("click", () => showPage("explain"));
showExperimentBtn.addEventListener("click", () => showPage("experiment"));
goExperimentA.addEventListener("click", () => showPage("experiment"));
goExperimentB.addEventListener("click", () => showPage("experiment"));
goExplainFromExperiment.addEventListener("click", () => showPage("explain"));

function resizeCanvases() {
  const sceneRect = sceneCanvas.getBoundingClientRect();
  const graphRect = graphCanvas.getBoundingClientRect();

  sceneCanvas.width = Math.max(2, Math.floor(sceneRect.width));
  sceneCanvas.height = Math.max(2, Math.floor(sceneRect.height));

  graphCanvas.width = Math.max(2, Math.floor(graphRect.width));
  graphCanvas.height = Math.max(2, Math.floor(graphRect.height));
}

window.addEventListener("resize", () => {
  resizeCanvases();
  drawScene();
  drawGraphs();
  updateDomVisualLayer();
  updateDomVisualLayer();
});

function resetBuilding(building) {
  building.temp = 22;
  building.hum = 45;
  building.angle = 0;
  building.angularVelocity = 0;
  building.plantHealth = 100;
  building.plantMood = "healthy";
  building.envState = "normal";
  building.tempIntegral = 0;
  building.humIntegral = 0;
  building.vibIntegral = 0;
  building.prevTempError = 0;
  building.prevHumError = 0;
  building.prevVibError = 0;
  building.tempOutput = 0;
  building.humOutput = 0;
  building.vibOutput = 0;
  building.tempHistory = [22];
  building.humHistory = [45];
  building.vibHistory = [0];
  building.plantHistory = [100];
}

function resetSimulation() {
  running = false;
  paused = false;
  time = 0;

  envMode = "정상";
  envTempTarget = 22;
  envHumTarget = 45;

  outsideTemp = 22;
  outsideHum = 45;

  quake = 0;
  quakeTimer = 0;
  screenShake = 0;
  envModeElapsed = 0;
  lastEnvModeForTimer = "정상";
  maxHeatReached = 22;
  pidLimitReached = false;
  rainIntensity = 0;
  snowIntensity = 0;

  particles = [];
  eventTexts = [];

  resetBuilding(normal);
  resetBuilding(pid);

  pauseBtn.textContent = "일시 정지";
  mainMessage.textContent = "환경 버튼을 누르면 바로 실험이 시작됩니다";

  setActiveButton(null);
  updateLabels();
  updateStats();
  resizeCanvases();
  drawScene();
  drawGraphs();
  updateDomVisualLayer();
  updateDomVisualLayer();
}

function setActiveButton(button) {
  allEnvButtons.forEach(item => {
    if (item) {
      item.classList.remove("active-env");
    }
  });

  if (button) {
    button.classList.add("active-env");
  }
}

function updateLabels() {
  tempGainText.textContent = Number(tempGain.value).toFixed(2);
  humGainText.textContent = Number(humGain.value).toFixed(2);
  vibGainText.textContent = Number(vibGain.value).toFixed(2);
}

[tempGain, humGain, vibGain].forEach(input => {
  input.addEventListener("input", updateLabels);
});

function ensureRunning() {
  showPage("experiment");
  running = true;
  paused = false;
  pauseBtn.textContent = "일시 정지";

  requestAnimationFrame(() => {
    resizeCanvases();
    drawScene();
    drawGraphs();
    updateDomVisualLayer();
    updateDomVisualLayer();
  });
}

heatBtn.addEventListener("click", () => {
  setActiveButton(heatBtn);
  setEnvironment(
    "폭염 Heatwave",
    46,
    26,
    "폭염 지속: 높은 외부 온도가 계속 유지됩니다.",
    "#fb923c",
    "heat"
  );
});

rainBtn.addEventListener("click", () => {
  setActiveButton(rainBtn);
  setEnvironment(
    "폭우 Heavy Rain",
    29,
    98,
    "폭우 지속: 높은 습도가 계속 유지됩니다.",
    "#22d3ee",
    "rain"
  );
});

snowBtn.addEventListener("click", () => {
  setActiveButton(snowBtn);
  setEnvironment(
    "폭설 Heavy Snow",
    -12,
    82,
    "폭설 지속: 낮은 외부 온도가 계속 유지됩니다.",
    "#93c5fd",
    "snow"
  );
});

quakeBtn.addEventListener("click", () => {
  setActiveButton(quakeBtn);
  triggerQuake(1.0);
});

megaQuakeBtn.addEventListener("click", () => {
  setActiveButton(megaQuakeBtn);
  triggerQuake(1.65);
});

stressBtn.addEventListener("click", () => {
  setActiveButton(stressBtn);
  setEnvironment(
    "복합 재난 Disaster",
    46,
    98,
    "복합 재난 지속: 폭염 + 폭우 + 강진이 유지됩니다.",
    "#facc15",
    "stress"
  );
  triggerQuake(1.45);
});

holdEnvBtn.addEventListener("click", () => {
  setActiveButton(holdEnvBtn);
  envMode = "환경 일시 정지 Hold";
  envTempTarget = outsideTemp;
  envHumTarget = outsideHum;
  quake = 0;
  quakeTimer = 0;
  screenShake = 0;
  mainMessage.textContent = "모든 환경이 일시 정지되었습니다. 현재 외부 온도/습도가 유지됩니다.";
  addEventText("환경 일시 정지", "#60a5fa");
  ensureRunning();
});

experimentResetBtn.addEventListener("click", () => {
  resetSimulation();
  showPage("experiment");
});

pauseBtn.addEventListener("click", () => {
  paused = !paused;
  running = true;
  pauseBtn.textContent = paused ? "계속하기" : "일시 정지";
  mainMessage.textContent = paused ? "일시 정지" : "실험 진행 중";
});

function setEnvironment(name, temp, hum, message, color, particleType) {
  envMode = name;
  envModeElapsed = 0;
  lastEnvModeForTimer = name;
  maxHeatReached = outsideTemp;
  envTempTarget = temp;
  envHumTarget = hum;
  mainMessage.textContent = message;
  ensureRunning();

  resizeCanvases();
  addEventText(message, color);
  addWeatherParticles(particleType, 130);

  drawScene();
  drawGraphs();
  updateDomVisualLayer();
  updateDomVisualLayer();
}

function triggerQuake(power) {
  envMode = power > 1.2 ? "강진 Strong Quake" : "지진 Earthquake";
  envModeElapsed = 0;
  lastEnvModeForTimer = envMode;
  ensureRunning();

  quake = power;
  quakeTimer = 11;
  screenShake = 18 * power;

  const dir = Math.random() > 0.5 ? 1 : -1;

  normal.angle += dir * 0.24 * power;
  normal.angularVelocity += dir * 2.85 * power;

  pid.angle += dir * 0.08 * power;
  pid.angularVelocity += dir * 1.20 * power;

  mainMessage.textContent = "지진 상황: 일반 건물과 PID 건물의 기울기 차이를 보세요";

  resizeCanvases();
  addEventText(power > 1.2 ? "강진 발생" : "지진 발생", "#f87171");
  addWeatherParticles("quake", 130);

  drawScene();
  drawGraphs();
  updateDomVisualLayer();
  updateDomVisualLayer();
}

function addEventText(text, color) {
  eventTexts.push({
    text,
    color,
    x: sceneCanvas.width / 2,
    y: sceneCanvas.height * 0.18,
    life: 1.8,
    vy: -26
  });
}

function addWeatherParticles(type, count = 80) {
  const w = Math.max(2, sceneCanvas.width);
  const h = Math.max(2, sceneCanvas.height);

  for (let i = 0; i < count; i++) {
    particles.push({
      type,
      x: Math.random() * w,
      y: Math.random() * h * 0.70,
      vx: (Math.random() - 0.5) * 120,
      vy: 45 + Math.random() * 110,
      life: 3.8 + Math.random() * 2.6,
      size: 4 + Math.random() * 9
    });
  }
}

function updateSimulation(dt) {
  if (!running || paused) {
    return;
  }

  time += dt;

  if (envMode !== lastEnvModeForTimer) {
    envModeElapsed = 0;
    lastEnvModeForTimer = envMode;
    maxHeatReached = outsideTemp;
  }

  envModeElapsed += dt;

  let effectiveTempTarget = envTempTarget;
  let effectiveHumTarget = envHumTarget;
  let tempSpeed = 1.05;
  let humSpeed = 0.95;

  if (envMode.includes("폭염")) {
    // 핵심 수정:
    // 폭염은 특정 온도에서 내려오지 않고, 시간이 지날수록 점점 더 올라간다.
    // 이를 통해 PID 제어가 어느 순간부터 버거워지는지 실험할 수 있다.
    effectiveTempTarget = 46 + envModeElapsed * 2.4;
    effectiveTempTarget = Math.min(effectiveTempTarget, 120);
    tempSpeed = 1.35 + Math.min(4.20, envModeElapsed * 0.10);
  }

  if (envMode.includes("폭우")) {
    // 폭우도 시간이 지날수록 빗줄기 속도와 습도 상승 속도가 강해진다.
    rainIntensity = Math.min(1, envModeElapsed / 24);
    effectiveHumTarget = Math.min(100, 90 + envModeElapsed * 1.15);
    humSpeed = 1.45 + Math.min(4.40, envModeElapsed * 0.13);
  } else {
    rainIntensity = Math.max(0, rainIntensity - dt * 0.35);
  }

  if (envMode.includes("폭설")) {
    // 폭설도 시간이 지날수록 눈의 속도와 냉각 속도가 강해진다.
    snowIntensity = Math.min(1, envModeElapsed / 24);
    effectiveTempTarget = -12 - Math.min(34, envModeElapsed * 1.35);
    tempSpeed = 1.35 + Math.min(4.20, envModeElapsed * 0.12);
    effectiveHumTarget = Math.min(98, 78 + envModeElapsed * 0.65);
    humSpeed = Math.max(humSpeed, 1.10 + Math.min(2.60, envModeElapsed * 0.07));
  } else {
    snowIntensity = Math.max(0, snowIntensity - dt * 0.35);
  }

  if (envMode.includes("복합")) {
    effectiveTempTarget = Math.min(120, 46 + envModeElapsed * 2.1);
    effectiveHumTarget = Math.min(100, 94 + envModeElapsed * 0.55);
    tempSpeed = 1.50 + Math.min(4.00, envModeElapsed * 0.10);
    humSpeed = 1.35 + Math.min(3.00, envModeElapsed * 0.08);
  }

  const nextOutsideTemp = outsideTemp + (effectiveTempTarget - outsideTemp) * dt * tempSpeed;
  const nextOutsideHum = outsideHum + (effectiveHumTarget - outsideHum) * dt * humSpeed;

  if (envMode.includes("폭염") || envMode.includes("복합")) {
    // 폭염/복합 재난에서는 외부 온도가 다시 내려가지 않도록 단조 증가 보정
    maxHeatReached = Math.max(maxHeatReached, nextOutsideTemp);
    outsideTemp = maxHeatReached;
  } else {
    outsideTemp = nextOutsideTemp;
  }

  outsideHum = nextOutsideHum;

  if (quakeTimer > 0) {
    quakeTimer -= dt;
    quake = Math.max(0, quakeTimer / 8.2);
  } else {
    quake += (0 - quake) * dt * 0.55;
  }

  updateNormalBuilding(dt);
  updatePidBuilding(dt);
  updatePlantHealth(normal, dt, false);
  updatePlantHealth(pid, dt, true);
  updateParticles(dt);
  updateStats();

  screenShake *= Math.pow(0.88, dt * 60);

  if (screenShake < 0.2) {
    screenShake = 0;
  }

  addContinuousEnvironmentParticles();
}

function addContinuousEnvironmentParticles() {
  if (!running || paused) {
    return;
  }

  if (Math.random() > 0.45) {
    return;
  }

  if (envMode.includes("폭염")) {
    addWeatherParticles("heat", 3);
  }

  if (envMode.includes("폭우")) {
    addWeatherParticles("rain", 5);
  }

  if (envMode.includes("폭설")) {
    addWeatherParticles("snow", 4);
  }

  if (envMode.includes("복합")) {
    addWeatherParticles("heat", 2);
    addWeatherParticles("rain", 3);
  }
}

function updateNormalBuilding(dt) {
  normal.temp += (outsideTemp - normal.temp) * dt * 0.82;
  normal.hum += (outsideHum - normal.hum) * dt * 0.54;

  const quakeTorque =
    Math.sin(time * 16) * quake * 3.7 +
    Math.sin(time * 28) * quake * 1.7 +
    Math.sin(time * 48) * quake * 0.8;

  normal.angularVelocity += quakeTorque * dt;
  normal.angularVelocity += -normal.angle * 3.2 * dt;
  normal.angularVelocity *= Math.pow(0.984, dt * 60);
  normal.angle += normal.angularVelocity * dt;
  normal.angle = clamp(normal.angle, -0.52, 0.52);

  pushHistory(normal.tempHistory, normal.temp + Math.sin(time * 2.0) * 0.18);
  pushHistory(normal.humHistory, normal.hum + Math.sin(time * 1.7) * 0.45);
  pushHistory(normal.vibHistory, Math.abs(normal.angle) * 57.3);
  pushHistory(normal.plantHistory, normal.plantHealth);
}

function updatePidBuilding(dt) {
  const tempGainValue = Number(tempGain.value);
  const humGainValue = Number(humGain.value);
  const vibGainValue = Number(vibGain.value);

  const naturalTempFlow = (outsideTemp - pid.temp) * 0.18;
  const tempError = targetTemp - pid.temp;

  pid.tempIntegral = clamp(pid.tempIntegral + tempError * dt, -22, 22);

  const tempDerivative = (tempError - pid.prevTempError) / Math.max(dt, 0.001);
  pid.prevTempError = tempError;

  pid.tempOutput = clamp(
    tempGainValue * (0.90 * tempError + 0.075 * pid.tempIntegral + 0.15 * tempDerivative),
    -8.5,
    8.5
  );

  pid.temp += (naturalTempFlow + pid.tempOutput) * dt;

  const naturalHumFlow = (outsideHum - pid.hum) * 0.10;
  const humError = targetHum - pid.hum;

  pid.humIntegral = clamp(pid.humIntegral + humError * dt, -75, 75);

  const humDerivative = (humError - pid.prevHumError) / Math.max(dt, 0.001);
  pid.prevHumError = humError;

  pid.humOutput = clamp(
    humGainValue * (0.50 * humError + 0.025 * pid.humIntegral + 0.09 * humDerivative),
    -12,
    12
  );

  pid.hum += (naturalHumFlow + pid.humOutput) * dt;

  const quakeTorque =
    Math.sin(time * 16) * quake * 3.7 +
    Math.sin(time * 28) * quake * 1.7 +
    Math.sin(time * 48) * quake * 0.8;

  const vibError = -pid.angle;

  pid.vibIntegral = clamp(pid.vibIntegral + vibError * dt, -3, 3);

  const vibDerivative = (vibError - pid.prevVibError) / Math.max(dt, 0.001);
  pid.prevVibError = vibError;

  pid.vibOutput = clamp(
    vibGainValue * (18 * vibError + 1.0 * pid.vibIntegral + 6.0 * vibDerivative),
    -9,
    9
  );

  pid.angularVelocity += (quakeTorque + pid.vibOutput) * dt;
  pid.angularVelocity += -pid.angle * 6.4 * dt;
  pid.angularVelocity *= Math.pow(0.84, dt * 60);
  pid.angle += pid.angularVelocity * dt;
  pid.angle = clamp(pid.angle, -0.30, 0.30);

  pushHistory(pid.tempHistory, pid.temp + Math.sin(time * 2.2) * 0.08);
  pushHistory(pid.humHistory, pid.hum + Math.sin(time * 1.9) * 0.20);
  pushHistory(pid.vibHistory, Math.abs(pid.angle) * 57.3);
  pushHistory(pid.plantHistory, pid.plantHealth);
}

function updatePlantHealth(building, dt, isPid) {
  const tempAbsError = Math.abs(building.temp - targetTemp);
  const humAbsError = Math.abs(building.hum - targetHum);
  const vibAbsError = Math.abs(building.angle) * 57.3;

  // PID 제어도 실제로는 무한히 버티지 못한다.
  // 실험 기준:
  // - PID 건물 내부 온도가 34℃를 넘거나 8℃ 밑으로 내려가면 식물 피해 시작
  // - 40℃ 이상 또는 3℃ 이하에서는 피해가 급격히 커짐
  // - 습도 78% 이상, 22% 이하도 식물에 피해
  const mildTempLimit = building.temp > 34 || building.temp < 8;
  const severeTempLimit = building.temp > 40 || building.temp < 3;
  const extremeTempLimit = building.temp > 46 || building.temp < -2;

  const mildHumLimit = building.hum > 78 || building.hum < 22;
  const severeHumLimit = building.hum > 88 || building.hum < 14;

  const tempStress =
    Math.max(0, tempAbsError - 4) * (isPid ? 0.36 : 0.92) +
    (mildTempLimit ? (isPid ? 1.10 : 1.60) : 0) +
    (severeTempLimit ? (isPid ? 2.60 : 3.40) : 0) +
    (extremeTempLimit ? (isPid ? 4.60 : 5.60) : 0);

  const humStress =
    Math.max(0, humAbsError - 16) * (isPid ? 0.13 : 0.30) +
    (mildHumLimit ? (isPid ? 0.70 : 1.20) : 0) +
    (severeHumLimit ? (isPid ? 1.80 : 2.50) : 0);

  const vibStress =
    Math.max(0, vibAbsError - 7) * (isPid ? 0.08 : 0.22);

  const totalStress = tempStress + humStress + vibStress;

  const recovery =
    totalStress < 1.25
      ? (isPid ? 1.60 : 0.70)
      : 0;

  building.plantHealth = clamp(
    building.plantHealth + (recovery - totalStress) * dt,
    0,
    100
  );

  if (building.plantHealth > 72) {
    building.plantMood = "healthy";
  } else if (building.plantHealth > 35) {
    building.plantMood = "weak";
  } else {
    building.plantMood = "dead";
  }

  if (building.hum > 68) {
    building.envState = "mold";
  } else if (building.hum < 28) {
    building.envState = "dry";
  } else if (building.temp < 14) {
    building.envState = "cold";
  } else if (building.temp > 30) {
    building.envState = "hot";
  } else {
    building.envState = "normal";
  }

  if (isPid) {
    pidLimitReached =
      severeTempLimit ||
      extremeTempLimit ||
      severeHumLimit ||
      Math.abs(pid.tempOutput) > 8.15 ||
      Math.abs(pid.humOutput) > 11.2;
  }
}

function pushHistory(arr, value) {
  arr.push(safe(value, 0));

  if (arr.length > 320) {
    arr.shift();
  }
}

function updateParticles(dt) {
  particles.forEach(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  });

  particles = particles.filter(p => p.life > 0);

  eventTexts.forEach(t => {
    t.y += t.vy * dt;
    t.life -= dt;
  });

  eventTexts = eventTexts.filter(t => t.life > 0);
}

function updateStats() {
  normalTiltText.textContent = (normal.angle * 57.3).toFixed(1) + "°";
  pidTiltText.textContent = (pid.angle * 57.3).toFixed(1) + "°";

  normalPlantScore.textContent = normal.plantHealth.toFixed(0);
  pidPlantScore.textContent = pid.plantHealth.toFixed(0);

  tempPower.textContent = Math.round(Math.abs(pid.tempOutput) / 9 * 100) + "%";
  humPower.textContent = Math.round(Math.abs(pid.humOutput) / 12 * 100) + "%";
  vibPower.textContent = Math.round(Math.abs(pid.vibOutput) / 9 * 100) + "%";

  protectText.textContent = Math.max(0, Math.round(pid.plantHealth - normal.plantHealth));

  envModeChip.textContent = envMode;
  outsideTempChip.textContent = outsideTemp.toFixed(1) + "℃";
  outsideHumChip.textContent = outsideHum.toFixed(0) + "%";
  quakeChip.textContent = quake.toFixed(2);

  updateLabels();
}

function drawScene() {
  resizeCanvases();

  const w = sceneCanvas.width;
  const h = sceneCanvas.height;

  scene.save();

  if (screenShake > 0) {
    scene.translate(
      (Math.random() - 0.5) * screenShake,
      (Math.random() - 0.5) * screenShake
    );
  }

  scene.fillStyle = "#07111f";
  scene.fillRect(0, 0, w, h);

  drawSky(w, h);
  drawEnvironmentOverlay(w, h);
  drawParticles();
  drawGround(w, h);

  const baseY = h * 0.72;
  const buildingW = Math.min(176, w * 0.16);
  const buildingH = Math.min(330, h * 0.48);
  const normalX = w * 0.30;
  const pidX = w * 0.68;

  drawBuilding(normalX, baseY, buildingW, buildingH, normal, false);
  drawBuilding(pidX, baseY, buildingW, buildingH, pid, true);
  drawComparisonLine(normalX, pidX, baseY, buildingH);
  drawQuakeWave(w, h);
  drawEventTexts();

  scene.restore();
  updateDomVisualLayer();
}

function drawSky(w, h) {
  const grad = scene.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#07111f");
  grad.addColorStop(1, "#0f172a");

  scene.fillStyle = grad;
  scene.fillRect(0, 0, w, h);

  scene.strokeStyle = "rgba(96,165,250,.06)";
  scene.lineWidth = 1;

  for (let x = 0; x < w; x += 48) {
    scene.beginPath();
    scene.moveTo(x, 0);
    scene.lineTo(x, h);
    scene.stroke();
  }

  for (let y = 0; y < h; y += 48) {
    scene.beginPath();
    scene.moveTo(0, y);
    scene.lineTo(w, y);
    scene.stroke();
  }
}

function drawEnvironmentOverlay(w, h) {
  scene.save();

  // 배경 전체를 덮지 않고 가장자리 빛과 하늘 분위기만 살짝 보여준다.
  // 건물 시각화를 가리지 않는 것이 핵심이다.
  if (running && envMode.includes("폭염")) {
    const heatGlow = scene.createRadialGradient(
      w * 0.16,
      h * 0.15,
      20,
      w * 0.16,
      h * 0.15,
      Math.max(w, h) * 0.55
    );

    heatGlow.addColorStop(0, "rgba(251, 146, 60, 0.22)");
    heatGlow.addColorStop(0.42, "rgba(251, 146, 60, 0.08)");
    heatGlow.addColorStop(1, "rgba(251, 146, 60, 0.00)");

    scene.fillStyle = heatGlow;
    scene.fillRect(0, 0, w, h * 0.72);
  }

  if (running && envMode.includes("폭우")) {
    const rainGlow = scene.createLinearGradient(0, 0, 0, h * 0.72);
    rainGlow.addColorStop(0, "rgba(56, 189, 248, 0.08)");
    rainGlow.addColorStop(0.38, "rgba(56, 189, 248, 0.03)");
    rainGlow.addColorStop(1, "rgba(56, 189, 248, 0.00)");

    scene.fillStyle = rainGlow;
    scene.fillRect(0, 0, w, h * 0.72);
  }

  if (running && envMode.includes("폭설")) {
    const snowGlow = scene.createLinearGradient(0, 0, 0, h * 0.72);
    snowGlow.addColorStop(0, "rgba(219, 234, 254, 0.10)");
    snowGlow.addColorStop(0.42, "rgba(219, 234, 254, 0.035)");
    snowGlow.addColorStop(1, "rgba(219, 234, 254, 0.00)");

    scene.fillStyle = snowGlow;
    scene.fillRect(0, 0, w, h * 0.72);
  }

  if (running && envMode.includes("복합")) {
    const disasterGlow = scene.createRadialGradient(
      w * 0.2,
      h * 0.12,
      20,
      w * 0.2,
      h * 0.12,
      Math.max(w, h) * 0.58
    );

    disasterGlow.addColorStop(0, "rgba(250, 204, 21, 0.14)");
    disasterGlow.addColorStop(0.50, "rgba(56, 189, 248, 0.05)");
    disasterGlow.addColorStop(1, "rgba(0, 0, 0, 0.00)");

    scene.fillStyle = disasterGlow;
    scene.fillRect(0, 0, w, h * 0.72);
  }

  scene.restore();
}

function drawParticles() {
  particles.forEach(p => {
    const alpha = clamp(p.life / 4, 0, 0.88);

    scene.save();
    scene.globalAlpha = alpha;

    if (p.type === "heat") {
      const radius = p.size * (1.1 + Math.sin(time * 4 + p.x * 0.03) * 0.18);

      const heatGradient = scene.createRadialGradient(
        p.x,
        p.y,
        0,
        p.x,
        p.y,
        radius * 2.2
      );

      heatGradient.addColorStop(0, "rgba(253, 186, 116, 0.80)");
      heatGradient.addColorStop(0.45, "rgba(251, 146, 60, 0.28)");
      heatGradient.addColorStop(1, "rgba(251, 146, 60, 0.00)");

      scene.fillStyle = heatGradient;
      scene.beginPath();
      scene.arc(p.x, p.y, radius * 2.2, 0, Math.PI * 2);
      scene.fill();

      scene.fillStyle = "#fed7aa";
      scene.font = "18px Arial";
      scene.fillText("☀", p.x - 7, p.y + 6);
    }

    if (p.type === "snow") {
      scene.fillStyle = "rgba(219, 234, 254, 0.92)";
      scene.font = "20px Arial";
      scene.fillText("❄", p.x, p.y);
    }

    if (p.type === "rain" || p.type === "stress") {
      scene.strokeStyle = "rgba(56, 189, 248, 0.88)";
      scene.lineWidth = 2.3;
      scene.beginPath();
      scene.moveTo(p.x, p.y);
      scene.lineTo(p.x - 12, p.y + 28);
      scene.stroke();

      scene.strokeStyle = "rgba(191, 219, 254, 0.18)";
      scene.lineWidth = 5;
      scene.beginPath();
      scene.moveTo(p.x + 1, p.y - 1);
      scene.lineTo(p.x - 11, p.y + 27);
      scene.stroke();
    }

    if (p.type === "quake") {
      scene.strokeStyle = "rgba(248, 113, 113, 0.86)";
      scene.lineWidth = 3;
      scene.beginPath();
      scene.moveTo(p.x - 16, p.y);
      scene.lineTo(p.x, p.y + 9);
      scene.lineTo(p.x + 16, p.y);
      scene.stroke();
    }

    scene.restore();
  });
}

function drawGround(w, h) {
  const y = h * 0.72;

  scene.fillStyle = "#0b1220";
  scene.fillRect(0, y, w, h - y);

  scene.strokeStyle = quake > 0.05 ? "#f87171" : "#334155";
  scene.lineWidth = quake > 0.05 ? 8 : 5;

  scene.beginPath();

  if (quake > 0.05) {
    for (let x = 0; x <= w; x += 18) {
      const yy = y + Math.sin(time * 22 + x * 0.04) * quake * 9;

      if (x === 0) {
        scene.moveTo(x, yy);
      } else {
        scene.lineTo(x, yy);
      }
    }
  } else {
    scene.moveTo(0, y);
    scene.lineTo(w, y);
  }

  scene.stroke();
}

function drawBuilding(x, baseY, bw, bh, building, isPid) {
  const angle = clamp(building.angle, isPid ? -0.30 : -0.52, isPid ? 0.30 : 0.52);

  drawTiltGuide(x, baseY, bh, angle, isPid);

  scene.save();
  scene.translate(x, baseY);
  scene.rotate(angle);

  const grad = scene.createLinearGradient(0, -bh, 0, 0);

  if (isPid) {
    grad.addColorStop(0, "#155e75");
    grad.addColorStop(0.55, "#0f766e");
    grad.addColorStop(1, "#134e4a");
  } else {
    grad.addColorStop(0, "#475569");
    grad.addColorStop(0.55, "#334155");
    grad.addColorStop(1, "#1f2937");
  }

  scene.fillStyle = grad;
  roundRect(scene, -bw / 2, -bh, bw, bh, 18);
  scene.fill();

  scene.strokeStyle = isPid ? "#67e8f9" : "#cbd5e1";
  scene.lineWidth = 4;
  scene.stroke();

  drawWindows(-bw / 2, -bh, bw, bh, isPid);
  drawEnvironmentInside(-bw / 2, -bh, bw, bh, building);

  if (isPid) {
    drawKoreanSystemLabels(-bw / 2, -bh, bw, bh);
    drawTemperatureAirFlow(-bw / 2, -bh, bw, bh, building);
    drawHumidityFlow(-bw / 2, -bh, bw, bh, building);
    drawDamperVisual(-bw / 2, -bh, bw, bh, building);
    drawComfortShield(-bw / 2, -bh, bw, bh, building);
  }

  drawPlantInside(-bw / 2, -bh, bw, bh, building, isPid);

  scene.restore();

  scene.textAlign = "center";
  scene.font = "bold 17px Arial";
  scene.fillStyle = "#f8fafc";
  scene.fillText(isPid ? "PID 제어 건물" : "일반 건물", x, baseY + 36);

  scene.font = "13px Arial";
  scene.fillStyle = "#cbd5e1";
  scene.fillText("온도 " + building.temp.toFixed(1) + "℃", x, baseY + 58);
  scene.fillText("습도 " + building.hum.toFixed(0) + "%", x, baseY + 78);

  scene.fillStyle = Math.abs(angle * 57.3) > 10 ? "#facc15" : "#cbd5e1";
  scene.fillText("기울기 " + (angle * 57.3).toFixed(1) + "°", x, baseY + 98);

  const label =
    building.plantMood === "healthy"
      ? "식물 건강"
      : building.plantMood === "weak"
        ? "식물 약화"
        : "식물 사망";

  scene.fillStyle =
    building.plantMood === "healthy"
      ? "#86efac"
      : building.plantMood === "weak"
        ? "#facc15"
        : "#f87171";

  scene.fillText(label + " " + building.plantHealth.toFixed(0) + "%", x, baseY + 118);

  drawBuildingStatus(x, baseY - bh - 70, building, isPid);
}

function drawTiltGuide(x, baseY, bh, angle, isPid) {
  const color = isPid ? "rgba(134,239,172,.92)" : "rgba(250,204,21,.95)";

  scene.save();

  scene.strokeStyle = "rgba(255,255,255,.62)";
  scene.lineWidth = 2;
  scene.setLineDash([6, 8]);

  scene.beginPath();
  scene.moveTo(x, baseY);
  scene.lineTo(x, baseY - bh);
  scene.stroke();

  scene.setLineDash([]);
  scene.strokeStyle = color;
  scene.lineWidth = 5;

  scene.beginPath();
  scene.arc(x, baseY, 58, -Math.PI / 2, -Math.PI / 2 + angle, angle < 0);
  scene.stroke();

  scene.restore();
}

function drawWindows(x, y, w, h, isPid) {
  const cols = 4;
  const rows = 7;
  const gapX = w / (cols + 1);
  const gapY = h / (rows + 1);

  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      scene.fillStyle = isPid ? "rgba(165,243,252,.86)" : "rgba(203,213,225,.52)";
      roundRect(scene, x + gapX * c - 10, y + gapY * r - 8, 20, 15, 4);
      scene.fill();
    }
  }
}

function drawEnvironmentInside(x, y, w, h, building) {
  if (building.envState === "normal") {
    return;
  }

  scene.save();

  if (building.envState === "cold") {
    scene.globalAlpha = 0.24;
    scene.fillStyle = "#93c5fd";
    scene.fillRect(x + 8, y + 8, w - 16, h - 16);

    scene.globalAlpha = 1;
    scene.fillStyle = "#dbeafe";
    scene.font = "bold 14px Arial";
    scene.fillText("냉해", x + w / 2 - 16, y + 84);
  }

  if (building.envState === "hot") {
    scene.globalAlpha = 0.20;
    scene.fillStyle = "#fb923c";
    scene.fillRect(x + 8, y + 8, w - 16, h - 16);

    scene.globalAlpha = 1;
    scene.fillStyle = "#fed7aa";
    scene.font = "bold 14px Arial";
    scene.fillText("고온", x + w / 2 - 16, y + 84);
  }

  if (building.envState === "mold") {
    scene.globalAlpha = 0.34;
    scene.fillStyle = "#22c55e";

    for (let i = 0; i < 24; i++) {
      const mx = x + 18 + (i * 29) % (w - 36);
      const my = y + 35 + (i * 47) % (h - 80);

      scene.beginPath();
      scene.arc(mx, my, 5 + (i % 4), 0, Math.PI * 2);
      scene.fill();
    }

    scene.globalAlpha = 1;
    scene.fillStyle = "#86efac";
    scene.font = "bold 15px Arial";
    scene.textAlign = "center";
    scene.fillText("곰팡이", x + w / 2, y + 86);
  }

  if (building.envState === "dry") {
    scene.globalAlpha = 0.27;
    scene.fillStyle = "#facc15";
    scene.fillRect(x + 8, y + 8, w - 16, h - 16);

    scene.globalAlpha = 1;
    scene.fillStyle = "#fde68a";
    scene.font = "bold 14px Arial";
    scene.textAlign = "center";
    scene.fillText("건조", x + w / 2, y + 86);
  }

  scene.restore();
}

function drawKoreanSystemLabels(x, y, w, h) {
  scene.textAlign = "center";
  scene.font = "bold 15px Arial";

  scene.fillStyle = "#67e8f9";
  scene.fillText("냉난방", x + w / 2, y + 30);

  scene.fillStyle = "#d8b4fe";
  scene.fillText("습도제어", x + w / 2, y + 54);

  scene.fillStyle = "#86efac";
  scene.fillText("제진장치", x + w / 2, y + h - 20);
}


function drawCanvasPlantHealthBar(x, y, health) {
  const value = clamp(health, 0, 100);
  const barW = 74;
  const barH = 14;

  scene.save();

  scene.fillStyle = "rgba(2, 6, 23, 0.78)";
  roundRect(scene, x - barW / 2, y, barW, barH, 7);
  scene.fill();

  if (value > 70) {
    scene.fillStyle = "#22c55e";
  } else if (value > 35) {
    scene.fillStyle = "#facc15";
  } else {
    scene.fillStyle = "#ef4444";
  }

  roundRect(scene, x - barW / 2, y, barW * value / 100, barH, 7);
  scene.fill();

  scene.fillStyle = "#ffffff";
  scene.font = "bold 10px Arial";
  scene.textAlign = "center";
  scene.fillText(value.toFixed(0) + "%", x, y + 11);

  scene.restore();
}

function drawPlantInside(x, y, w, h, building, isPid) {
  const px = x + w / 2;
  const py = y + h - 58;
  const health = building.plantHealth;

  const dryFactor = building.envState === "dry" || building.envState === "cold" ? 1 : 0;
  const wilt = health < 78 || dryFactor ? clamp((82 - health) / 58 + dryFactor * 0.34, 0, 1) : 0;

  scene.save();
  scene.translate(px, py);

  scene.fillStyle = "#8b5a2b";
  roundRect(scene, -16, 8, 32, 19, 5);
  scene.fill();

  if (health <= 35) {
    scene.strokeStyle = "#7f1d1d";
    scene.lineWidth = 3;

    scene.beginPath();
    scene.moveTo(0, 10);
    scene.lineTo(-16, -9);
    scene.moveTo(0, 10);
    scene.lineTo(16, -9);
    scene.stroke();

    scene.fillStyle = "#991b1b";
    scene.font = "bold 23px Arial";
    scene.textAlign = "center";
    scene.fillText("×", 0, -17);
  } else {
    scene.fillStyle = health > 78 ? "#4ade80" : health > 52 ? "#facc15" : "#a16207";

    const droop = 22 * wilt;

    scene.beginPath();
    scene.ellipse(-12, droop, 11, 19, -0.96 + wilt * 0.72, 0, Math.PI * 2);
    scene.ellipse(12, droop, 11, 19, 0.96 - wilt * 0.72, 0, Math.PI * 2);
    scene.ellipse(0, -14 + droop * 0.48, 10, 19, 0, 0, Math.PI * 2);
    scene.fill();

    scene.strokeStyle = health > 72 ? "#166534" : "#854d0e";
    scene.lineWidth = 3;

    scene.beginPath();
    scene.moveTo(0, 10);
    scene.lineTo(0, -21 + droop * 0.52);
    scene.stroke();
  }

  scene.fillStyle = isPid && health > 70 ? "#bbf7d0" : "#f8fafc";
  scene.font = "bold 11px Arial";
  scene.textAlign = "center";
  scene.fillText(Math.round(health) + "%", 0, 43);
  drawCanvasPlantHealthBar(0, 52, health);

  scene.restore();
}

function drawTemperatureAirFlow(x, y, w, h, building) {
  const output = building.tempOutput;
  const abs = Math.abs(output);

  if (abs < 0.16) {
    return;
  }

  const heat = output > 0;
  const prefix = heat ? "rgba(248,113,113," : "rgba(96,165,250,";
  const alpha = clamp(abs / 9, 0.24, 0.82);

  scene.save();
  scene.lineWidth = 4;

  for (let i = 0; i < 7; i++) {
    const yy = y + 66 + i * (h - 132) / 6;
    const phase = time * 3.3 + i * 0.8;
    const start = heat ? x + 14 : x + w - 14;
    const end = heat ? x + w - 14 : x + 14;
    const mid = (start + end) / 2;

    scene.strokeStyle = prefix + alpha + ")";
    scene.beginPath();
    scene.moveTo(start, yy);
    scene.quadraticCurveTo(mid, yy + Math.sin(phase) * 20, end, yy + Math.cos(phase) * 8);
    scene.stroke();
  }

  scene.fillStyle = heat ? "#fecaca" : "#bfdbfe";
  scene.font = "bold 12px Arial";
  scene.textAlign = "center";
  scene.fillText(heat ? "난방 작동" : "냉방 작동", x + w / 2, y + h - 46);

  scene.restore();
}

function drawHumidityFlow(x, y, w, h, building) {
  const output = building.humOutput;
  const abs = Math.abs(output);

  if (abs < 0.22) {
    return;
  }

  const humid = output > 0;

  scene.save();
  scene.globalAlpha = clamp(abs / 12, 0.22, 0.72);
  scene.fillStyle = humid ? "#a7f3d0" : "#e9d5ff";
  scene.font = "bold 15px Arial";

  for (let i = 0; i < 8; i++) {
    scene.fillText(
      humid ? "가습" : "제습",
      x + 20 + (i % 3) * 46,
      y + 96 + Math.floor(i / 3) * 58 + Math.sin(time * 2 + i) * 6
    );
  }

  scene.globalAlpha = 1;
  scene.restore();
}

function drawDamperVisual(x, y, w, h, building) {
  const power = Math.abs(building.vibOutput) / 9;

  if (power < 0.10) {
    return;
  }

  scene.save();
  scene.globalAlpha = clamp(power, 0.18, 0.90);
  scene.strokeStyle = "#86efac";
  scene.lineWidth = 5;

  const cy = y + h - 30;

  scene.beginPath();
  scene.moveTo(x + 16, cy);
  scene.lineTo(x + w - 16, cy + Math.sin(time * 18) * 8);
  scene.stroke();

  scene.fillStyle = "#86efac";
  scene.font = "bold 12px Arial";
  scene.textAlign = "center";
  scene.fillText("제진 작동", x + w / 2, y + h - 44);

  scene.restore();
}

function drawComfortShield(x, y, w, h, building) {
  const tempError = Math.abs(building.temp - targetTemp);
  const humError = Math.abs(building.hum - targetHum);
  const vibError = Math.abs(building.angle) * 57.3;

  const stress = tempError * 2 + humError * 0.45 + vibError * 1.25;
  const protection = clamp(1 - stress / 70, 0, 1);

  scene.save();
  scene.globalAlpha = 0.18 + protection * 0.18;
  scene.strokeStyle = "rgba(134,239,172,0.9)";
  scene.lineWidth = 4;

  roundRect(scene, x + 10, y + 62, w - 20, h - 120, 14);
  scene.stroke();

  scene.globalAlpha = 1;
  scene.fillStyle = "#bbf7d0";
  scene.font = "bold 11px Arial";
  scene.textAlign = "center";
  scene.fillText("보호막 작동", x + w / 2, y + h - 70);

  scene.restore();
}

function drawBuildingStatus(x, y, building, isPid) {
  drawMiniGauge(x - 72, y, "온도", Math.abs(building.temp - targetTemp), 20, "#fb923c");
  drawMiniGauge(x - 72, y + 20, "습도", Math.abs(building.hum - targetHum), 60, "#22d3ee");
  drawMiniGauge(x - 72, y + 40, "기울", Math.abs(building.angle) * 57.3, 32, isPid ? "#86efac" : "#f87171");
}

function drawMiniGauge(x, y, label, value, max, color) {
  scene.fillStyle = "#cbd5e1";
  scene.textAlign = "left";
  scene.font = "11px Arial";
  scene.fillText(label, x, y + 8);

  scene.fillStyle = "rgba(2,6,23,.7)";
  roundRect(scene, x + 34, y, 88, 9, 5);
  scene.fill();

  scene.fillStyle = color;
  roundRect(scene, x + 34, y, 88 * clamp(value / max, 0, 1), 9, 5);
  scene.fill();
}

function drawComparisonLine(normalX, pidX, baseY, bh) {
  scene.strokeStyle = "rgba(148,163,184,.22)";
  scene.lineWidth = 2;
  scene.setLineDash([8, 10]);

  scene.beginPath();
  scene.moveTo((normalX + pidX) / 2, baseY - bh - 40);
  scene.lineTo((normalX + pidX) / 2, baseY + 130);
  scene.stroke();

  scene.setLineDash([]);
}

function drawQuakeWave(w, h) {
  if (quake < 0.05) {
    return;
  }

  const y = h * 0.72 + 24;

  scene.save();
  scene.globalAlpha = clamp(quake, 0.15, 0.88);
  scene.strokeStyle = "#f87171";
  scene.lineWidth = 3;
  scene.setLineDash([10, 8]);

  for (let i = 0; i < 3; i++) {
    scene.beginPath();

    const off = i * 26;

    for (let x = 0; x <= w; x += 18) {
      const yy = y + off + Math.sin(time * 16 + x * 0.06 + i) * quake * 12;

      if (x === 0) {
        scene.moveTo(x, yy);
      } else {
        scene.lineTo(x, yy);
      }
    }

    scene.stroke();
  }

  scene.restore();
}

function drawEventTexts() {
  eventTexts.forEach(t => {
    scene.globalAlpha = clamp(t.life, 0, 1);
    scene.fillStyle = t.color;
    scene.textAlign = "center";
    scene.font = "bold 24px Arial";
    scene.fillText(t.text, t.x, t.y);
    scene.globalAlpha = 1;
  });
}

function drawGraphs() {
  resizeCanvases();

  const w = graphCanvas.width;
  const h = graphCanvas.height;

  graph.fillStyle = "#07111f";
  graph.fillRect(0, 0, w, h);

  graph.fillStyle = "#dbeafe";
  graph.font = "bold 20px Arial";
  graph.textAlign = "left";
  graph.fillText("실시간 그래프 / Real-time Graph", 24, 34);

  graph.fillStyle = "#f87171";
  graph.font = "bold 13px Arial";
  graph.fillText("빨강: 일반 건물 Normal", 24, 58);

  graph.fillStyle = "#86efac";
  graph.fillText("초록: PID 건물 PID", 190, 58);

  const top = 82;
  const gap = 22;
  const graphH = Math.max(96, (h - top - gap * 4) / 4);
  const graphW = w - 70;
  const x = 42;

  drawGraphPanel(graph, x, top, graphW, graphH, "온도 Temperature (℃)", normal.tempHistory, pid.tempHistory, 10, 46, 22, "℃");
  drawGraphPanel(graph, x, top + (graphH + gap), graphW, graphH, "습도 Humidity (%)", normal.humHistory, pid.humHistory, 10, 100, 45, "%");
  drawGraphPanel(graph, x, top + (graphH + gap) * 2, graphW, graphH, "기울기 Tilt (°)", normal.vibHistory, pid.vibHistory, 0, 30, 0, "°");
  drawGraphPanel(graph, x, top + (graphH + gap) * 3, graphW, graphH, "식물 건강 Plant Health (%)", normal.plantHistory, pid.plantHistory, 0, 100, 100, "%");
}

function drawGraphPanel(g, x, y, w, h, title, normalHistory, pidHistory, min, max, target, unit) {
  g.save();

  g.fillStyle = "rgba(15,23,42,.9)";
  roundRect(g, x, y, w, h, 16);
  g.fill();

  g.strokeStyle = "#334155";
  g.stroke();

  g.fillStyle = "#dbeafe";
  g.font = "bold 13px Arial";
  g.fillText(title, x + 14, y + 22);

  const nVal = safe(normalHistory[normalHistory.length - 1], target);
  const pVal = safe(pidHistory[pidHistory.length - 1], target);

  g.font = "bold 12px Arial";
  g.fillStyle = "#f87171";
  g.fillText("일반 " + nVal.toFixed(1) + unit, x + 14, y + 42);

  g.fillStyle = "#86efac";
  g.fillText("PID " + pVal.toFixed(1) + unit, x + 128, y + 42);

  const cx = x + 54;
  const cy = y + 56;
  const cw = w - 82;
  const ch = h - 76;

  g.save();
  g.beginPath();
  roundRect(g, cx, cy, cw, ch, 10);
  g.clip();

  g.fillStyle = "rgba(2,6,23,.25)";
  g.fillRect(cx, cy, cw, ch);

  g.strokeStyle = "rgba(148,163,184,.16)";

  for (let i = 0; i <= 4; i++) {
    const yy = cy + ch * i / 4;

    g.beginPath();
    g.moveTo(cx, yy);
    g.lineTo(cx + cw, yy);
    g.stroke();
  }

  if (target >= min && target <= max) {
    const ty = cy + ch - ((target - min) / (max - min)) * ch;

    g.strokeStyle = "rgba(250,204,21,.7)";
    g.setLineDash([6, 6]);

    g.beginPath();
    g.moveTo(cx, ty);
    g.lineTo(cx + cw, ty);
    g.stroke();

    g.setLineDash([]);
  }

  drawGraphLine(g, normalHistory, cx, cy, cw, ch, min, max, "#f87171");
  drawGraphLine(g, pidHistory, cx, cy, cw, ch, min, max, "#86efac");

  g.restore();
  g.restore();
}

function drawGraphLine(g, hist, x, y, w, h, min, max, color) {
  if (!hist || hist.length < 2) {
    return;
  }

  const pts = [];
  const step = Math.max(1, Math.floor(hist.length / 180));

  for (let i = 0; i < hist.length; i += step) {
    const v = clamp(safe(hist[i], min), min, max);

    pts.push({
      x: x + (i / Math.max(1, hist.length - 1)) * w,
      y: y + h - ((v - min) / (max - min)) * h
    });
  }

  if (pts.length < 2) {
    return;
  }

  g.save();
  g.shadowColor = color;
  g.shadowBlur = 8;
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.lineCap = "round";
  g.lineJoin = "round";

  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    g.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y
    );
  }

  g.stroke();

  const last = pts[pts.length - 1];

  g.fillStyle = color;
  g.beginPath();
  g.arc(last.x, last.y, 4.5, 0, Math.PI * 2);
  g.fill();

  g.restore();
}

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.quadraticCurveTo(x + w, y, x + w, y + r);
  context.lineTo(x + w, y + h - r);
  context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  context.lineTo(x + r, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}


function ensureDomVisualLayer() {
  const panel = document.querySelector(".canvas-panel");

  if (!panel) {
    return null;
  }

  panel.style.position = "relative";

  let style = document.getElementById("domBuildingVisualStyle");

  if (!style) {
    style = document.createElement("style");
    style.id = "domBuildingVisualStyle";
    style.textContent = `
      .dom-visual-layer {
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
        overflow: hidden;
      }

      .hud {
        z-index: 5;
      }

      .status-ribbon {
        z-index: 5;
      }

      .dom-building {
        position: absolute;
        bottom: 18%;
        width: 150px;
        height: 285px;
        border-radius: 18px;
        transform-origin: 50% 100%;
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.40);
        transition: filter 0.2s linear;
      }

      .normal-building {
        left: 30%;
        margin-left: -75px;
        background: linear-gradient(180deg, #475569, #1f2937);
        border: 4px solid #cbd5e1;
      }

      .pid-building {
        left: 68%;
        margin-left: -75px;
        background: linear-gradient(180deg, #155e75, #0f766e 55%, #134e4a);
        border: 4px solid #67e8f9;
        box-shadow: 0 0 32px rgba(103, 232, 249, 0.35), 0 18px 45px rgba(0, 0, 0, 0.40);
      }

      .dom-heat-meter {
        position: absolute;
        left: 0;
        right: 0;
        top: 108px;
        text-align: center;
        font-weight: 900;
        color: #fed7aa;
        text-shadow: 0 2px 6px rgba(0,0,0,0.8);
        opacity: 0;
      }

      .state-hot .dom-heat-meter {
        opacity: 1;
      }

      .dom-building-title {
        position: absolute;
        left: 50%;
        bottom: -34px;
        transform: translateX(-50%);
        white-space: nowrap;
        font-weight: 900;
        font-size: 15px;
        color: white;
        text-shadow: 0 2px 6px rgba(0,0,0,0.8);
      }

      .dom-window-grid {
        position: absolute;
        left: 22px;
        right: 22px;
        top: 36px;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px 7px;
      }

      .dom-window-grid span {
        height: 15px;
        border-radius: 4px;
        background: rgba(203, 213, 225, 0.62);
      }

      .pid-building .dom-window-grid span {
        background: rgba(165, 243, 252, 0.88);
      }

      .dom-system-labels {
        position: absolute;
        left: 0;
        right: 0;
        top: 8px;
        text-align: center;
        font-weight: 900;
        line-height: 1.25;
        font-size: 14px;
      }

      .dom-system-labels .cool {
        color: #67e8f9;
      }

      .dom-system-labels .hum {
        color: #d8b4fe;
      }

      .dom-system-labels .damper {
        position: absolute;
        left: 0;
        right: 0;
        top: 232px;
        color: #86efac;
      }

      .dom-plant {
        position: absolute;
        left: 50%;
        bottom: 34px;
        width: 58px;
        height: 78px;
        transform: translateX(-50%);
      }

      .dom-pot {
        position: absolute;
        left: 14px;
        bottom: 0;
        width: 30px;
        height: 20px;
        border-radius: 5px;
        background: #8b5a2b;
      }

      .dom-stem {
        position: absolute;
        left: 28px;
        bottom: 18px;
        width: 4px;
        height: 44px;
        border-radius: 999px;
        background: #166534;
      }

      .dom-leaf {
        position: absolute;
        width: 25px;
        height: 38px;
        border-radius: 50%;
        background: #4ade80;
        transform-origin: 50% 100%;
      }

      .leaf-left {
        left: 4px;
        bottom: 32px;
        transform: rotate(-42deg);
      }

      .leaf-right {
        right: 4px;
        bottom: 32px;
        transform: rotate(42deg);
      }

      .leaf-top {
        left: 17px;
        bottom: 48px;
        transform: rotate(0deg);
      }

      .weak-plant .dom-leaf {
        background: #facc15;
      }

      .dead-plant .dom-leaf {
        background: #a16207;
        transform: rotate(105deg) translateY(18px);
      }

      .dead-plant .leaf-right {
        transform: rotate(-105deg) translateY(18px);
      }

      .dead-plant .leaf-top {
        transform: rotate(180deg) translateY(20px);
      }

      .dom-env-label {
        position: absolute;
        left: 50%;
        top: 84px;
        transform: translateX(-50%);
        font-weight: 900;
        font-size: 17px;
        text-shadow: 0 2px 6px rgba(0,0,0,0.8);
        opacity: 0;
      }

      .state-hot .hot-label,
      .state-cold .cold-label,
      .state-mold .mold-label,
      .state-dry .dry-label {
        opacity: 1;
      }

      .hot-label {
        color: #fed7aa;
      }

      .cold-label {
        color: #dbeafe;
      }

      .mold-label {
        color: #86efac;
      }

      .dry-label {
        color: #fde68a;
      }

      .state-hot {
        box-shadow: inset 0 0 70px rgba(251, 146, 60, 0.36), 0 18px 45px rgba(0, 0, 0, 0.40);
      }

      .state-cold {
        box-shadow: inset 0 0 70px rgba(147, 197, 253, 0.38), 0 18px 45px rgba(0, 0, 0, 0.40);
      }

      .state-mold {
        box-shadow: inset 0 0 80px rgba(34, 197, 94, 0.38), 0 18px 45px rgba(0, 0, 0, 0.40);
      }

      .state-dry {
        box-shadow: inset 0 0 70px rgba(250, 204, 21, 0.28), 0 18px 45px rgba(0, 0, 0, 0.40);
      }

      .dom-flow {
        position: absolute;
        inset: 0;
        overflow: hidden;
        border-radius: 14px;
      }

      .dom-flow i {
        position: absolute;
        left: 12px;
        width: 126px;
        height: 4px;
        border-radius: 999px;
        opacity: 0;
        animation: domFlowMove 1.35s infinite ease-in-out;
      }

      .dom-flow i:nth-child(1) { top: 72px; animation-delay: 0s; }
      .dom-flow i:nth-child(2) { top: 112px; animation-delay: 0.18s; }
      .dom-flow i:nth-child(3) { top: 152px; animation-delay: 0.36s; }
      .dom-flow i:nth-child(4) { top: 192px; animation-delay: 0.54s; }

      .heating .dom-flow i {
        opacity: 0.85;
        background: linear-gradient(90deg, transparent, #f87171, transparent);
      }

      .cooling .dom-flow i {
        opacity: 0.85;
        background: linear-gradient(90deg, transparent, #60a5fa, transparent);
      }

      .dom-hum-text {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 72px;
        text-align: center;
        color: #e9d5ff;
        font-weight: 900;
        opacity: 0;
      }

      .humidifying .dom-hum-text,
      .dehumidifying .dom-hum-text {
        opacity: 1;
      }

      .dom-damper {
        position: absolute;
        left: 20px;
        right: 20px;
        bottom: 28px;
        height: 5px;
        border-radius: 999px;
        background: #86efac;
        opacity: 0;
      }

      .damper-on .dom-damper {
        opacity: 1;
        animation: damperShake 0.25s infinite alternate;
      }

      .dom-weather-layer {
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        overflow: hidden;
      }

      .dom-weather-layer span {
        position: absolute;
        top: -40px;
        font-size: 24px;
        animation-name: weatherFall;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }

      .dom-weather-layer.heat span {
        color: #fb923c;
        text-shadow: 0 0 18px rgba(251, 146, 60, 0.7);
      }

      .dom-weather-layer.rain span {
        color: #38bdf8;
        font-size: 24px;
      }

      .dom-weather-layer.snow span {
        color: #dbeafe;
        text-shadow: 0 0 14px rgba(219, 234, 254, 0.8);
      }

      @keyframes weatherFall {
        from { transform: translateY(-40px); opacity: 0; }
        10% { opacity: 1; }
        to { transform: translateY(560px); opacity: 0; }
      }

      @keyframes domFlowMove {
        from { transform: translateX(-36px); }
        50% { transform: translateX(36px); }
        to { transform: translateX(-36px); }
      }

      @keyframes damperShake {
        from { transform: translateX(-5px); }
        to { transform: translateX(5px); }
      }
    `;
    document.head.appendChild(style);
  }

  let layer = panel.querySelector(".dom-visual-layer");

  if (!layer) {
    layer = document.createElement("div");
    layer.className = "dom-visual-layer";

    const windowSpans = "<span></span>".repeat(28);

    layer.innerHTML = `
      <div class="dom-weather-layer" id="domWeatherLayer"></div>

      <div class="dom-building normal-building" id="normalDomBuilding">
        <div class="dom-window-grid">${windowSpans}</div>
        <div class="dom-env-label hot-label">고온</div>
        <div class="dom-env-label cold-label">냉해</div>
        <div class="dom-env-label mold-label">곰팡이</div>
        <div class="dom-env-label dry-label">건조</div>
        <div class="dom-mold-spores"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
        <div class="dom-mold-spores"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
        <div class="dom-plant">
          <div class="dom-stem"></div>
          <div class="dom-leaf leaf-left"></div>
          <div class="dom-leaf leaf-right"></div>
          <div class="dom-leaf leaf-top"></div>
          <div class="dom-pot"></div>
          <div class="dom-plant-health"><div class="dom-plant-health-fill"></div><div class="dom-plant-health-text">100%</div></div>
        </div>
        <div class="dom-heat-meter">외부 가열 중</div><div class="dom-building-title">일반 건물</div>
      </div>

      <div class="dom-building pid-building" id="pidDomBuilding">
        <div class="dom-system-labels">
          <div class="cool">냉난방</div>
          <div class="hum">습도제어</div>
          <div class="damper">제진장치</div>
        </div>
        <div class="dom-window-grid">${windowSpans}</div>
        <div class="dom-env-label hot-label">고온</div>
        <div class="dom-env-label cold-label">냉해</div>
        <div class="dom-env-label mold-label">곰팡이</div>
        <div class="dom-env-label dry-label">건조</div>
        <div class="dom-flow"><i></i><i></i><i></i><i></i></div>
        <div class="dom-hum-text">습도 제어</div>
        <div class="dom-damper"></div>
        <div class="dom-plant">
          <div class="dom-stem"></div>
          <div class="dom-leaf leaf-left"></div>
          <div class="dom-leaf leaf-right"></div>
          <div class="dom-leaf leaf-top"></div>
          <div class="dom-pot"></div>
        </div>
        <div class="dom-heat-meter">제어 중</div><div class="pid-limit-badge">PID 한계</div><div class="dom-building-title">PID 제어 건물</div>
      </div>
    `;

    panel.appendChild(layer);

    const weatherLayer = layer.querySelector("#domWeatherLayer");

    for (let i = 0; i < 50; i++) {
      const item = document.createElement("span");
      item.style.left = `${Math.random() * 100}%`;
      item.style.animationDuration = `${2.2 + Math.random() * 2.8}s`;
      item.style.animationDelay = `${Math.random() * 3.2}s`;
      weatherLayer.appendChild(item);
    }
  }

  return layer;
}

function classForEnvState(state) {
  if (state === "hot") return "state-hot";
  if (state === "cold") return "state-cold";
  if (state === "mold") return "state-mold";
  if (state === "dry") return "state-dry";
  return "";
}

function plantClass(plantHealth) {
  if (plantHealth <= 35) {
    return "dead-plant";
  }

  if (plantHealth <= 72) {
    return "weak-plant";
  }

  return "";
}


function updateDomHealthBar(buildingElement, health) {
  const fill = buildingElement.querySelector(".dom-plant-health-fill");
  const text = buildingElement.querySelector(".dom-plant-health-text");

  if (!fill || !text) {
    return;
  }

  const value = clamp(health, 0, 100);

  fill.style.width = value.toFixed(0) + "%";
  text.textContent = value.toFixed(0) + "%";

  if (value > 70) {
    fill.style.background = "linear-gradient(90deg, #22c55e, #84cc16)";
  } else if (value > 35) {
    fill.style.background = "linear-gradient(90deg, #f59e0b, #facc15)";
  } else {
    fill.style.background = "linear-gradient(90deg, #dc2626, #f97316)";
  }
}

function updateMoldIntensity(buildingElement, building) {
  const spores = buildingElement.querySelectorAll(".dom-mold-spores span");

  if (!spores.length) {
    return;
  }

  const moldPower = clamp((building.hum - 68) / 28, 0, 1);

  spores.forEach((spore, index) => {
    const scale = 0.55 + moldPower * 1.65 + (index % 3) * 0.12;
    spore.style.opacity = String(0.15 + moldPower * 0.85);
    spore.style.width = (8 + moldPower * 12 + (index % 4)) + "px";
    spore.style.height = (8 + moldPower * 12 + (index % 4)) + "px";
    spore.style.animationDuration = (6.4 - moldPower * 2.8) + "s";
    spore.style.transform = "scale(" + scale.toFixed(2) + ")";
  });
}

function updateWeatherSpeed(weatherLayer) {
  const intensity = Math.max(rainIntensity, snowIntensity);
  const duration = Math.max(0.55, 2.4 - intensity * 1.55);

  weatherLayer.style.setProperty("--fall-speed", duration.toFixed(2) + "s");

  weatherLayer.classList.toggle("heavy", intensity > 0.55);
}

function updateDomVisualLayer() {
  const layer = ensureDomVisualLayer();

  if (!layer) {
    return;
  }

  const normalEl = layer.querySelector("#normalDomBuilding");
  const pidEl = layer.querySelector("#pidDomBuilding");
  const weatherLayer = layer.querySelector("#domWeatherLayer");

  if (!normalEl || !pidEl || !weatherLayer) {
    return;
  }

  const normalAngle = clamp(normal.angle, -0.52, 0.52) * 57.3;
  const pidAngle = clamp(pid.angle, -0.30, 0.30) * 57.3;

  normalEl.style.transform = `rotate(${normalAngle}deg)`;
  pidEl.style.transform = `rotate(${pidAngle}deg)`;

  normalEl.className = `dom-building normal-building ${classForEnvState(normal.envState)} ${plantClass(normal.plantHealth)}`;
  pidEl.className = `dom-building pid-building ${classForEnvState(pid.envState)} ${plantClass(pid.plantHealth)}`;

  if (pidLimitReached) {
    pidEl.classList.add("pid-limit");
  }

  if (pid.tempOutput > 0.22) {
    pidEl.classList.add("heating");
  }

  if (pid.tempOutput < -0.22) {
    pidEl.classList.add("cooling");
  }

  const humText = pidEl.querySelector(".dom-hum-text");

  if (pid.humOutput > 0.22) {
    pidEl.classList.add("humidifying");
    if (humText) humText.textContent = "가습 작동";
  }

  if (pid.humOutput < -0.22) {
    pidEl.classList.add("dehumidifying");
    if (humText) humText.textContent = "제습 작동";
  }

  if (Math.abs(pid.vibOutput) > 0.20) {
    pidEl.classList.add("damper-on");
  }

  updateDomHealthBar(normalEl, normal.plantHealth);
  updateDomHealthBar(pidEl, pid.plantHealth);
  updateMoldIntensity(normalEl, normal);
  updateMoldIntensity(pidEl, pid);

  weatherLayer.className = "dom-weather-layer";

  if (running && envMode.includes("폭염")) {
    weatherLayer.classList.add("heat");
    weatherLayer.querySelectorAll("span").forEach(item => item.textContent = "☀");
  } else if (running && envMode.includes("폭우")) {
    weatherLayer.classList.add("rain");
    weatherLayer.querySelectorAll("span").forEach(item => item.textContent = "╱");
  } else if (running && envMode.includes("폭설")) {
    weatherLayer.classList.add("snow");
    weatherLayer.querySelectorAll("span").forEach(item => item.textContent = "❄");
  } else if (running && envMode.includes("복합")) {
    weatherLayer.classList.add("rain");
    weatherLayer.querySelectorAll("span").forEach((item, index) => {
      item.textContent = index % 2 === 0 ? "☀" : "╱";
    });
  } else {
    weatherLayer.querySelectorAll("span").forEach(item => item.textContent = "");
  }

  updateWeatherSpeed(weatherLayer);
}

function loop(timestamp) {
  if (!lastTimestamp) {
    lastTimestamp = timestamp;
  }

  let dt = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  dt = Math.min(dt, 0.03);

  updateSimulation(dt);

  if (experimentPage.classList.contains("active")) {
    drawScene();
    drawGraphs();
    updateDomVisualLayer();
    updateDomVisualLayer();
  }

  requestAnimationFrame(loop);
}

resizeCanvases();
resetSimulation();
ensureDomVisualLayer();
updateDomVisualLayer();
requestAnimationFrame(loop);
