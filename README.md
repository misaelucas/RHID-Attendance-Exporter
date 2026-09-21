# RHID Attendance Exporter

An authorized investigation and automation project for safely exporting employee attendance and hour-bank data from RHID.

## Security and privacy

- Never commit usernames, passwords, cookies, tokens, or real PDFs.
- Use this project only with authorized company access.
- Do not share files from `exports/`, `downloads/`, `logs/`, or `.auth/` without first reviewing them for personal data.
- Do not add compressed archives. They can bypass visual review and may contain reports or personal data.
- If a credential has been exposed in a chat, issue, commit, or screenshot, rotate it before continuing.

See [SECURITY.md](SECURITY.md) for the repository's complete security and privacy guidance.

## Technology

- Node.js and TypeScript
- Playwright with Chromium
- `.env` files for local credentials

This stack makes it practical to investigate single-page applications with `#/...` routes, capture network requests, and automate downloads after the required workflow has been identified.

## Installation

```bash
npm install
npm run install:browsers
```

Create a local `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Then provide your RHID credentials:

```env
RHID_EMAIL=
RHID_PASSWORD=
HEADLESS=false
RHID_BASE_URL=https://www.rhid.com.br
```

## Commands

Inspect application requests while navigating RHID:

```bash
npm run investigate
```

Extract an initial sample of visible employees and related network responses:

```bash
npm run employees
```

List the XHR and Fetch endpoints observed on the main screens without saving complete responses:

```bash
npm run endpoints
```

Open the daily attendance screen for a date range:

```bash
npm run ponto -- --employee-id EMPLOYEE_ID --start 2026-01-01 --end 2026-01-31
```

Export an hour-bank snapshot for a specific date:

```bash
npm run hour-bank -- --date 2026-05-20
```

Generate and download an employee's hour-bank statement as a PDF:

```bash
npm run report-hour-bank -- --employee-id EMPLOYEE_ID --start 2026-01-01 --end 2026-01-31
```

This command uses RHID's native `extrato_banco_horas` report. It remains available for investigation, but it is not the primary data source because RHID may generate an empty report even when the attendance review screen shows absences and overtime.

Export the detailed table from `#/manutencao_ponto` as CSV:

```bash
npm run maintenance-csv -- --employee-id EMPLOYEE_ID --start 2026-01-01 --end 2026-03-31
```

Export every employee from their admission date onward, creating local CSV and PDF files from the `#/manutencao_ponto` data:

```bash
npm run export-all -- --csv-days 93 --pdf-days 366
```

Useful options:

```bash
npm run export-all -- --employee-id EMPLOYEE_ID --csv-days 93 --pdf-days 366
npm run export-all -- --skip-pdf
npm run export-all -- --skip-csv
npm run export-all -- --until 2026-05-20
```

The current scripts are investigative. By default, they avoid saving complete network responses to reduce the risk of leaking personal data. Once the correct endpoints are confirmed, the captured behavior can be implemented as API clients with pagination, employee filters, and monthly downloads.

## Current findings

- Login: `POST /v2/login.svc/`
- Active employee list: `GET /v2/customerdb/person.svc/a_status/ativo?...`
- Simplified active employee list: `GET /v2/customerdb/person.svc/a_ativo`
- Hour bank by date: `GET /v2/customerdb/person.svc/person_banco_horas?date=YYYYMMDD`
- Detailed attendance-review data: `POST /v2/report.svc/apuracao_ponto_salva_tabela`
- Report generation: `POST /v2/report.svc/ponto`
- Report-processing status: `GET /v2/customerdb/notify.svc/specificGuid/?guid=<GUID>`
- File download: `POST /v2/customerdb/notify.svc/save_file/?format=PDF&guid=<GUID>`

During testing, the hour-bank endpoint accepted dates older than three months. This suggests the three-month restriction may exist in the attendance-review interface rather than in that endpoint. The attendance-review endpoint returns much richer daily data but fails for long date ranges, so `export-all` uses 93-day chunks by default. Final PDFs are generated locally from that data, with each day's balance calculated as `daytime overtime + nighttime overtime - absence/late time`.

## Recommended investigation workflow

1. Run `npm run investigate` with `HEADLESS=false`.
2. Sign in and navigate to `#/list/person`.
3. Review the terminal output for requests that appear to load employees.
4. Open `#/ponto_diario`, then filter one employee over a short date range.
5. Record endpoint methods, payloads, and parameters in `docs/investigation.md` without copying sensitive values.
6. Use `npm run hour-bank` for balance snapshots and `npm run report-hour-bank` for native RHID PDFs.

## Known limitations

- The interface may restrict queries to the previous three months. If the backend enforces the same restriction, request an official historical export or endpoint access from RHID.
- Screen selectors may change. The project therefore prioritizes capturing network requests and uses visual automation only as supporting behavior.
- Long reports should be divided by employee and date range to reduce the risk of request rejection, timeouts, or report-queue congestion.
