import { prisma } from "../index";

export type ProfileFreezeStatus = {
  frozen: boolean;
  freezeDate: Date | null;
};

export async function getProfileFreezeStatus(): Promise<ProfileFreezeStatus> {
  const settings = await prisma.settings.findFirst();
  if (!settings?.profileFreezeDate) {
    return { frozen: false, freezeDate: null };
  }

  const now = new Date();
  const freezeDate = new Date(settings.profileFreezeDate);
  freezeDate.setHours(23, 59, 59, 999);

  return {
    frozen: now > freezeDate,
    freezeDate: settings.profileFreezeDate,
  };
}

export function formatProfileFreezeMessage(
  freezeDate: Date | null,
  action = "Profile updates"
): string {
  const formatted = freezeDate
    ? new Date(freezeDate).toLocaleDateString()
    : "the freeze date";
  return `${action} are no longer allowed after ${formatted}. Please contact an administrator if you need to make changes.`;
}
