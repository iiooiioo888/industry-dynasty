import { FACTORY_TYPES } from '../buildings/catalog.js';
import type { RecipeId } from '../production/recipes.js';
import type { WorldState } from '../world/state.js';
import { researcherPointGain } from './staff.js';

export interface ResearchProject {
  readonly id: string;
  readonly nameZh: string;
  readonly blurb: string;
  readonly cost: number;
  readonly recipeId: RecipeId;
}

export interface ResearchProgress {
  readonly points: number;
  readonly unlocked: readonly string[];
}

export const RESEARCH_PROJECTS: Record<string, ResearchProject> = {
  'civic-tools': {
    id: 'civic-tools',
    nameZh: '手持工具組',
    blurb: '把零件和鐵錠收成城市買得動的工具。',
    cost: 8,
    recipeId: 'pack-tool-kit',
  },
  'civic-wire': {
    id: 'civic-wire',
    nameZh: '導電線捲',
    blurb: '銅錠捲成線材，門市與港區都收。',
    cost: 8,
    recipeId: 'pack-wire-spool',
  },
  'civic-seal': {
    id: 'civic-seal',
    nameZh: '密封塗料',
    blurb: '樹脂配矽片，賣給趕工的城區。',
    cost: 6,
    recipeId: 'pack-sealant',
  },
};

export const RESEARCH_PROJECT_LIST: readonly ResearchProject[] = [
  RESEARCH_PROJECTS['civic-tools'],
  RESEARCH_PROJECTS['civic-wire'],
  RESEARCH_PROJECTS['civic-seal'],
];

export function emptyResearch(): ResearchProgress {
  return { points: 0, unlocked: [] };
}

export function readResearch(state: WorldState): ResearchProgress {
  return state.research ?? emptyResearch();
}

export function hasCompletedLab(state: WorldState): boolean {
  const playerId = state.localPlayerId;
  return Object.values(state.sites).some(
    (site) =>
      site.phase === 'complete' &&
      site.ownerId === playerId &&
      FACTORY_TYPES[site.factoryTypeId].kind === 'lab',
  );
}

/** 暫停時模擬時鐘不走，這裡也不會被叫到。沒有在職研發員則不改狀態。 */
export function accrueResearch(state: WorldState): WorldState {
  const gain = researcherPointGain(state);
  if (gain <= 0) {
    return state;
  }
  const research = readResearch(state);
  return { ...state, research: { ...research, points: research.points + gain } };
}

export function unlockResearch(state: WorldState, projectId: string): WorldState {
  const project = RESEARCH_PROJECTS[projectId];
  if (!project || !hasCompletedLab(state)) {
    return state;
  }
  const research = readResearch(state);
  if (research.unlocked.includes(projectId) || research.points < project.cost) {
    return state;
  }
  return {
    ...state,
    research: {
      points: research.points - project.cost,
      unlocked: [...research.unlocked, projectId],
    },
  };
}
