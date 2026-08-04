import { Injectable, inject } from '@angular/core';

import { tvaTagFromPercent } from '../data/channels';
import { LocalDb } from '../data/local-db';
import { slugify } from '../data/sku';
import { ProductHttpApi } from './product-http-api';

// Types re-exportés depuis le modèle central : les pages continuent d'importer
// `type Category` / `type Product` depuis ce fichier sans changement.
export type {
  Category,
  Emplacement,
  EmplacementTable,
  LocalizedText,
  Product,
  ProductKind,
  ProductStatus,
  SalesChannels,
  TvaRegime,
  Variant,
} from '../data/models';

import type {
  Category,
  Emplacement,
  Product,
  ProductKind,
  SalesChannels,
  TvaRegime,
} from '../data/models';

/** Erreur métier — message déjà rédigé, prêt à afficher. */
export class CatalogueApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}${performance.now().toString(36).replace('.', '')}`;
}

/**
 * Catalogue — implémentation **locale** (POC frontend-only) sur {@link LocalDb}.
 * Les méthodes gardent leur signature d'origine (Promise) : les pages ne voient
 * pas la différence entre ceci et l'ancien client HTTP.
 */
@Injectable({ providedIn: 'root' })
export class CatalogueApi {
  private readonly db = inject(LocalDb);
  /** Domaine produit migré sur le backend Prisma ; le reste tient sur LocalDb. */
  private readonly productsApi = inject(ProductHttpApi);

  async listCategories(): Promise<Category[]> {
    return structuredClone(this.db.snapshot().categories);
  }

  async createCategory(payload: { nameFr: string; parentId?: string }): Promise<{ id: string }> {
    const name = payload.nameFr.trim();
    if (name === '') {
      throw new CatalogueApiError('category.name.empty', 'Le nom est obligatoire.');
    }
    const id = nextId('cat');
    this.db.update((draft) => {
      // Défauts éditables ensuite : à emporter dans les deux boutiques, régime
      // réduit à emporter / intermédiaire sur place quand ils existent.
      const reduced = draft.tvaRegimes.find((r) => r.percent === 5.5);
      const intermediate = draft.tvaRegimes.find((r) => r.percent === 10);
      const fallback = draft.tvaRegimes[0]?.id ?? '';
      draft.categories.push({
        id,
        name: { fr: name },
        slug: { fr: slugify(name) },
        parentId: payload.parentId ?? null,
        position: draft.categories.length + 1,
        isArchived: false,
        channelPreset: {
          b1: { emporter: true, surPlace: false },
          b2: { emporter: true, surPlace: false },
        },
        emporterTvaId: reduced?.id ?? fallback,
        surPlaceTvaId: intermediate?.id ?? fallback,
      });
    });
    return { id };
  }

  async renameCategory(id: string, nameFr: string): Promise<void> {
    const name = nameFr.trim();
    this.db.update((draft) => {
      const target = draft.categories.find((c) => c.id === id);
      if (target === undefined) {
        throw new CatalogueApiError('category.not_found', 'Famille introuvable.');
      }
      target.name = { fr: name };
      target.slug = { fr: slugify(name) };
    });
  }

  async archiveCategory(id: string): Promise<void> {
    this.db.update((draft) => {
      const target = draft.categories.find((c) => c.id === id);
      if (target === undefined) {
        throw new CatalogueApiError('category.not_found', 'Famille introuvable.');
      }
      target.isArchived = true;
    });
  }

  /** Défaut de canaux d'une gamme — les produits hérités en héritent. */
  async setCategoryChannelPreset(id: string, preset: SalesChannels): Promise<void> {
    this.db.update((draft) => {
      const target = draft.categories.find((c) => c.id === id);
      if (target === undefined) {
        throw new CatalogueApiError('category.not_found', 'Famille introuvable.');
      }
      target.channelPreset = preset;
    });
  }

  /** Régimes de TVA appliqués aux fiches à emporter / sur place d'une catégorie. */
  async setCategoryTva(id: string, emporterTvaId: string, surPlaceTvaId: string): Promise<void> {
    this.db.update((draft) => {
      const target = draft.categories.find((c) => c.id === id);
      if (target === undefined) {
        throw new CatalogueApiError('category.not_found', 'Famille introuvable.');
      }
      target.emporterTvaId = emporterTvaId;
      target.surPlaceTvaId = surPlaceTvaId;
    });
  }

  // ── Régimes de TVA (= collections Famille A, données créables) ────────────

  async listTvaRegimes(): Promise<TvaRegime[]> {
    return structuredClone(this.db.snapshot().tvaRegimes);
  }

  async createTvaRegime(payload: {
    name: string;
    description?: string;
    percent: number;
  }): Promise<{ id: string }> {
    const name = payload.name.trim();
    if (name === '') {
      throw new CatalogueApiError('tva.name.empty', 'Le nom est obligatoire.');
    }
    if (!Number.isFinite(payload.percent) || payload.percent < 0) {
      throw new CatalogueApiError('tva.percent.invalid', 'Taux invalide.');
    }
    const id = nextId('tva');
    this.db.update((draft) => {
      const tag = tvaTagFromPercent(payload.percent);
      if (draft.tvaRegimes.some((r) => r.tag === tag)) {
        throw new CatalogueApiError(
          'tva.tag.duplicate',
          `Un régime à ${payload.percent} % existe déjà (${tag}).`,
        );
      }
      draft.tvaRegimes.push({
        id,
        name,
        description: payload.description?.trim() ?? '',
        percent: payload.percent,
        tag,
      });
    });
    return { id };
  }

  /** Met à jour un régime ; le tag se re-dérive du taux (unicité contrôlée). */
  async updateTvaRegime(
    id: string,
    payload: { name: string; description?: string; percent: number },
  ): Promise<void> {
    const name = payload.name.trim();
    if (name === '') {
      throw new CatalogueApiError('tva.name.empty', 'Le nom est obligatoire.');
    }
    if (!Number.isFinite(payload.percent) || payload.percent < 0) {
      throw new CatalogueApiError('tva.percent.invalid', 'Taux invalide.');
    }
    this.db.update((draft) => {
      const target = draft.tvaRegimes.find((r) => r.id === id);
      if (target === undefined) {
        throw new CatalogueApiError('tva.not_found', 'Régime introuvable.');
      }
      const tag = tvaTagFromPercent(payload.percent);
      if (draft.tvaRegimes.some((r) => r.tag === tag && r.id !== id)) {
        throw new CatalogueApiError(
          'tva.tag.duplicate',
          `Un régime à ${payload.percent} % existe déjà (${tag}).`,
        );
      }
      target.name = name;
      target.description = payload.description?.trim() ?? '';
      target.percent = payload.percent;
      target.tag = tag;
    });
  }

  /** Supprime un régime — refusé s'il est encore référencé par une catégorie. */
  async deleteTvaRegime(id: string): Promise<void> {
    this.db.update((draft) => {
      const used = draft.categories.some((c) => c.emporterTvaId === id || c.surPlaceTvaId === id);
      if (used) {
        throw new CatalogueApiError(
          'tva.in_use',
          'Régime utilisé par une catégorie — réaffectez-la d’abord.',
        );
      }
      const index = draft.tvaRegimes.findIndex((r) => r.id === id);
      if (index !== -1) {
        draft.tvaRegimes.splice(index, 1);
      }
    });
  }

  // ── Produits (migrés sur le backend Prisma via ProductHttpApi) ───────────
  // Le domaine produit ne passe plus par LocalDb. Le prix/poids vivent sur la
  // déclinaison par défaut côté backend ; canaux (channelsOverride) et flags de
  // workflow sont différés (contexte commerce, slice 2). SalesChannels reste
  // importé pour les défauts de canaux des CATÉGORIES, toujours locales.

  async listProducts(): Promise<Product[]> {
    return this.productsApi.list();
  }

  /** Détail enrichi (éditorial compris) — pour la page d'édition produit. */
  async getProduct(id: string): Promise<Product | null> {
    return this.productsApi.get(id);
  }

  async createProduct(payload: {
    nameFr: string;
    kind: ProductKind;
    categoryId: string;
    sku?: string;
    allergens?: string[];
    channelsOverride?: SalesChannels | null;
    priceEur?: number;
    weightGrams?: number;
    handleFr?: string;
    descriptionFr?: string;
  }): Promise<{ id: string }> {
    if (payload.nameFr.trim() === '') {
      throw new CatalogueApiError('product.name.empty', 'Le nom est obligatoire.');
    }
    // `channelsOverride` / `handleFr` différés : les canaux relèvent du contexte
    // commerce (slice 2) et le slug est dérivé côté backend.
    return this.productsApi.create({
      nameFr: payload.nameFr,
      kind: payload.kind,
      categoryId: payload.categoryId,
      sku: payload.sku,
      allergens: payload.allergens,
      descriptionFr: payload.descriptionFr,
      priceEur: payload.priceEur,
      weightGrams: payload.weightGrams,
    });
  }

  async archiveProduct(id: string): Promise<void> {
    await this.productsApi.archive(id);
  }

  /** Pas de suppression physique (R3 backend) : « supprimer » = archiver. */
  async deleteProduct(id: string): Promise<void> {
    await this.productsApi.archive(id);
  }

  // ── Emplacements (boutiques : modes, tables, QR click & collect) ──────────

  async listEmplacements(): Promise<Emplacement[]> {
    return structuredClone(this.db.snapshot().emplacements);
  }

  async createEmplacement(payload: {
    name: string;
    clickCollect: boolean;
    surPlace: boolean;
    tableCount: number;
    baseUrl: string;
  }): Promise<{ id: string }> {
    const name = payload.name.trim();
    if (name === '') {
      throw new CatalogueApiError('emplacement.name.empty', 'Le nom est obligatoire.');
    }
    const id = nextId('emp');
    this.db.update((draft) => {
      draft.emplacements.push({
        id,
        name,
        clickCollect: payload.clickCollect,
        surPlace: payload.surPlace,
        baseUrl: payload.baseUrl.trim(),
        tables: payload.surPlace ? syncTables([], payload.tableCount) : [],
      });
    });
    return { id };
  }

  /** Met à jour un emplacement ; le nombre de tables re-synchronise le tableau
   *  en préservant l'état QR des tables existantes. */
  async updateEmplacement(
    id: string,
    patch: {
      name?: string;
      clickCollect?: boolean;
      surPlace?: boolean;
      baseUrl?: string;
      tableCount?: number;
    },
  ): Promise<void> {
    this.db.update((draft) => {
      const target = draft.emplacements.find((e) => e.id === id);
      if (target === undefined) {
        throw new CatalogueApiError('emplacement.not_found', 'Emplacement introuvable.');
      }
      if (patch.name !== undefined) {
        target.name = patch.name.trim();
      }
      if (patch.clickCollect !== undefined) {
        target.clickCollect = patch.clickCollect;
      }
      if (patch.surPlace !== undefined) {
        target.surPlace = patch.surPlace;
        if (!patch.surPlace) {
          target.tables = [];
        }
      }
      if (patch.baseUrl !== undefined) {
        target.baseUrl = patch.baseUrl.trim();
      }
      if (patch.tableCount !== undefined && target.surPlace) {
        target.tables = syncTables(target.tables, patch.tableCount);
      }
    });
  }

  async deleteEmplacement(id: string): Promise<void> {
    this.db.update((draft) => {
      const index = draft.emplacements.findIndex((e) => e.id === id);
      if (index !== -1) {
        draft.emplacements.splice(index, 1);
      }
    });
  }

  /** Génère (ou régénère) le QR d'une table : un nouveau token remplace
   *  l'ancien, ce qui invalide tout QR déjà imprimé. */
  async generateTableQr(emplacementId: string, tableNumber: number, token: string): Promise<void> {
    this.db.update((draft) => {
      const table = this.findTable(draft, emplacementId, tableNumber);
      table.qrCreated = true;
      table.token = token;
    });
  }

  /** Retire le QR d'une table (et son token). */
  async removeTableQr(emplacementId: string, tableNumber: number): Promise<void> {
    this.db.update((draft) => {
      const table = this.findTable(draft, emplacementId, tableNumber);
      table.qrCreated = false;
      delete table.token;
    });
  }

  private findTable(
    draft: { emplacements: Emplacement[] },
    emplacementId: string,
    tableNumber: number,
  ): Emplacement['tables'][number] {
    const target = draft.emplacements.find((e) => e.id === emplacementId);
    const table = target?.tables.find((t) => t.number === tableNumber);
    if (table === undefined) {
      throw new CatalogueApiError('emplacement.table.not_found', 'Table introuvable.');
    }
    return table;
  }
}

/** Aligne le tableau des tables sur `count`, en gardant l'état QR existant. */
function syncTables(
  current: readonly { number: number; qrCreated: boolean }[],
  count: number,
): { number: number; qrCreated: boolean }[] {
  const clamped = Math.max(0, Math.min(200, Math.floor(count)));
  const tables: { number: number; qrCreated: boolean }[] = [];
  for (let n = 1; n <= clamped; n += 1) {
    const existing = current.find((t) => t.number === n);
    tables.push({ number: n, qrCreated: existing?.qrCreated ?? false });
  }
  return tables;
}
