export {
  computeLogisticsEfficiency,
  countAdjacentCompleteFactories,
  getSiteLogisticsView,
  type LogisticsEfficiencyView,
} from './adjacency.js';
export {
  FACTORY_TYPES,
  FACTORY_TYPE_LIST,
  type FactoryTypeDef,
  type FactoryTypeId,
} from './catalog.js';
export {
  advanceConstruction,
  applyCancelBuild,
  applyDemolish,
  applyStartBuild,
  canBuildOnParcel,
  getSiteForParcel,
  validateStartBuild,
} from './build-logic.js';
export type { CompleteSite, ConstructingSite, ParcelSite, SitePhase } from './site.js';
