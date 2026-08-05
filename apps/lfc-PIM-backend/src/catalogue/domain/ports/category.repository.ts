import type { LocalizedText } from '../value-objects/localized-text.js';
import type { SalesChannels } from '../value-objects/sales-channels.js';

/**
 * Vue d'une famille telle que la persistance la rend.
 * Aucune colonne système : le domaine ne connaît ni `created_at` ni `updated_at`.
 */
export interface CategoryRecord {
  readonly id: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly parentId: string | null;
  readonly position: number;
  readonly isArchived: boolean;
  /** Canaux dont héritent les produits de la famille (sauf override). */
  readonly channelPreset: SalesChannels;
  /** Régimes de TVA appliqués aux fiches à emporter / sur place. `null` = non réglé. */
  readonly emporterTvaId: string | null;
  readonly surPlaceTvaId: string | null;
}

export interface NewCategory {
  readonly id: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly parentId: string | null;
  readonly position: number;
  readonly channelPreset: SalesChannels;
}

/** Port : le domaine dépend de cette abstraction, jamais de Prisma. */
export abstract class CategoryRepository {
  abstract findById(id: string): Promise<CategoryRecord | null>;
  abstract listAll(): Promise<CategoryRecord[]>;
  abstract insert(category: NewCategory): Promise<void>;
  abstract rename(
    id: string,
    name: LocalizedText,
    slug: LocalizedText,
  ): Promise<void>;
  abstract archive(id: string): Promise<void>;
  abstract setChannels(id: string, channels: SalesChannels): Promise<void>;
  abstract setTva(
    id: string,
    emporterTvaId: string | null,
    surPlaceTvaId: string | null,
  ): Promise<void>;
  abstract countActiveProducts(id: string): Promise<number>;
  abstract nextPosition(parentId: string | null): Promise<number>;
}
