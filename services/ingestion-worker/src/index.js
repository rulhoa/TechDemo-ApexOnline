import fs from "node:fs";
import { trace } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

const serviceName = process.env.SERVICE_NAME || "ingestion-worker";
const otlpBase = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://otel-collector:4318";
const stateFilePath = process.env.STATE_FILE_PATH || "/shared/state/current.json";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: `${otlpBase}/v1/traces` }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: `${otlpBase}/v1/metrics` }),
    exportIntervalMillis: 5000
  }),
  instrumentations: [getNodeAutoInstrumentations()]
});

await sdk.start();
const tracer = trace.getTracer(serviceName);

function readScenarioState() {
  try {
    return JSON.parse(fs.readFileSync(stateFilePath, "utf8"));
  } catch {
    return { scenarioId: 0, scenarioName: "healthy", phase: "stable" };
  }
}

function logEvent(message, data = {}) {
  const active = trace.getActiveSpan();
  const traceId = active?.spanContext()?.traceId || null;
  console.log(JSON.stringify({ service: serviceName, trace_id: traceId, message, ...data }));
}

function burnCpu(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    Math.sqrt(Math.random() * 1000);
  }
}

setInterval(() => {
  const span = tracer.startSpan("worker.tick");
  const state = readScenarioState();
  try {
    // #region agent log
    fetch("http://localhost:7590/ingest/8526e009-7538-494e-8eac-6574907566d0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4e2fc" },
      body: JSON.stringify({
        sessionId: "d4e2fc",
        runId: "pre-fix",
        hypothesisId: "H4",
        location: "services/ingestion-worker/src/index.js:58",
        message: "worker_tick_entered",
        data: { scenarioId: state.scenarioId, scenarioName: state.scenarioName, phase: state.phase },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    if (state.scenarioName === "broker_backlog" && state.phase === "failure") {
      logEvent("ingestion_backlog_rising", { scenario_id: state.scenarioId, probable_cause: state.scenarioName });
    }

    if (state.scenarioName === "worker_cpu_saturation" && state.phase === "failure") {
      burnCpu(1200);
      logEvent("worker_cpu_saturation", { scenario_id: state.scenarioId, probable_cause: state.scenarioName });
    }

    if (state.scenarioName === "db_disk_io_throttle" && state.phase === "failure") {
      logEvent("worker_db_write_lag", { scenario_id: state.scenarioId, probable_cause: state.scenarioName });
    }

    if (state.phase === "recovery") {
      logEvent("worker_recovery_action", {
        scenario_id: state.scenarioId,
        action_taken: "throughput_restored"
      });
    }

    logEvent("worker_tick_complete", { scenario_id: state.scenarioId, phase: state.phase });
    // #region agent log
    fetch("http://localhost:7590/ingest/8526e009-7538-494e-8eac-6574907566d0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4e2fc" },
      body: JSON.stringify({
        sessionId: "d4e2fc",
        runId: "pre-fix",
        hypothesisId: "H4",
        location: "services/ingestion-worker/src/index.js:88",
        message: "worker_tick_completed",
        data: { scenarioId: state.scenarioId, phase: state.phase },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
  } finally {
    span.end();
  }
}, 5000);

logEvent("service_started", {});
