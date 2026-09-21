export function parseCliArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

export function monthIntervalsSince(admissionDate: string, until = new Date()): Array<{ start: string; end: string }> {
  const start = new Date(`${admissionDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Invalid admission date: ${admissionDate}`);
  }

  const intervals: Array<{ start: string; end: string }> = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const limit = new Date(until.getFullYear(), until.getMonth(), 1);

  while (cursor <= limit) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    intervals.push({
      start: toDateOnly(monthStart < start ? start : monthStart),
      end: toDateOnly(monthEnd > until ? until : monthEnd)
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return intervals;
}

export function dayIntervalsSince(admissionDate: string, maxDays: number, until = new Date()): Array<{ start: string; end: string }> {
  const start = new Date(`${admissionDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Invalid admission date: ${admissionDate}`);
  }
  if (!Number.isInteger(maxDays) || maxDays < 1) {
    throw new Error(`Invalid maxDays: ${maxDays}`);
  }

  const intervals: Array<{ start: string; end: string }> = [];
  let cursor = start;
  const limit = new Date(until.getFullYear(), until.getMonth(), until.getDate());

  while (cursor <= limit) {
    const end = new Date(cursor);
    end.setDate(end.getDate() + maxDays - 1);
    intervals.push({
      start: toDateOnly(cursor),
      end: toDateOnly(end > limit ? limit : end)
    });
    cursor = new Date(end);
    cursor.setDate(cursor.getDate() + 1);
  }

  return intervals;
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toRhidDate(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateOnly}`);
  }
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

export function parseRhidJsonDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/\/Date\((-?\d+)/);
  if (!match) return value.includes("T") ? value.slice(0, 10) : value;
  return toDateOnly(new Date(Number(match[1])));
}
