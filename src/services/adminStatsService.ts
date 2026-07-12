import { collection, collectionGroup, getDocs } from "firebase/firestore";
import { db } from "@/firebase";
import { parseDate } from "@/models/types";

/** Port of admin_stats_service.dart */

export interface TopUser {
  userId: string;
  userName: string;
  projectCount: number;
  hoursTracked: number;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalCustomers: number;
  totalTimeTrackedHours: number;
  projectsByStatus: Record<string, number>;
  projectsByMonth: Record<string, number>;
  usersByRegistrationMonth: Record<string, number>;
  topUsers: TopUser[];
}

export function emptyAdminStats(): AdminStats {
  return {
    totalUsers: 0,
    activeUsers: 0,
    totalProjects: 0,
    activeProjects: 0,
    completedProjects: 0,
    totalCustomers: 0,
    totalTimeTrackedHours: 0,
    projectsByStatus: {},
    projectsByMonth: {},
    usersByRegistrationMonth: {},
    topUsers: [],
  };
}

export async function getAdminStats(): Promise<AdminStats> {
  try {
    const [usersSnapshot, projectCopiesSnapshot, customersSnapshot, timeEntriesSnapshot] =
      await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collectionGroup(db, "projects")),
        getDocs(collectionGroup(db, "customers")),
        getDocs(collectionGroup(db, "timeEntries")),
      ]);

    const totalUsers = usersSnapshot.docs.length;
    const activeUsers = usersSnapshot.docs.filter(
      (d) => d.data().isActive === true
    ).length;

    const usersById = new Map(
      usersSnapshot.docs.map((userDoc) => [
        userDoc.id,
        String(userDoc.data().username ?? "Unknown"),
      ])
    );

    let totalProjects = 0;
    let activeProjects = 0;
    let completedProjects = 0;
    const totalCustomers = customersSnapshot.docs.length;
    const projectsByStatus: Record<string, number> = {};
    const projectsByMonth: Record<string, number> = {};
    const userProjectCounts: Record<string, number> = {};
    const userTrackedHours: Record<string, number> = {};
    let totalHours = 0;

    for (const projectDoc of projectCopiesSnapshot.docs) {
      const parentUserId = projectDoc.ref.parent.parent?.id ?? "";
      const data = projectDoc.data();
      const ownerId = String(data.ownerId ?? "").trim();
      if (ownerId && parentUserId && ownerId !== parentUserId) {
        continue;
      }

      totalProjects++;
      const status = String(data.status ?? "offen");
      projectsByStatus[status] = (projectsByStatus[status] ?? 0) + 1;
      if (status === "abgeschlossen") completedProjects++;
      else activeProjects++;

      const createdAt = parseDate(data.createdAt);
      if (createdAt) {
        const monthKey = `${createdAt.getFullYear()}-${String(
          createdAt.getMonth() + 1
        ).padStart(2, "0")}`;
        projectsByMonth[monthKey] = (projectsByMonth[monthKey] ?? 0) + 1;
      }

      const effectiveOwnerId = ownerId || parentUserId;
      if (effectiveOwnerId) {
        userProjectCounts[effectiveOwnerId] = (userProjectCounts[effectiveOwnerId] ?? 0) + 1;
      }
    }

    for (const timeEntryDoc of timeEntriesSnapshot.docs) {
      const data = timeEntryDoc.data();
      const durationMinutes = Number(data.durationMinutes ?? 0);
      const derivedHours = durationMinutes > 0 ? durationMinutes / 60 : 0;
      const fallbackStart = parseDate(data.startTime);
      const fallbackEnd = parseDate(data.endTime);
      const hours =
        derivedHours > 0
          ? derivedHours
          : fallbackStart && fallbackEnd
            ? (fallbackEnd.getTime() - fallbackStart.getTime()) / 3600000
            : 0;

      totalHours += hours;
      const userId = String(data.userId ?? "").trim();
      if (userId) {
        userTrackedHours[userId] = (userTrackedHours[userId] ?? 0) + hours;
      }
    }

    const usersByRegistrationMonth: Record<string, number> = {};
    for (const userDoc of usersSnapshot.docs) {
      const createdAt = parseDate(userDoc.data().createdAt);
      if (createdAt) {
        const monthKey = `${createdAt.getFullYear()}-${String(
          createdAt.getMonth() + 1
        ).padStart(2, "0")}`;
        usersByRegistrationMonth[monthKey] =
          (usersByRegistrationMonth[monthKey] ?? 0) + 1;
      }
    }

    const topUserIds = new Set<string>([
      ...Object.keys(userProjectCounts),
      ...Object.keys(userTrackedHours),
    ]);
    const topUsers: TopUser[] = [...topUserIds].map((userId) => ({
      userId,
      userName: usersById.get(userId) ?? "Unknown",
      projectCount: userProjectCounts[userId] ?? 0,
      hoursTracked: Math.round(userTrackedHours[userId] ?? 0),
    }));
    topUsers.sort((a, b) => {
      if (b.projectCount !== a.projectCount) return b.projectCount - a.projectCount;
      return b.hoursTracked - a.hoursTracked;
    });

    return {
      totalUsers,
      activeUsers,
      totalProjects,
      activeProjects,
      completedProjects,
      totalCustomers,
      totalTimeTrackedHours: Math.round(totalHours),
      projectsByStatus,
      projectsByMonth,
      usersByRegistrationMonth,
      topUsers: topUsers.slice(0, 10),
    };
  } catch {
    return emptyAdminStats();
  }
}
