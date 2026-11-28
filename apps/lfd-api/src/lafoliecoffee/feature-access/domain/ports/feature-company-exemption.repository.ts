import type { FeatureCompanyExemption } from "../feature-company-exemption.js";

/** Une exemption par société retirée, telle qu'elle était. */
export interface RemovedCompanyExemption {
  readonly companyName: string;
}

/** Port d'**écriture** des exemptions par société. */
export abstract class FeatureCompanyExemptionRepository {
  /**
   * Ajoute la société, **si elle n'y est pas** : rend `false` quand la clé
   * l'exemptait déjà, sans rien écrire.
   */
  abstract addIfAbsent(exemption: FeatureCompanyExemption): Promise<boolean>;

  /**
   * Retire la société de la liste de cette clé. La clé n'est pas confrontée
   * au catalogue : c'est ainsi qu'on retire une ligne restée sous une clé
   * disparue ou qui ne s'exempte plus par société.
   *
   * @returns ce qui a été retiré, ou `null` si rien ne correspondait.
   */
  abstract remove(key: string, companyId: string): Promise<RemovedCompanyExemption | null>;
}
