export interface ParsedSportFormat {
  sportName: string;
  category: string;
  team: string;
  gender: string;
  generalFormat: string;
}

const TEAM_TOKEN =
  "INDIVIDUAL\\s*/\\s*TEAM|INDIVIDUAL\\s*/\\s*DOUBLES|OPEN\\s*/\\s*INDIVIDUAL|INDIVIDUAL|PAIRS|SINGLES|TEAM";
const GENDER_TOKEN = "MALE\\s*&\\s*FEMALE|MALE\\s*/\\s*FEMALE|FEMALE|MALE|MIXED";
const CATEGORY_START =
  "\\d+\\s*Years?\\s*&?\\s*Over|Under\\s*\\d+|Over\\s*\\d+|Open(?=[A-Z]|\\s|$)|Male\\s*\\(|Ladies\\s*\\(|Female\\s*\\(|\\d+\\s*-\\s*\\d+";

function normalizeText(text: string): string {
  return text.replace(/\r/g, "\n").replace(/\t/g, " ").replace(/ +/g, " ").trim();
}

export function normalizeSportKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isFooterLine(line: string): boolean {
  return /^(version\b|note:|organizers?|fof 2026|an event with less|subject to change|sportcategory|game formats)/i.test(
    line
  );
}

function buildLines(text: string): string[] {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isFooterLine(line));
}

function isSportPrefix(line: string, sportName: string): boolean {
  const raw = line.toUpperCase();
  const sport = sportName.toUpperCase();
  if (!raw.startsWith(sport)) return false;
  const next = raw.slice(sport.length);
  if (!next) return true;
  if (!/^[A-Z]/.test(next)) return true;
  return /^(U\d|OPEN|OVER|\d)/.test(next);
}

function splitSportFromRow(row: string, sportNames: string[] = []): { sportName: string; rest: string } | null {
  const sortedNames = [...sportNames].sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    if (!isSportPrefix(row, name)) continue;
    return { sportName: name, rest: row.slice(name.length).trim() };
  }

  const match = row.match(new RegExp(`^(.+?)(${CATEGORY_START})`, "i"));
  if (!match?.[1]?.trim()) return null;
  const sportName = match[1].trim();
  if (sportName.length > 60) return null;
  return { sportName, rest: row.slice(match[1].length).trim() };
}

function reconstructRows(lines: string[], sportNames: string[]): string[] {
  const rows: string[] = [];
  let current = "";

  for (const line of lines) {
    if (/^An Event with Less/i.test(line)) break;
    const startsSport = Boolean(splitSportFromRow(line, sportNames));
    if (startsSport) {
      if (current) rows.push(current);
      current = line;
    } else if (current) {
      current = `${current} ${line}`;
    }
  }

  if (current) rows.push(current);
  return rows;
}

function parseGluedFormatLine(sportName: string, line: string): ParsedSportFormat | null {
  const raw = line.toUpperCase().startsWith(sportName.toUpperCase())
    ? line.slice(sportName.length)
    : line.replace(new RegExp(`^${escapeRegex(sportName)}`, "i"), "");
  const rest = raw.trim();
  if (!rest) return null;

  const structured = rest.match(new RegExp(`^(.*?)(${TEAM_TOKEN})\\s*(${GENDER_TOKEN})?(.*)$`, "i"));
  if (structured) {
    return {
      sportName,
      category: structured[1].trim(),
      team: structured[2].replace(/\s+/g, " ").toUpperCase(),
      gender: structured[3] ? structured[3].replace(/\s+/g, " ").toUpperCase() : "",
      generalFormat: structured[4].trim(),
    };
  }

  return {
    sportName,
    category: rest,
    team: "",
    gender: "",
    generalFormat: "",
  };
}

function findRowForSport(rows: string[], sportName: string, allSportNames: string[]): string | null {
  const longerNames = allSportNames.filter(
    (name) => normalizeSportKey(name) !== normalizeSportKey(sportName) && name.length > sportName.length
  );

  for (const row of rows) {
    if (!isSportPrefix(row, sportName)) continue;
    if (longerNames.some((name) => isSportPrefix(row, name))) continue;
    return row;
  }

  return null;
}

export function parseFormatForSport(
  text: string,
  sportName: string,
  allSportNames: string[] = [sportName]
): ParsedSportFormat | null {
  const names = allSportNames.length > 0 ? allSportNames : [sportName];
  const rows = reconstructRows(buildLines(text), names);
  const row = findRowForSport(rows, sportName, names);
  if (!row) return null;
  return parseGluedFormatLine(sportName, row);
}

export function parseAllFormatsFromText(text: string, sportNames: string[] = []): ParsedSportFormat[] {
  const rows = reconstructRows(buildLines(text), sportNames);
  const results: ParsedSportFormat[] = [];
  const used = new Set<string>();

  for (const row of rows) {
    const split = splitSportFromRow(row, sportNames);
    if (!split) continue;
    const parsed = parseGluedFormatLine(split.sportName, row);
    if (!parsed) continue;
    const key = normalizeSportKey(parsed.sportName);
    if (!key || used.has(key)) continue;
    used.add(key);
    results.push(parsed);
  }

  return results;
}

export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (data: Buffer) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);
  return data.text || "";
}
