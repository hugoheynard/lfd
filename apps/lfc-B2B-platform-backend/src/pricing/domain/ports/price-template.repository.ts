import type { PriceTemplate } from "../entities/price-template.js";

/** Écriture et relecture des gabarits tarifaires. */
export abstract class PriceTemplateRepository {
  abstract save(template: PriceTemplate): Promise<void>;
  /** `null` si l'identifiant n'existe pas. */
  abstract load(id: string): Promise<PriceTemplate | null>;
}
