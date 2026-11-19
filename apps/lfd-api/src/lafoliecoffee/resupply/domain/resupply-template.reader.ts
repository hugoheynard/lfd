import type { ResupplyTemplateSnapshot } from "./resupply-template.js";

/** Port de **lecture** de la bibliothèque des modèles d'un point. */
export abstract class ResupplyTemplateReader {
  /** Les modèles actifs du point, par nom. */
  abstract listActive(siteId: string): Promise<readonly ResupplyTemplateSnapshot[]>;
}
