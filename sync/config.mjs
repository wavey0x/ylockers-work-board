import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PROJECTS } from './policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function configuration(env = process.env) {
  const projectNumber = Number(env.GITHUB_PROJECT_NUMBER || 2);
  if (!Number.isInteger(projectNumber) || projectNumber < 1) throw new Error('Invalid GitHub project number.');
  const repositories = (env.GITHUB_REPOSITORIES || 'yLockers/ylockers').split(',').map(v => v.trim()).filter(Boolean);
  if (!repositories.length || repositories.some(v => !/^[\w.-]+\/[\w.-]+$/.test(v))) throw new Error('Invalid source repository list.');
  return {
    githubToken: env.BOARD_GITHUB_TOKEN || '',
    org: env.GITHUB_ORG || 'yLockers',
    projectNumber,
    repositories,
    projectField: env.GITHUB_PROJECT_FIELD || 'Project',
    allowedProjects: env.PUBLIC_PROJECTS ? env.PUBLIC_PROJECTS.split(',').map(v => v.trim()).filter(Boolean) : DEFAULT_PROJECTS,
    dataDir: resolve(env.BOARD_DATA_DIR || join(root, 'data')),
  };
}
