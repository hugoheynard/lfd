import type { FeatureExemption } from "../feature-exemption.js";

/** Ce qu'un ajout a produit : la ligne qui porte l'adresse, neuve ou non. */
export interface ExemptionAddOutcome {
  readonly id: string;
  /** `false` quand l'adresse était déjà exemptée pour cette clé. */
  readonly created: boolean;
}

/** Une exemption retirée, telle qu'elle était. */
export interface RemovedExemption {
  readonly email: string;
}

/** Port d'**écriture** des exemptions. */
export abstract class FeatureExemptionRepository {
  /**
   * Ajoute l'adresse, **idempotent sur `(key, email)`** : une adresse déjà
   * exemptée garde sa ligne, son auteur et sa date d'origine.
   */
  abstract addIfAbsent(exemption: FeatureExemption): Promise<ExemptionAddOutcome>;

  /**
   * Retire l'exemption `id` **sous cette clé**. Un identifiant d'une autre clé
   * ne retire rien : l'URL dit les deux, et les deux doivent être vrais.
   *
   * @returns ce qui a été retiré, ou `null` si rien ne correspondait.
   */
  abstract remove(key: string, id: string): Promise<RemovedExemption | null>;
}
