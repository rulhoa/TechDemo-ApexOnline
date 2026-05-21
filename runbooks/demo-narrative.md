# Helix Otel - Mining Demo Narrative

This demo continuously cycles through eight realistic mining IT failure patterns every 24 hours.

Each scenario uses a 3-step phase model:
1. Failure injection
2. Automatic recovery
3. Stable validation window

Use `GET /dispatch/status` on `mine-ops-api` to generate live user flow traffic while observing Helix for correlated metrics, logs, and traces.
