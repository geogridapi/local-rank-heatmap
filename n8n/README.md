# n8n workflows

Three ready-to-import [n8n](https://n8n.io) workflows that run GeoGridAPI geo-grids on a schedule. They only use built-in nodes (HTTP Request, Gmail, Google Sheets, Slack), so they work on n8n Cloud and self-hosted n8n alike.

| Workflow | What it does |
|---|---|
| [weekly-heatmap-report-gmail.json](weekly-heatmap-report-gmail.json) | Every Monday, measures a business for a keyword and emails the PNG heatmap with the average rank, top 3 coverage, change since last week and competitors ahead. |
| [keyword-rank-tracker-google-sheets.json](keyword-rank-tracker-google-sheets.json) | Reads businesses and keywords from a Google Sheet, measures up to 50 of them in one batch and appends one row per grid. |
| [ranking-drop-alert-slack.json](ranking-drop-alert-slack.json) | Measures a business every week and posts in Slack only when its ranking drops. |

## Import

1. In n8n: **Workflows → Import from file** (or paste the JSON on the canvas).
2. Create a **Header Auth** credential named `GeoGridAPI key`: name `Authorization`, value `Bearer gga_live_…` (a free `gga_test_` key returns sample grids, handy for a first run). Select it in the HTTP Request nodes.
3. Connect Gmail, Google Sheets or Slack, and fill in the **Settings** node.

Each workflow carries sticky notes with the details. Every grid costs 1 credit per point (a 7×7 grid is 49 credits); new accounts get 500 free credits at [geogridapi.io](https://geogridapi.io/en/signup).

## How they wait for a grid

A grid takes 20 seconds to 2 minutes. The workflows create it, then check it every 20 seconds until it is completed (every minute for a batch), with a cap on the number of checks. The Sheets workflow takes up to 50 rows per run. A failed grid stops the workflow with an error and its credits are refunded. If you prefer pushes to polling, pass a `webhook_url` to the API and start a second workflow from an n8n Webhook node.

There is also a GeoGridAPI node for self-hosted n8n: [n8n-nodes-geogridapi](https://github.com/geogridapi/n8n-nodes-geogridapi).
