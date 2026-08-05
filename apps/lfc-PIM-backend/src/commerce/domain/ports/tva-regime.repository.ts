/**
 * Un **régime de TVA** tel que la persistance le rend. Référence commerciale
 * partagée : les catégories pointent dessus (`emporterTvaId` / `surPlaceTvaId`) et
 * Shopify le projette en collection (`tag` = handle `tva-5-5`).
 */
export interface TvaRegimeRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Taux en pourcentage : 5.5, 10, 20. */
  readonly percent: number;
  /** Handle stable dérivé du taux (`tva-5-5`) — identité côté Shopify. Unique. */
  readonly tag: string;
}

export interface NewTvaRegime {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly percent: number;
  readonly tag: string;
}

export interface TvaRegimeUpdate {
  readonly name: string;
  readonly description: string;
  readonly percent: number;
  readonly tag: string;
}

/** Port : l'application dépend de cette abstraction, jamais de Prisma. */
export abstract class TvaRegimeRepository {
  abstract listAll(): Promise<TvaRegimeRecord[]>;
  abstract findById(id: string): Promise<TvaRegimeRecord | null>;
  abstract findByTag(tag: string): Promise<TvaRegimeRecord | null>;
  abstract insert(regime: NewTvaRegime): Promise<void>;
  abstract update(id: string, update: TvaRegimeUpdate): Promise<void>;
  abstract remove(id: string): Promise<void>;
}
