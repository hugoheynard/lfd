import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  REVIEW_BATCH_MAX,
  type CatalogAdminItemView,
  type PublishedCatalogView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/** Les deux audiences d'une boutique — celles qu'on masque et qu'on valide. */
export type ShopAudience = 'pro' | 'public';

/**
 * Le catalogue **du paramétrage** : ce que le PIM a poussé, plus ce qu'on décide
 * ici — le masquage, la mise en avant, la validation.
 *
 * Écriture par geste nommé, comme côté serveur — `setMasking` / `setFeatured` /
 * `approveReview`. Le prix ne se décide plus ici depuis le lot D
 * (2026-10-15) : il se change dans la fiche du référentiel.
 */
@Injectable({ providedIn: 'root' })
export class CatalogueService {
  private readonly http = inject(HttpClient);

  /** Tout le catalogue, masqués compris — le back-office doit les voir pour les rouvrir. */
  list(): Promise<readonly CatalogAdminItemView[]> {
    return firstValueFrom(
      this.http.get<readonly CatalogAdminItemView[]>(`${B2B_API_BASE}/admin/catalog`),
    );
  }

  /**
   * Met l'article en avant **pour une audience**, ou l'en retire — l'écran
   * Gestion Boutique › Mise en avant (Hugo, 2026-10-18).
   *
   * Le serveur **refuse** (409) de mettre en avant un article masqué pour
   * cette audience, ou qu'il ne lui vend pas : l'écran ferme alors la bascule
   * et dit pourquoi, plutôt que de laisser partir le refus.
   */
  async setFeatured(sku: string, audience: ShopAudience, featured: boolean): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/catalog/${encodeURIComponent(sku)}/featured`, {
        audience,
        featured,
      }),
    );
  }

  /**
   * **La vue « Catalogue publié »** — toutes les fiches reçues du référentiel,
   * inactives et incomplètes comprises, l'état de chaque déclinaison par
   * audience, les comptes par rayon et ce qui attend une validation.
   */
  published(): Promise<PublishedCatalogView> {
    return firstValueFrom(
      this.http.get<PublishedCatalogView>(`${B2B_API_BASE}/admin/catalog/published`),
    );
  }

  /**
   * **Masquer pour UNE audience, ou y remettre** — la route unique du masquage
   * (H5 du plan `plan-catalogue-synchronise-par-audience.md`, D7 du plan
   * d'audience). Elle a remplacé `:sku/visibility` et `:sku/public-visibility`,
   * retirées côté serveur le 2026-10-15 : deux routes pour un même geste,
   * l'audience en paramètre plutôt que dans le chemin.
   *
   * Le serveur refuse (409 `catalog.item.masking_outside_audience`) de masquer
   * pour une audience que l'article n'a pas : l'écran n'offre donc le geste que
   * sur une cellule `en_vente` ou `masque`.
   */
  async setMasking(sku: string, audience: ShopAudience, hidden: boolean): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/catalog/${encodeURIComponent(sku)}/masking`, {
        audience,
        hidden,
      }),
    );
  }

  /**
   * **Valider** des articles arrivés du référentiel, pour une ou deux audiences.
   *
   * Par lots de `REVIEW_BATCH_MAX` : le serveur refuse au-delà, et « Tout
   * valider » d'un catalogue entier peut le dépasser. Une audience déjà validée
   * pour un SKU est ignorée par le serveur, sans refus — « Tout valider » peut
   * donc envoyer les deux audiences pour tous.
   */
  async approveReview(skus: readonly string[], audiences: readonly ShopAudience[]): Promise<void> {
    for (let start = 0; start < skus.length; start += REVIEW_BATCH_MAX) {
      await firstValueFrom(
        this.http.post<void>(`${B2B_API_BASE}/admin/catalog/review/approve`, {
          skus: skus.slice(start, start + REVIEW_BATCH_MAX),
          audiences,
        }),
      );
    }
  }
}
