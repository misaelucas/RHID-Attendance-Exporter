import { MaintenanceRow } from "./types.js";

export function minutesToHHMM(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function rhidTimeToHHMM(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const raw = String(Math.trunc(value)).padStart(4, "0");
  return `${raw.slice(0, -2)}:${raw.slice(-2)}`;
}

export function safeFilename(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "sem-nome";
}

export function maintenanceRowsToCsv(rows: MaintenanceRow[]): string {
  const headers = [
    "id_funcionario",
    "nome",
    "data",
    "marcacao_1",
    "marcacao_2",
    "marcacao_3",
    "marcacao_4",
    "total_normais",
    "total_noturno",
    "dia_falta",
    "falta_atraso",
    "abono",
    "extra_diurna",
    "extra_noturna",
    "saldo_dia_calculado",
    "saldo_acumulado_periodo_calculado",
    "saldo_banco_rhid",
    "folga",
    "feriado",
    "exclusoes"
  ];

  const lines = [headers.join(",")];
  let runningBalance = 0;
  for (const row of rows) {
    const dayBalance = calculateDayBalance(row);
    runningBalance += dayBalance;
    const marks = (row.listAfdtManutencao || [])
      .filter((mark): mark is Record<string, unknown> => Boolean(mark))
      .map((mark) => rhidTimeToHHMM(mark.hora));
    const exclusions = (row.listAfdtManutencao || [])
      .filter((mark): mark is Record<string, unknown> => Boolean(mark))
      .filter((mark) => mark._typeClassification === "X")
      .map((mark) => rhidTimeToHHMM(mark.hora))
      .filter(Boolean)
      .join(" | ");

    const values = [
      row.idPerson,
      row.name,
      formatDateTimeStr(row.dateTimeStr),
      marks[0],
      marks[1],
      marks[2],
      marks[3],
      minutesToHHMM(row.horasTotalNaoExtra),
      minutesToHHMM(row.horasTotalNoturno),
      row.faltaDiaInteiro ? "sim" : "",
      minutesToHHMM(row.horasFaltaAtraso),
      minutesToHHMM(row.minutosAbono),
      minutesToHHMM(row.extraDiurna),
      minutesToHHMM(row.extraNoturna),
      minutesToHHMM(dayBalance),
      minutesToHHMM(runningBalance),
      minutesToHHMM(row.saldoBancoFinalDia),
      row.folga ? "sim" : "",
      row.holiday || "",
      exclusions
    ];
    lines.push(values.map(csvEscape).join(","));
  }

  return `${lines.join("\n")}\n`;
}

export function maintenanceRowsToHtml(rows: MaintenanceRow[], title: string): string {
  let runningBalance = 0;
  const bodyRows = rows.map((row) => {
    const dayBalance = calculateDayBalance(row);
    runningBalance += dayBalance;
    const marks = (row.listAfdtManutencao || [])
      .filter((mark): mark is Record<string, unknown> => Boolean(mark))
      .map((mark) => rhidTimeToHHMM(mark.hora));

    return `<tr>
      <td>${escapeHtml(formatDateTimeStr(row.dateTimeStr))}</td>
      <td>${escapeHtml(marks[0] || "")}</td>
      <td>${escapeHtml(marks[1] || "")}</td>
      <td>${escapeHtml(marks[2] || "")}</td>
      <td>${escapeHtml(marks[3] || "")}</td>
      <td>${escapeHtml(minutesToHHMM(row.horasTotalNaoExtra))}</td>
      <td>${escapeHtml(minutesToHHMM(row.horasFaltaAtraso))}</td>
      <td>${escapeHtml(minutesToHHMM(row.extraDiurna))}</td>
      <td>${escapeHtml(minutesToHHMM(row.extraNoturna))}</td>
      <td>${escapeHtml(minutesToHHMM(dayBalance))}</td>
      <td>${escapeHtml(minutesToHHMM(runningBalance))}</td>
      <td>${row.faltaDiaInteiro ? "sim" : ""}</td>
      <td>${row.folga ? "sim" : ""}</td>
    </tr>`;
  }).join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 10px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { margin-bottom: 14px; color: #444; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 4px 5px; text-align: right; }
    th:first-child, td:first-child { text-align: left; }
    th { background: #f2f4f7; font-weight: 700; }
    tr:nth-child(even) td { background: #fbfbfc; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Gerado a partir de /v2/report.svc/apuracao_ponto_salva_tabela. Saldo calculado = extra diurna + extra noturna - falta/atraso.</div>
  <table>
    <thead>
      <tr>
        <th>Data</th><th>Ent. 1</th><th>Sai. 1</th><th>Ent. 2</th><th>Sai. 2</th>
        <th>Normais</th><th>Falta/Atraso</th><th>Extra D.</th><th>Extra N.</th>
        <th>Saldo Dia</th><th>Saldo Periodo</th><th>Falta</th><th>Folga</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
}

export function calculateDayBalance(row: MaintenanceRow): number {
  const extraDiurna = typeof row.extraDiurna === "number" ? row.extraDiurna : 0;
  const extraNoturna = typeof row.extraNoturna === "number" ? row.extraNoturna : 0;
  const faltaAtraso = typeof row.horasFaltaAtraso === "number" ? row.horasFaltaAtraso : 0;
  return extraDiurna + extraNoturna - faltaAtraso;
}

function formatDateTimeStr(value: string | undefined): string {
  if (!value || value.length < 8) return value || "";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
