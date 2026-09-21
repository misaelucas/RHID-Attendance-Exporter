import { chromium, Page, Response } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { RhidConfig, EmployeeCandidate, NetworkCallSummary, PontoInterval, HourBankRecord, ReportRequest, MaintenanceRow } from "./types.js";
import { redactText, redactUrl } from "./redact.js";
import { toRhidDate } from "./dates.js";

const PERSON_URL_PARTS = ["person", "people", "employee", "funcionario", "colaborador"];
const PONTO_URL_PARTS = ["ponto", "daily", "time", "timesheet", "bank", "saldo", "hour", "report", "pdf"];

export class RhidClient {
  private constructor(
    private readonly config: RhidConfig,
    private readonly browser: Awaited<ReturnType<typeof chromium.launch>>,
    private readonly page: Page
  ) {}

  static async create(config: RhidConfig): Promise<RhidClient> {
    const browser = await chromium.launch({ headless: config.headless });
    const page = await browser.newPage({ acceptDownloads: true });
    page.setDefaultTimeout(30_000);
    return new RhidClient(config, browser, page);
  }

  async close(): Promise<void> {
    await this.browser.close();
  }

  async login(): Promise<void> {
    await this.page.goto(`${this.config.baseUrl}/`, { waitUntil: "domcontentloaded" });

    const email = this.page.locator('input[type="email"], input[name*="email" i], input[placeholder*="email" i], input[name*="login" i]').first();
    const password = this.page.locator('input[type="password"]').first();

    await email.fill(this.config.email);
    await password.fill(this.config.password);

    const submit = this.page.locator('button[type="submit"], input[type="submit"], button:has-text("Entrar"), button:has-text("Login"), button:has-text("Acessar")').first();
    await Promise.all([
      this.page.waitForLoadState("networkidle").catch(() => undefined),
      submit.click()
    ]);
  }

  async investigateNetwork(durationMs = 180_000): Promise<void> {
    this.attachNetworkLogger([...PERSON_URL_PARTS, ...PONTO_URL_PARTS]);
    await this.login();
    await this.page.goto(`${this.config.baseUrl}/v2/#/list/person`, { waitUntil: "domcontentloaded" });
    console.log("Navegador aberto para investigacao. Use a interface por ate 3 minutos.");
    await this.page.waitForTimeout(durationMs);
  }

  async discoverEndpoints(): Promise<NetworkCallSummary[]> {
    const calls = new Map<string, NetworkCallSummary>();
    this.page.on("response", async (response) => {
      const request = response.request();
      const resourceType = request.resourceType();
      if (!["xhr", "fetch"].includes(resourceType)) return;

      const summary = await summarizeResponse(response);
      const key = `${summary.method} ${summary.url}`;
      calls.set(key, summary);
    });

    await this.login();
    await this.page.goto(`${this.config.baseUrl}/v2/#/list/person`, { waitUntil: "domcontentloaded" });
    await this.page.waitForTimeout(10_000);
    await this.page.goto(`${this.config.baseUrl}/v2/#/ponto_diario`, { waitUntil: "domcontentloaded" });
    await this.page.waitForTimeout(10_000);

    return [...calls.values()].sort((a, b) => a.url.localeCompare(b.url));
  }

  async extractEmployees(): Promise<EmployeeCandidate[]> {
    const candidates = new Map<string, EmployeeCandidate>();
    const relevantResponses: unknown[] = [];

    this.page.on("response", async (response) => {
      if (!matchesAny(response.url(), PERSON_URL_PARTS)) return;
      const json = await safeJson(response);
      if (json) relevantResponses.push(json);
    });

    await this.login();
    await this.page.goto(`${this.config.baseUrl}/v2/#/list/person`, { waitUntil: "domcontentloaded" });
    await this.page.waitForTimeout(8_000);

    for (const employee of await this.extractEmployeesFromDom()) {
      candidates.set(employeeKey(employee), employee);
    }

    for (const employee of extractEmployeesFromJson(relevantResponses)) {
      candidates.set(employeeKey(employee), employee);
    }

    return [...candidates.values()];
  }

  async openPontoDiario(interval: PontoInterval): Promise<NetworkCallSummary[]> {
    const calls: NetworkCallSummary[] = [];
    this.page.on("response", async (response) => {
      if (!matchesAny(response.url(), PONTO_URL_PARTS)) return;
      calls.push(await summarizeResponse(response));
    });

    await this.login();
    await this.page.goto(`${this.config.baseUrl}/v2/#/ponto_diario`, { waitUntil: "domcontentloaded" });
    await this.page.waitForTimeout(5_000);
    await this.tryFillDateRange(interval.start, interval.end);
    await this.trySelectEmployee(interval);
    await this.trySubmitFilters();
    await this.page.waitForLoadState("networkidle").catch(() => undefined);
    return calls;
  }

  async getHourBankSnapshot(date: string, employeeIds: string[] = []): Promise<HourBankRecord[]> {
    await this.ensureLoggedIn();
    const params = new URLSearchParams({ date: toRhidDate(date) });
    for (const employeeId of employeeIds) {
      params.append("people", employeeId);
    }

    const response = await this.apiGetJson<HourBankRecord[]>(`customerdb/person.svc/person_banco_horas?${params.toString()}`);
    if (!Array.isArray(response)) {
      throw new Error("Unexpected RHID hour-bank response format.");
    }
    return response;
  }

  async exportHourBankSnapshot(date: string, outputPath: string, employeeIds: string[] = []): Promise<number> {
    const records = await this.getHourBankSnapshot(date, employeeIds);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
    return records.length;
  }

  async getMaintenanceRows(employeeId: string, start: string, end: string): Promise<MaintenanceRow[]> {
    await this.ensureLoggedIn();
    const payload = {
      idPerson: [Number.isNaN(Number(employeeId)) ? employeeId : Number(employeeId)],
      ini: toRhidDate(start),
      fim: toRhidDate(end),
      afdChanges: [],
      alertId: [],
      pagina: 1
    };
    const response = await this.apiPostJson<MaintenanceRow[]>("report.svc/apuracao_ponto_salva_tabela", payload);
    if (!Array.isArray(response)) {
      throw new Error("Unexpected RHID maintenance response format.");
    }
    const error = response.find((row) => typeof row.error === "string" && row.error);
    if (error?.error) {
      throw new Error(String(error.error));
    }
    return response;
  }

  async exportMaintenanceRows(employeeId: string, start: string, end: string, outputPath: string, toCsv: (rows: MaintenanceRow[]) => string): Promise<number> {
    const rows = await this.getMaintenanceRows(employeeId, start, end);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, toCsv(rows), "utf8");
    return rows.length;
  }

  async requestReport(request: ReportRequest): Promise<{ guid: string; numPeople?: number }> {
    await this.ensureLoggedIn();
    const payload = {
      pdfCartaoPontoParameters: {
        listCompanyStr: [],
        listDepartmentStr: [],
        listCostCenterStr: [],
        listPersonRoleStr: [],
        listIdStr: request.employeeIds,
        listShiftStr: []
      },
      ini: toRhidDate(request.start),
      fim: toRhidDate(request.end),
      formatoSaida: request.format,
      saldoBanco: request.saldoBanco || "TODOS",
      relatorio: request.report,
      status: 1
    };

    const response = await this.apiPostJson<{ guid?: string; error?: string; numPeople?: number }>("report.svc/ponto", payload);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.guid) {
      throw new Error("RHID did not return a report guid.");
    }
    return { guid: response.guid, numPeople: response.numPeople };
  }

  async waitForReport(guid: string, timeoutMs = 10 * 60_000): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const status = await this.apiGetJson<{ percent: number; error?: string }>(`customerdb/notify.svc/specificGuid/?guid=${encodeURIComponent(guid)}`);
      if (status.percent === 100) return;
      if (status.percent === -1) {
        throw new Error(status.error || "RHID report processing failed.");
      }
      await this.page.waitForTimeout(1_000);
    }
    throw new Error(`Timed out waiting for report ${guid}.`);
  }

  async downloadReport(guid: string, format: "PDF" | "CSV" | "TXT" | "ZIP", outputPath: string): Promise<void> {
    await this.ensureLoggedIn();
    const headers = await this.getAuthHeaders();
    const response = await this.page.request.post(`${this.config.baseUrl}/v2/customerdb/notify.svc/save_file/?format=${format}&guid=${encodeURIComponent(guid)}`, {
      headers
    });
    if (!response.ok()) {
      throw new Error(`Failed to download report ${guid}: HTTP ${response.status()}`);
    }
    const bytes = await response.body();
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes);
  }

  async renderPdf(html: string, outputPath: string): Promise<void> {
    await mkdir(dirname(outputPath), { recursive: true });
    await this.page.setContent(html, { waitUntil: "load" });
    await this.page.pdf({
      path: outputPath,
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "10mm", right: "8mm", bottom: "10mm", left: "8mm" }
    });
  }

  private attachNetworkLogger(keywords: string[]): void {
    this.page.on("response", async (response) => {
      if (!matchesAny(response.url(), keywords)) return;
      const summary = await summarizeResponse(response);
      console.log(JSON.stringify(summary, null, 2));
    });
  }

  private async extractEmployeesFromDom(): Promise<EmployeeCandidate[]> {
    const rows = this.page.locator("table tbody tr, [role='row'], .ui-grid-row, .ag-row, mat-row");
    const count = await rows.count().catch(() => 0);
    const employees: EmployeeCandidate[] = [];

    for (let i = 0; i < Math.min(count, 200); i += 1) {
      const row = rows.nth(i);
      const text = normalizeSpaces(await row.innerText().catch(() => ""));
      if (!text || text.length < 3) continue;

      const dateMatch = text.match(/\b\d{2}\/\d{2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/);
      employees.push({
        name: inferNameFromRowText(text),
        admissionDate: dateMatch?.[0],
        source: "dom"
      });
    }

    return employees;
  }

  private async tryFillDateRange(start: string, end: string): Promise<void> {
    const inputs = this.page.locator('input[type="date"], input[placeholder*="data" i], input[name*="date" i], input[name*="data" i]');
    const count = await inputs.count().catch(() => 0);
    if (count >= 2) {
      await inputs.nth(0).fill(start).catch(() => undefined);
      await inputs.nth(1).fill(end).catch(() => undefined);
    }
  }

  private async trySelectEmployee(interval: PontoInterval): Promise<void> {
    const value = interval.employeeName || interval.employeeId;
    if (!value) return;

    const search = this.page.locator('input[placeholder*="func" i], input[placeholder*="colab" i], input[placeholder*="pessoa" i], input[aria-label*="func" i]').first();
    if (await search.count()) {
      await search.fill(value).catch(() => undefined);
      await this.page.keyboard.press("Enter").catch(() => undefined);
    }
  }

  private async trySubmitFilters(): Promise<void> {
    const button = this.page.locator('button:has-text("Pesquisar"), button:has-text("Consultar"), button:has-text("Filtrar"), button:has-text("Buscar")').first();
    if (await button.count()) {
      await button.click().catch(() => undefined);
    }
  }

  private async ensureLoggedIn(): Promise<void> {
    const hasToken = await this.page.evaluate(() => Boolean(localStorage.getItem("ngStorage-cidAccessToken"))).catch(() => false);
    if (!hasToken) {
      await this.login();
    }
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const auth = await this.page.evaluate(() => {
      const storedToken = localStorage.getItem("ngStorage-cidAccessToken");
      if (!storedToken) return null;
      const token = JSON.parse(storedToken) as string;
      const payloadPart = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
      const payload = payloadPart ? JSON.parse(window.atob(payloadPart)) : {};
      return {
        authorization: `Bearer ${token}`,
        customerId: String(payload.cidCustomerId || "")
      };
    });

    if (!auth?.authorization || !auth.customerId) {
      throw new Error("Could not read RHID auth token from browser session.");
    }

    return {
      Authorization: auth.authorization,
      "X-Cid-RHiD": auth.customerId
    };
  }

  private async apiGetJson<T>(path: string): Promise<T> {
    const headers = await this.getAuthHeaders();
    const response = await this.page.request.get(`${this.config.baseUrl}/v2/${path}`, { headers });
    if (!response.ok()) {
      throw new Error(`RHID GET ${path} failed with HTTP ${response.status()}`);
    }
    return (await response.json()) as T;
  }

  private async apiPostJson<T>(path: string, data?: unknown): Promise<T> {
    const headers = await this.getAuthHeaders();
    const response = await this.page.request.post(`${this.config.baseUrl}/v2/${path}`, {
      headers,
      data
    });
    if (!response.ok()) {
      throw new Error(`RHID POST ${path} failed with HTTP ${response.status()}`);
    }
    return (await response.json()) as T;
  }
}

async function summarizeResponse(response: Response): Promise<NetworkCallSummary> {
  const request = response.request();
  const json = await safeJson(response);
  return {
    method: request.method(),
    url: redactUrl(response.url()),
    status: response.status(),
    resourceType: request.resourceType(),
    requestPostData: redactText(request.postData()),
    responseJsonKeys: json && typeof json === "object" && !Array.isArray(json) ? Object.keys(json).slice(0, 30) : undefined
  };
}

async function safeJson(response: Response): Promise<unknown | undefined> {
  const contentType = response.headers()["content-type"] || "";
  if (!contentType.includes("json")) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function extractEmployeesFromJson(values: unknown[]): EmployeeCandidate[] {
  const employees: EmployeeCandidate[] = [];
  for (const value of values) {
    walkJson(value, (item) => {
      const id = pickString(item, ["id", "personId", "employeeId", "funcionarioId", "colaboradorId"]);
      const name = pickString(item, ["name", "nome", "employeeName", "personName", "nomeFuncionario"]);
      const admissionDate = pickString(item, ["admissionDate", "dataAdmissao", "dtAdmissao", "admissao"]);
      if (id || name || admissionDate) {
        employees.push({
          id,
          name,
          admissionDate,
          source: "network",
          rawKeys: Object.keys(item).slice(0, 30)
        });
      }
    });
  }
  return employees;
}

function walkJson(value: unknown, visit: (record: Record<string, unknown>) => void): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, visit);
    return;
  }

  const record = value as Record<string, unknown>;
  visit(record);
  for (const child of Object.values(record)) walkJson(child, visit);
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return undefined;
}

function matchesAny(url: string, parts: string[]): boolean {
  const lower = url.toLowerCase();
  return parts.some((part) => lower.includes(part));
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function inferNameFromRowText(text: string): string | undefined {
  const withoutDate = text.replace(/\b\d{2}\/\d{2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g, "");
  return normalizeSpaces(withoutDate).split(" ").slice(0, 6).join(" ") || undefined;
}

function employeeKey(employee: EmployeeCandidate): string {
  return employee.id || `${employee.name || "unknown"}:${employee.admissionDate || "no-date"}`;
}
