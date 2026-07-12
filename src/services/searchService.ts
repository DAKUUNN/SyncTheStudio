import { getProjects, getSharedProjects } from "./projectService";
import { getCustomers } from "./customerService";
import { getTasks } from "./taskService";
import type { ProjectModel, CustomerModel, TaskModel } from "@/models/types";

/** Port of search_service.dart — client-side filtering across all entities. */

export interface SearchResults {
  projects: ProjectModel[];
  customers: CustomerModel[];
  tasks: { task: TaskModel; projectName: string }[];
}

export function emptySearchResults(): SearchResults {
  return { projects: [], customers: [], tasks: [] };
}

export function searchResultCount(results: SearchResults): number {
  return results.projects.length + results.customers.length + results.tasks.length;
}

export async function searchAll(search: string, userId: string): Promise<SearchResults> {
  if (!search) return emptySearchResults();
  const lowerQuery = search.toLowerCase();

  const [ownProjects, sharedProjects, customers] = await Promise.all([
    getProjects(userId),
    getSharedProjects(userId),
    getCustomers(userId),
  ]);

  const projectMap = new Map<string, ProjectModel>();
  for (const project of ownProjects) projectMap.set(project.id, project);
  for (const project of sharedProjects) projectMap.set(project.id, project);
  const projects = [...projectMap.values()];

  const matchedProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(lowerQuery) ||
      (project.customerName?.toLowerCase().includes(lowerQuery) ?? false) ||
      project.projectType.toLowerCase().includes(lowerQuery)
  );

  const matchedCustomers = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(lowerQuery) ||
      (customer.email?.toLowerCase().includes(lowerQuery) ?? false) ||
      (customer.discord?.toLowerCase().includes(lowerQuery) ?? false) ||
      (customer.instagram?.toLowerCase().includes(lowerQuery) ?? false)
  );

  const projectTasks = await Promise.all(
    projects.map(async (project) => ({ project, tasks: await getTasks(project.id) }))
  );

  const matchedTasks: { task: TaskModel; projectName: string }[] = [];
  for (const { project, tasks } of projectTasks) {
    for (const task of tasks) {
      if (
        task.title.toLowerCase().includes(lowerQuery) ||
        (task.description?.toLowerCase().includes(lowerQuery) ?? false)
      ) {
        matchedTasks.push({ task, projectName: project.name });
      }
    }
  }

  return { projects: matchedProjects, customers: matchedCustomers, tasks: matchedTasks };
}
