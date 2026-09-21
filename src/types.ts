export type RhidConfig = {
  baseUrl: string;
  email: string;
  password: string;
  headless: boolean;
};

export type EmployeeCandidate = {
  id?: string;
  name?: string;
  admissionDate?: string;
  source: "dom" | "network";
  rawKeys?: string[];
};

export type PontoInterval = {
  employeeId?: string;
  employeeName?: string;
  start: string;
  end: string;
};

export type NetworkCallSummary = {
  method: string;
  url: string;
  status?: number;
  resourceType?: string;
  requestPostData?: string;
  responseJsonKeys?: string[];
};

export type HourBankRecord = Record<string, unknown> & {
  id?: number | string;
  name?: string;
  admissionDate?: string;
  admissionDateStr?: string;
  saldoBancoHoras?: number;
  saldoBancoFinalDia?: number;
  saldoBancoHorasAjustado?: number;
  saldoNegativoBancoHoras?: number;
  saldoPositivoBancoHoras?: number;
};

export type ReportRequest = {
  employeeIds: string[];
  start: string;
  end: string;
  format: "PDF" | "PDF2" | "CSV" | "HTML";
  report: "extrato_banco_horas" | "extrato" | "cartao" | "ponto_diario";
  saldoBanco?: "TODOS" | "POSITIVO" | "NEGATIVO";
};

export type MaintenanceRow = Record<string, unknown> & {
  dateTimeStr?: string;
  name?: string;
  idPerson?: number | string;
  listAfdtManutencao?: Array<Record<string, unknown> | null>;
  horasTotalNaoExtra?: number;
  horasTotalNoturno?: number;
  horasFaltaAtraso?: number;
  minutosAbono?: number;
  extraDiurna?: number;
  extraNoturna?: number;
  saldoBancoFinalDia?: number;
  saldoBancoAjustado?: number;
  totalHorasTrabalhadas?: number;
  faltaDiaInteiro?: boolean;
  folga?: boolean;
  holiday?: string | null;
};
