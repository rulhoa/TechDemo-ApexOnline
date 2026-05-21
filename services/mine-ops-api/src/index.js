import fs from "node:fs";
import express from "express";
import { trace } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

const serviceName = process.env.SERVICE_NAME || "mine-ops-api";
const otlpBase = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://otel-collector:4318";
const stateFilePath = process.env.STATE_FILE_PATH || "/shared/state/current.json";
const port = Number(process.env.PORT || 3000);

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: `${otlpBase}/v1/traces` }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: `${otlpBase}/v1/metrics` }),
    exportIntervalMillis: 5000
  }),
  instrumentations: [getNodeAutoInstrumentations()]
});

await sdk.start();

const app = express();
const meter = trace.getTracer("mine-ops-api");

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

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: serviceName });
});

app.get("/dispatch/status", async (_req, res) => {
  const state = readScenarioState();
  const span = meter.startSpan("dispatch.status");
  try {
    // #region agent log
    fetch("http://localhost:7590/ingest/8526e009-7538-494e-8eac-6574907566d0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4e2fc" },
      body: JSON.stringify({
        sessionId: "d4e2fc",
        runId: "pre-fix",
        hypothesisId: "H2",
        location: "services/mine-ops-api/src/index.js:53",
        message: "dispatch_status_requested",
        data: { scenarioId: state.scenarioId, phase: state.phase, scenarioName: state.scenarioName },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    const fleetResp = await fetch(`${process.env.FLEET_URL}/fleet/status`);
    const maintResp = await fetch(`${process.env.MAINT_URL}/maintenance/status`);
    // #region agent log
    fetch("http://localhost:7590/ingest/8526e009-7538-494e-8eac-6574907566d0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4e2fc" },
      body: JSON.stringify({
        sessionId: "d4e2fc",
        runId: "pre-fix",
        hypothesisId: "H3",
        location: "services/mine-ops-api/src/index.js:67",
        message: "dispatch_dependency_status",
        data: { fleetOk: fleetResp.ok, fleetStatus: fleetResp.status, maintOk: maintResp.ok, maintStatus: maintResp.status },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion

    if (!fleetResp.ok || !maintResp.ok) {
      throw new Error("dependency_unavailable");
    }

    const payload = {
      status: "ok",
      scenario: state,
      fleet: await fleetResp.json(),
      maintenance: await maintResp.json()
    };
    // #region agent log
    fetch("http://localhost:7590/ingest/8526e009-7538-494e-8eac-6574907566d0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d4e2fc" },
      body: JSON.stringify({
        sessionId: "d4e2fc",
        runId: "pre-fix",
        hypothesisId: "H3",
        location: "services/mine-ops-api/src/index.js:84",
        message: "dispatch_payload_composed",
        data: { status: payload.status, fleetStatus: payload.fleet?.status, maintenanceStatus: payload.maintenance?.status },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    logEvent("dispatch_status_ok", { scenario_id: state.scenarioId, phase: state.phase });
    res.json(payload);
  } catch (error) {
    logEvent("dispatch_status_error", {
      scenario_id: state.scenarioId,
      phase: state.phase,
      probable_cause: state.scenarioName,
      error: error.message
    });
    res.status(503).json({ status: "degraded", scenario: state, error: error.message });
  } finally {
    span.end();
  }
});

app.listen(port, () => {
  logEvent("service_started", { port });
});
