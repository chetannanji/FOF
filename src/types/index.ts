import { Role, Gender, ParticipantStatus, SportType, MedalType } from "@prisma/client";

export type { Role, Gender, ParticipantStatus, SportType, MedalType };

export interface NextOfKin {
  firstName: string;
  middleName?: string;
  lastName: string;
  phone: string;
}

export interface AgeLimit {
  min?: number;
  max?: number;
}

export interface JwtPayload {
  userId: string;
  username: string;
  role: Role;
}



