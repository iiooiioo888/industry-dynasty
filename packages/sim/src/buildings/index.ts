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
  constructionRemainingTicks,
  getSiteForParcel,
  validateStartBuild,
} from './build-logic.js';
export type { CompleteSite, ConstructingSite, ParcelSite, SitePhase } from './site.js';
export {
  BUILD_MATERIALS,
  consumeBuildMaterials,
  describeBuildMaterials,
  grantBuildMaterials,
  hasBuildMaterials,
  missingBuildMaterials,
  type BuildMaterial,
} from './materials.js';
