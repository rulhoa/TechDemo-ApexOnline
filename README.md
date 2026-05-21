# Helix Otel - Mining

Podman-based OpenTelemetry demo for mining-industry IT operations, designed for Helix AIOps.

## What This Builds

- Tiered service hierarchy:
  - `mine-ops-api` (Tier 1 business service)
  - `fleet-telemetry-service`, `maintenance-workorder-service` (Tier 2 domain services)
  - `ingestion-worker`, `message-broker`, `ops-db` (Tier 3 platform services)
- `failure-orchestrator` that loops 8 scenarios over 24 hours:
  - Hour 1: failure
  - Hour 2: automatic recovery
  - Hour 3: stable period
- OpenTelemetry Collector configured to export logs, metrics, and traces to Helix, and **traces** to Grafana Tempo (`otlp/tempo` → LoadBalancer `10.2.0.55:4317`). If your Podman host cannot reach that IP, adjust `otel/otel-collector-config.yaml` or use `kubectl port-forward` and point the exporter at `localhost:<local-port>`.

## Run With Podman

```bash
podman-compose up --build -d
```

Generate traffic:

```bash
watch -n 2 'curl -s http://localhost:3000/dispatch/status | jq'
```

Run smoke checks:

```bash
bash scripts/smoke.sh
```

Run the full stack pinned to **scenario 1** (`db_pool_exhaustion`) in **failure** phase (dispatch returns 503 until you clear overrides):

```bash
bash scripts/run-scenario1-failure.sh
```

Restore the automatic 24-hour scheduler (clear demo overrides on the orchestrator):

```bash
env -u DEMO_SCENARIO_INDEX -u DEMO_SCENARIO_PHASE podman-compose up -d --force-recreate failure-orchestrator
```

## Main Files

- `podman-compose.yml`
- `otel/otel-collector-config.yaml`
- `profiles/failures.json`
- `profiles/service-map.yaml`
- `orchestrator/scheduler.js`
- `docs/plan.md`