import { loadConfig } from "./config.js";
import { dayIntervalsSince, parseCliArgs, parseRhidJsonDate, toDateOnly } from "./dates.js";
import { maintenanceRowsToCsv, maintenanceRowsToHtml, safeFilename } from "./format.js";
import { RhidClient } from "./rhidClient.js";
import { EmployeeCandidate, PontoInterval, ReportRequest } from "./types.js";

async function main(): Promise<void> {
  const command = process.argv[2] || "help";
  const args = parseCliArgs(process.argv.slice(3));
  const config = loadConfig();
  const client = await RhidClient.create(config);

  try {
    if (command === "investigate") {
      await client.investigateNetwork();
      return;
    }

    if (command === "employees") {
      const employees = await client.extractEmployees();
      console.log(JSON.stringify(employees, null, 2));
      return;
    }

    if (command === "endpoints") {
      const calls = await client.discoverEndpoints();
      console.log(JSON.stringify(calls, null, 2));
      return;
    }

    if (command === "ponto") {
      const interval: PontoInterval = {
        employeeId: typeof args["employee-id"] === "string" ? args["employee-id"] : undefined,
        employeeName: typeof args["employee-name"] === "string" ? args["employee-name"] : undefined,
        start: requireArg(args, "start"),
        end: requireArg(args, "end")
      };
      const calls = await client.openPontoDiario(interval);
      console.log(JSON.stringify(calls, null, 2));
      return;
    }

    if (command === "hour-bank") {
      const date = requireArg(args, "date");
      const employeeIds = readMany(args, "employee-id");
      const output = typeof args.output === "string" ? args.output : `exports/hour-bank-${date}.json`;
      const count = await client.exportHourBankSnapshot(date, output, employeeIds);
      console.log(JSON.stringify({ output, records: count }, null, 2));
      return;
    }

    if (command === "report-hour-bank") {
      const format = readFormat(args);
      const request: ReportRequest = {
        employeeIds: readMany(args, "employee-id"),
        start: requireArg(args, "start"),
        end: requireArg(args, "end"),
        format,
        report: "extrato_banco_horas",
        saldoBanco: "TODOS"
      };
      if (request.employeeIds.length !== 1) {
        throw new Error("For periods longer than one month, RHID requires one employee per report. Pass exactly one --employee-id.");
      }
      const { guid, numPeople } = await client.requestReport(request);
      await client.waitForReport(guid);
      const extension = format === "PDF2" ? "pdf" : format.toLowerCase();
      const output = typeof args.output === "string" ? args.output : `downloads/extrato-banco-horas-${request.employeeIds[0]}-${request.start}-${request.end}.${extension}`;
      if (format === "HTML") {
        throw new Error("Automatic HTML download is not implemented. Use PDF, PDF2, or CSV.");
      }
      await client.downloadReport(guid, format === "PDF2" ? "PDF" : format, output);
      console.log(JSON.stringify({ output, guid, numPeople }, null, 2));
      return;
    }

    if (command === "maintenance-csv") {
      const employeeId = requireArg(args, "employee-id");
      const start = requireArg(args, "start");
      const end = requireArg(args, "end");
      const output = typeof args.output === "string" ? args.output : `exports/manutencao-${employeeId}-${start}-${end}.csv`;
      const count = await client.exportMaintenanceRows(employeeId, start, end, output, maintenanceRowsToCsv);
      console.log(JSON.stringify({ output, records: count }, null, 2));
      return;
    }

    if (command === "export-all") {
      const today = typeof args.until === "string" ? args.until : toDateOnly(new Date());
      const csvDays = typeof args["csv-days"] === "string" ? Number(args["csv-days"]) : readLegacyChunkDays(args, 93);
      const pdfDays = typeof args["pdf-days"] === "string" ? Number(args["pdf-days"]) : readLegacyChunkDays(args, 366);
      const onlyEmployeeIds = new Set(readMany(args, "employee-id"));
      const skipPdf = Boolean(args["skip-pdf"]);
      const skipCsv = Boolean(args["skip-csv"]);
      const skipRhidPdf = Boolean(args["skip-rhid-pdf"]) || true;
      const employees = (await client.extractEmployees())
        .filter((employee) => employee.id && employee.name && employee.admissionDate)
        .filter((employee, index, list) => list.findIndex((item) => item.id === employee.id) === index)
        .filter((employee) => onlyEmployeeIds.size === 0 || onlyEmployeeIds.has(String(employee.id)));

      const results = [];
      for (const employee of employees) {
        const employeeResult = await exportEmployeeFromAdmission(client, employee, today, { csvDays, pdfDays }, { skipPdf, skipCsv, skipRhidPdf });
        results.push(employeeResult);
        console.log(JSON.stringify(employeeResult, null, 2));
      }
      console.log(JSON.stringify({ employees: results.length, until: today, csvDays, pdfDays }, null, 2));
      return;
    }

    printHelp();
  } finally {
    await client.close();
  }
}

function readMany(args: Record<string, string | boolean>, name: string): string[] {
  const value = args[name];
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function readFormat(args: Record<string, string | boolean>): "PDF" | "PDF2" | "CSV" | "HTML" {
  const value = typeof args.format === "string" ? args.format.toUpperCase() : "PDF";
  if (!["PDF", "PDF2", "CSV", "HTML"].includes(value)) {
    throw new Error("--format must be PDF, PDF2, CSV, or HTML.");
  }
  return value as "PDF" | "PDF2" | "CSV" | "HTML";
}

function readLegacyChunkDays(args: Record<string, string | boolean>, fallback: number): number {
  return typeof args["chunk-days"] === "string" ? Number(args["chunk-days"]) : fallback;
}

function requireArg(args: Record<string, string | boolean>, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required argument: --${name}`);
  }
  return value;
}

function printHelp(): void {
  console.log(`
Usage:
  npm run investigate
  npm run endpoints
  npm run employees
  npm run hour-bank -- --date 2026-05-20
  npm run report-hour-bank -- --employee-id ID --start 2026-01-01 --end 2026-01-31
  npm run maintenance-csv -- --employee-id ID --start 2026-01-01 --end 2026-03-31
  npm run export-all -- --csv-days 93 --pdf-days 366
  npm run ponto -- --employee-id ID --start 2026-01-01 --end 2026-01-31
  npm run ponto -- --employee-name "Nome" --start 2026-01-01 --end 2026-01-31
`);
}

async function exportEmployeeFromAdmission(
  client: RhidClient,
  employee: EmployeeCandidate,
  until: string,
  days: { csvDays: number; pdfDays: number },
  options: { skipPdf: boolean; skipCsv: boolean; skipRhidPdf: boolean }
): Promise<Record<string, unknown>> {
  const id = String(employee.id);
  const name = employee.name || `funcionario-${id}`;
  const admissionDate = parseRhidJsonDate(employee.admissionDate);
  if (!admissionDate) {
    throw new Error(`Employee ${id} has no admission date.`);
  }

  const baseDir = safeFilename(`${id}-${name}`);
  const csvIntervals = dayIntervalsSince(admissionDate, days.csvDays, new Date(`${until}T00:00:00`));
  const pdfIntervals = dayIntervalsSince(admissionDate, days.pdfDays, new Date(`${until}T00:00:00`));
  let pdfs = 0;
  let csvs = 0;

  for (const interval of csvIntervals) {
    const rows = await client.getMaintenanceRows(id, interval.start, interval.end);
    if (!options.skipCsv) {
      const csvPath = `exports/${baseDir}/manutencao_${interval.start}_a_${interval.end}.csv`;
      await client.exportMaintenanceRows(id, interval.start, interval.end, csvPath, () => maintenanceRowsToCsv(rows));
      csvs += 1;
    }
    if (!options.skipPdf) {
      const pdfPath = `downloads/${baseDir}/apuracao_ponto_${interval.start}_a_${interval.end}.pdf`;
      await client.renderPdf(maintenanceRowsToHtml(rows, `${name} - Apuracao de ponto ${interval.start} a ${interval.end}`), pdfPath);
      pdfs += 1;
    }
  }

  for (const interval of pdfIntervals) {
    if (!options.skipRhidPdf) {
      const request: ReportRequest = {
        employeeIds: [id],
        start: interval.start,
        end: interval.end,
        format: "PDF",
        report: "extrato_banco_horas",
        saldoBanco: "TODOS"
      };
      const { guid } = await client.requestReport(request);
      await client.waitForReport(guid);
      const pdfPath = `downloads/${baseDir}/extrato_banco_horas_${interval.start}_a_${interval.end}.pdf`;
      await client.downloadReport(guid, "PDF", pdfPath);
    }
  }

  return {
    id,
    name,
    admissionDate,
    until,
    csvIntervals: csvIntervals.length,
    pdfIntervals: pdfIntervals.length,
    pdfs,
    csvs
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
