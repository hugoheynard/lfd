import type { ProductionTrancheSettings } from "../entities/production-tranche-settings.js";

/** L'auteur d'un réglage : l'id de fiche, et son nom figé (`null` : la fiche n'en porte pas). */
export interface TrancheSettingsAuthor {
  readonly staffUserId: string;
  readonly name: string | null;
}

/** Port d'**écriture** des tranches de production : une ligne, remplacée, auteur figé. */
export abstract class ProductionTrancheSettingsRepository {
  abstract save(
    settings: ProductionTrancheSettings,
    at: Date,
    author: TrancheSettingsAuthor,
  ): Promise<void>;
}
