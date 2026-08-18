export interface ParsedSportFormat {
  sportName: string;
  category: string;
  team: string;
  gender: string;
  generalFormat: string;
}

const TEAM_PATTERNS = [
  "INDIVIDUAL / TEAM",
  "INDIVIDUAL / DOUBLES",
  "OPEN / INDIVIDUAL",
  "INDIVIDUAL",
  "TEAM",
  "PAIRS",
  "SINGLES",
  "OPEN",
  "DOUBLES",
];

const GENDER_PATTERNS = ["MALE & FEMALE", "MALE", "FEMALE", "MIXED"];

function normalizeText(text: string): string {
  return text.replace(/\r/g, "\n").replace(/\t/g, " ").replace(/ +/g, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPatternIndex(text: string, patterns: string[]): { index: number; match: string } | null {
  const upper = text.toUpperCase();
  let best: { index: number; match: string } | null = null;

  for (const pattern of patterns) {
    const index = upper.indexOf(pattern);
    if (index === -1) continue;
    if (!best || index < best.index || pattern.length > best.match.length) {
      best = { index, match: pattern };
    }
  }

  return best;
}

function parseFormatLine(sportName: string, line: string): ParsedSportFormat | null {
  const upperLine = line.toUpperCase();
  const upperSport = sportName.toUpperCase();
  const sportIndex = upperLine.indexOf(upperSport);
  if (sportIndex === -1) return null;

  let rest = line.slice(sportIndex + sportName.length).trim();
  if (!rest) return null;

  const teamMatch = findPatternIndex(rest, TEAM_PATTERNS);
  if (!teamMatch) {
    return {
      sportName,
      category: rest,
      team: "",
      gender: "",
      generalFormat: "",
    };
  }

  const category = rest.slice(0, teamMatch.index).trim().replace(/^[-–|]\s*/, "").replace(/\s*[-–|]\s*$/, "");
  rest = rest.slice(teamMatch.index).trim();
  const team = teamMatch.match;
  rest = rest.slice(team.length).trim().replace(/^[-–|]\s*/, "");

  const genderMatch = findPatternIndex(rest, GENDER_PATTERNS);
  let gender = "";
  let generalFormat = rest;

  if (genderMatch) {
    gender = genderMatch.match;
    generalFormat = rest.slice(genderMatch.index + gender.length).trim().replace(/^[-–|]\s*/, "");
  }

  return {
    sportName,
    category,
    team,
    gender,
    generalFormat,
  };
}

function buildLines(text: string): string[] {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^SPORT$/i.test(line) && !/^CATEGORY$/i.test(line));
}

function findLineForSport(lines: string[], sportName: string): string | null {
  const upperSport = sportName.toUpperCase();

  for (const line of lines) {
    if (line.toUpperCase().startsWith(upperSport)) {
      return line;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toUpperCase() === upperSport) {
      return [lines[i], ...lines.slice(i + 1, i + 4)].join(" ");
    }
  }

  const joined = lines.join(" ");
  const regex = new RegExp(`\\b${escapeRegex(upperSport)}\\b`, "i");
  const match = joined.match(regex);
  if (!match || match.index === undefined) return null;

  const snippet = joined.slice(match.index, match.index + 400);
  return snippet;
}

export function parseFormatForSport(text: string, sportName: string): ParsedSportFormat | null {
  const lines = buildLines(text);
  const line = findLineForSport(lines, sportName);
  if (!line) return null;
  return parseFormatLine(sportName, line);
}

export function parseAllFormatsFromText(text: string, sportNames: string[]): ParsedSportFormat[] {
  const lines = buildLines(text);
  const joined = lines.join("\n");
  const sortedNames = [...sportNames].sort((a, b) => b.length - a.length);
  const results: ParsedSportFormat[] = [];
  const used = new Set<string>();

  for (const sportName of sortedNames) {
    const line = findLineForSport(lines, sportName) || findLineForSport([joined], sportName);
    if (!line) continue;

    const parsed = parseFormatLine(sportName, line);
    if (!parsed) continue;

    const key = sportName.toUpperCase();
    if (used.has(key)) continue;
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
