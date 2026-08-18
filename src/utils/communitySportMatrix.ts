import { ParticipantStatus } from "@prisma/client";

export interface MatrixSportColumn {
  id: string;
  name: string;
  columnKey: string;
}

export interface MatrixCommunityRow {
  communityId: string;
  communityName: string;
  counts: Record<string, number>;
}

export interface CommunitySportMatrix {
  sports: MatrixSportColumn[];
  communities: { id: string; name: string }[];
  rows: MatrixCommunityRow[];
}

type SportRow = {
  id: string;
  name: string;
  active: boolean;
  parentId: string | null;
};

function getColumnSports(sports: SportRow[]): SportRow[] {
  return [...sports].sort((a, b) => {
    const aLabel = getSportColumnLabel(a, sports);
    const bLabel = getSportColumnLabel(b, sports);
    return aLabel.localeCompare(bLabel);
  });
}

export function getSportColumnLabel(sport: SportRow, allSports: SportRow[]): string {
  if (sport.parentId) {
    const parent = allSports.find((s) => s.id === sport.parentId);
    if (parent) return `${parent.name} - ${sport.name}`;
  }
  return sport.name;
}

export function buildCommunitySportMatrix(options: {
  sports: SportRow[];
  communities: { id: string; name: string; active: boolean }[];
  participantSports: { sportId: string; communityId: string }[];
}): CommunitySportMatrix {
  const columnSports = getColumnSports(options.sports);
  const sports = columnSports.map((sport) => ({
    id: sport.id,
    name: getSportColumnLabel(sport, options.sports),
    columnKey: sport.name,
  }));

  const countMap = new Map<string, Map<string, number>>();
  for (const entry of options.participantSports) {
    if (!countMap.has(entry.communityId)) {
      countMap.set(entry.communityId, new Map());
    }
    const sportCounts = countMap.get(entry.communityId)!;
    sportCounts.set(entry.sportId, (sportCounts.get(entry.sportId) ?? 0) + 1);
  }

  const communities = [...options.communities].sort((a, b) => a.name.localeCompare(b.name));

  const rows = communities.map((community) => {
    const sportCounts = countMap.get(community.id) ?? new Map<string, number>();
    const counts: Record<string, number> = {};
    for (const sport of columnSports) {
      counts[sport.id] = sportCounts.get(sport.id) ?? 0;
    }
    return {
      communityId: community.id,
      communityName: community.name,
      counts,
    };
  });

  return {
    sports,
    communities: communities.map((c) => ({ id: c.id, name: c.name })),
    rows,
  };
}

export function matrixToSheetRows(matrix: CommunitySportMatrix): (string | number)[][] {
  const headers = ["Community", ...matrix.sports.map((s) => s.name)];
  const dataRows = matrix.rows.map((row) => [
    row.communityName,
    ...matrix.sports.map((sport) => row.counts[sport.id] ?? 0),
  ]);
  return [headers, ...dataRows];
}

export function parseMatrixStatus(value: unknown): ParticipantStatus | undefined {
  if (value === "all" || value === undefined || value === "") return undefined;
  if (value === "accepted") return ParticipantStatus.accepted;
  if (value === "pending") return ParticipantStatus.pending;
  if (value === "rejected") return ParticipantStatus.rejected;
  return ParticipantStatus.accepted;
}
