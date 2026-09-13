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

function normalizeText(text: string): string {
  return text.replace(/\r/g, "\n").replace(/\t/g, " ").replace(/ +/g, " ").trim();
}

export function normalizeSportKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLines(text: string): string[] {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !/^SPORT$/i.test(line) &&
        !/^CATEGORY$/i.test(line) &&
        !/^FORMAT$/i.test(line) &&
        !/SPORTCATEGORY/i.test(line) &&
        !/GAMES FORMATS/i.test(line) &&
        !/^VERSION\b/i.test(line) &&
        !/^SUBJECT TO CHANGE/i.test(line)
    );
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

function isContinuationLine(line: string): boolean {
  return /^(under|over|open\b|individual|team|pairs|singles|male|female|mixed|\d+\s*years|\d+\s*[-–to]|u\d|years|ladies|gentlemen|best of|one-|note|version|subject|an event|organizers?|for more)/i.test(
    line.trim()
  );
}

function isLikelySportStart(line: string, sportNames: string[]): boolean {
  if (sportNames.some((name) => isSportPrefix(line, name))) return true;
  if (isContinuationLine(line)) return false;
  if (/^(an event|note|organizers?|version|subject to|for more|game formats|fof)/i.test(line)) {
    return false;
  }
  const hasStructure = new RegExp(
    `\\b(${TEAM_TOKEN}|${GENDER_TOKEN}|under\\s+\\d|over\\s+\\d|\\d+\\s*years)`,
    "i"
  ).test(line);
  const shortTitle = line.length <= 40 && !/[,:]/.test(line);
  return hasStructure || shortTitle;
}

function reconstructRows(lines: string[], sportNames: string[]): string[] {
  const sortedNames = [...sportNames].sort((a, b) => b.length - a.length);
  const rows: string[] = [];
  let current = "";

  for (const line of lines) {
    if (/^An Event with Less/i.test(line)) break;
    const startsSport = isLikelySportStart(line, sortedNames);
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

function splitSportFromRow(row: string, sportNames: string[]): string {
  const sortedNames = [...sportNames].sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    if (isSportPrefix(row, name)) return name;
  }
  const split = row.match(
    /^(.*?)(\s+(?:under|over|open\b|\d+\s*years|\d+\s*[-–]|\d+\s*to|u\d|individual|team|pairs|singles))/i
  );
  return (split?.[1] || row).trim();
}

function parseGluedFormatLine(sportName: string, line: string): ParsedSportFormat | null {
  const raw = line.toUpperCase().startsWith(sportName.toUpperCase())
    ? line.slice(sportName.length)
    : line.replace(new RegExp(`^${escapeRegex(sportName)}`, "i"), "");
  const rest = raw.trim();
  if (!rest) return null;

  const genderRegex = new RegExp(GENDER_TOKEN, "i");
  const genderMatch = genderRegex.exec(rest);
  const beforeGender = (genderMatch ? rest.slice(0, genderMatch.index) : rest).trim();
  const afterGender = genderMatch ? rest.slice(genderMatch.index + genderMatch[0].length).trim() : "";

  const teamRegex = new RegExp(`(${TEAM_TOKEN})$`, "i");
  const teamMatch = beforeGender.match(teamRegex);

  return {
    sportName,
    category: (teamMatch ? beforeGender.slice(0, teamMatch.index) : beforeGender).trim(),
    team: teamMatch ? teamMatch[1].replace(/\s+/g, " ").toUpperCase() : "",
    gender: genderMatch ? genderMatch[0].replace(/\s+/g, " ").toUpperCase() : "",
    generalFormat: afterGender.replace(/\s+/g, " "),
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

export function parseAllFormatsFromText(text: string, sportNames: string[]): ParsedSportFormat[] {
  const names = sportNames;
  const rows = reconstructRows(buildLines(text), names);
  const results: ParsedSportFormat[] = [];
  const used = new Set<string>();

  for (const row of rows) {
    const sportName = splitSportFromRow(row, names);
    if (!sportName) continue;
    const parsed = parseGluedFormatLine(sportName, row);
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
