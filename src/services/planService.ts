import { userHelpers, type UserModel } from "@/models/types";
import {
  getOwnActiveProjectCount,
  getSharedActiveProjectCount,
} from "./projectService";

/** Port of plan_service.dart */

export const FREE_PLAN = "free";
export const VIP_PLAN = "vip";
export const FREE_OWN_PROJECT_LIMIT = 10;
export const FREE_SHARED_PROJECT_LIMIT = 10;

export function hasPremiumStorage(user: UserModel): boolean {
  return userHelpers.canUsePremiumStorage(user);
}

export async function validateProjectCreation(user: UserModel): Promise<string | null> {
  if (!userHelpers.isFree(user)) return null;
  const ownCount = await getOwnActiveProjectCount(user.id);
  if (ownCount >= FREE_OWN_PROJECT_LIMIT) {
    return `Free-Plan Limit erreicht: maximal ${FREE_OWN_PROJECT_LIMIT} eigene Projekte.`;
  }
  return null;
}

export async function validateSharedProjectAcceptance(
  user: UserModel
): Promise<string | null> {
  if (!userHelpers.isFree(user)) return null;
  const sharedCount = await getSharedActiveProjectCount(user.id);
  if (sharedCount >= FREE_SHARED_PROJECT_LIMIT) {
    return `Free-Plan Limit erreicht: maximal ${FREE_SHARED_PROJECT_LIMIT} geteilte Projekte.`;
  }
  return null;
}

export function premiumStorageMessage(): string {
  return "Das ist ein Premium-Feature (Datei-Uploads & öffentliche Links). Bitte kontaktiere einen Administrator für ein Upgrade.";
}
