import fs from "node:fs";
import express from "express";
import { trace } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

const serviceName = process.env.SERVICE_NAME || "maintenance-workorder-service";
const otlpBase = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://otel-collector:4318";
const stateFilePath = process.env.STATE_FILE_PATH || "/shared/state/current.json";
const port = Number(process.env.PORT || 3002);

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
const leakBucket = [];

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

const app = express();
app.get("/health", (_req, res) => res.json({ status: "ok", service: serviceName }));

app.get("/maintenance/status", (_req, res) => {
  const state = readScenarioState();
  const span = tracer.startSpan("maintenance.status");
  try {
    if (state.scenarioName === "maintenance_memory_pressure" && state.phase === "failure") {
      leakBucket.push(new Array(10000).fill("workorder-memory-pressure"));
      throw new Error("memory_pressure_detected");
    }

    if (state.scenarioName === "connector_token_expiry" && state.phase === "failure") {
      throw new Error("external_connector_auth_failed");
    }

    if (state.phase !== "failure") {
      leakBucket.length = 0;
    }

    logEvent("maintenance_status_ok", { scenario_id: state.scenarioId, phase: state.phase });
    res.json({ status: "ok", open_workorders: 12, scenario: state });
  } catch (error) {
    logEvent("maintenance_status_error", {
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

app.listen(port, () => logEvent("service_started", { port }));
