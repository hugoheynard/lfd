import { Injectable, inject } from '@angular/core';

import type { DbShape } from '../data/db.seed';
import { LocalDb } from '../data/local-db';
import type { Product, PushReport, PushSummary } from '../data/models';

export type {
  ProductBinding,
  PushOutcome,
  PushReport,
  PushSummary,
  ShopifySettings,
  SyncStatus,
} from '../data/models';

import type { ProductBinding } from '../data/models';

/**
 * Shopify **produit** — implémentation locale (POC frontend-only).
 *
 * Le push produit est **toujours simulé** : depuis un navigateur il n'existe ni
 * secret ni route CORS vers l'Admin API. La simulation reste fidèle : elle
 * projette le produit, calcule une empreinte, ne repousse pas l'identique, et
 * marque les bindings comme dans la vraie chaîne (`up_to_date`, `failed`).
 *
 * La **connexion** et les **collections de TVA**, elles, sont désormais réelles et
 * passent par le backend — voir {@link ShopifyChannelApi}.
 */
@Injectable({ providedIn: 'root' })
export class ShopifyApi {
  private readonly db = inject(LocalDb);

  async listBindings(): Promise<ProductBinding[]> {
    return structuredClone(this.db.snapshot().bindings);
  }

  async push(productIds?: string[]): Promise<PushSummary> {
    const snapshot = this.db.snapshot();
    const targets =
      productIds !== undefined && productIds.length > 0
        ? snapshot.products.filter((p) => productIds.includes(p.id))
        : snapshot.products.filter((p) => p.status !== 'archived');

    const results: PushReport[] = [];
    this.db.update((draft) => {
      for (const product of targets) {
        results.push(this.pushOne(draft, product));
      }
    });

    return { mode: 'dry-run', results };
  }

  /** Un produit : projection → empreinte → binding. Mutations sur le brouillon. */
  private pushOne(draft: DbShape, product: Product): PushReport {
    const fingerprint = this.fingerprint(product);

    if (draft.bindingHashes[product.id] === fingerprint) {
      return {
        productId: product.id,
        sku: product.sku,
        outcome: 'unchanged',
        message: 'Déjà à jour.',
      };
    }

    draft.bindingHashes[product.id] = fingerprint;
    this.upsertBinding(draft, {
      productId: product.id,
      syncStatus: 'up_to_date',
      lastPushedAt: new Date().toISOString(),
      lastError: null,
    });

    return {
      productId: product.id,
      sku: product.sku,
      outcome: 'pushed',
      message: 'Simulé (aucun appel réseau).',
    };
  }

  private upsertBinding(draft: DbShape, binding: ProductBinding): void {
    const index = draft.bindings.findIndex((b) => b.productId === binding.productId);
    if (index === -1) {
      draft.bindings.push(binding);
    } else {
      draft.bindings[index] = binding;
    }
  }

  /**
   * Empreinte stable de « ce produit chez Shopify » : titre, handle, statut, et
   * les déclinaisons actives (sku + titre). Deux états équivalents → même chaîne.
   */
  private fingerprint(product: Product): string {
    return JSON.stringify({
      title: product.name.fr,
      status: product.status === 'published' ? 'ACTIVE' : 'DRAFT',
      variants: product.variants
        .filter((v) => !v.isDiscontinued)
        .map((v) => ({ sku: v.sku, title: v.name.fr }))
        .sort((a, b) => a.sku.localeCompare(b.sku)),
    });
  }
}
