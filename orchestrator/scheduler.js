import fs from "node:fs";
import path from "node:path";

const stateFilePath = process.env.STATE_FILE_PATH || "/shared/state/current.json";
const failuresFilePath = process.env.FAILURES_FILE_PATH || "/app/profiles/failures.json";
const minutesPerHour = Number(process.env.MINUTES_PER_HOUR || 60);

const phaseNames = ["failure", "recovery", "stable"];

function loadFailures() {
  try {
    return JSON.parse(fs.readFileSync(failuresFilePath, "utf8"));
  } catch {
    return [];
  }
}

const failures = loadFailures();
if (failures.length !== 8) {
  console.error("expected 8 scenarios in failures.json");
  process.exit(1);
}

function writeState() {
  const now = new Date();
  const forcedIndexRaw = process.env.DEMO_SCENARIO_INDEX;
  const forcedPhaseRaw = process.env.DEMO_SCENARIO_PHASE;

  let payload;
  if (forcedIndexRaw !== undefined && forcedIndexRaw !== "") {
    const idx = Math.min(Math.max(Number(forcedIndexRaw), 0), failures.length - 1);
    const failure = failures[idx];
    const phase =
      forcedPhaseRaw && phaseNames.includes(forcedPhaseRaw) ? forcedPhaseRaw : "failure";
    payload = {
      generatedAt: now.toISOString(),
      scenarioId: failure.id,
      scenarioName: failure.name,
      targetService: failure.service,
      symptom: failure.symptom,
      phase,
      slot: idx,
      hourInCycle: -1,
      demoOverride: true
    };
  } else {
    const totalDemoHours = Math.floor(
      (now.getUTCHours() * 60 + now.getUTCMinutes()) / minutesPerHour
    );
    const scenarioIndex = Math.floor((totalDemoHours % 24) / 3);
    const phaseIndex = totalDemoHours % 3;
    const failure = failures[scenarioIndex];
    payload = {
      generatedAt: now.toISOString(),
      scenarioId: failure.id,
      scenarioName: failure.name,
      targetService: failure.service,
      symptom: failure.symptom,
      phase: phaseNames[phaseIndex],
      slot: scenarioIndex,
      hourInCycle: totalDemoHours % 24
    };
  }

  fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
  fs.writeFileSync(stateFilePath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ service: "failure-orchestrator", message: "state_updated", ...payload }));
}

writeState();
setInterval(writeState, 60 * 1000);
