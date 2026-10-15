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
 * ici.
 *
 * Écriture par geste nommé, comme côté serveur — `setPrice` / `alignOnPim` /
 * `setMasking` / `setFeatured`. Un `update(sku, patch)` unique aurait été plus court et
 * aurait perdu la seule chose qui compte : ce que l'utilisateur croyait faire.
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

  /** Pose le tarif de vente PRO. Le serveur refuse un prix égal à celui du PIM. */
  async setPrice(sku: string, priceMillicents: number): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/catalog/${encodeURIComponent(sku)}/price`, {
        priceMillicents,
      }),
    );
  }

  /**
   * Retire le tarif PRO : l'article repasse au prix du PIM et suivra ses hausses.
   *
   * Un `DELETE`, pas un `PUT { priceMillicents: null }` — on supprime une décision, on
   * n'en pose pas une qui vaudrait « rien ».
   */
  async alignOnPim(sku: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${B2B_API_BASE}/admin/catalog/${encodeURIComponent(sku)}/price`),
    );
  }

  /**
   * Met l'article en avant dans la boutique, ou l'en retire.
   *
   * Le serveur **refuse** de mettre en avant un article masqué : les deux états
   * ensemble diraient « ne pas le montrer » et « le montrer en premier ».
   * L'appelant désactive donc le geste plutôt que de laisser partir un 409.
   *
   * ⚠️ **Sans aucun appelant depuis le 2026-09-21** (vérifié ce jour-là) : la
   * colonne « mise en avant » a quitté le catalogue, et l'écran qui la réglera
   * n'existe pas encore (Hugo : « ça sera ailleurs »). La méthode est GARDÉE
   * parce que la route, elle, vit — la supprimer ferait réécrire dans huit
   * jours ce que ces six lignes disent déjà, et le serveur continuerait
   * d'exposer un geste que plus aucun client ne sait formuler.
   */
  async setFeatured(sku: string, featured: boolean): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/catalog/${encodeURIComponent(sku)}/featured`, {
        featured,
      }),
    );
  }

  /**
   * Pose l'étiquette **publique**, en centimes TTC.
   *
   * Route distincte de celle du prix pro : deux intentions, deux audiences,
   * deux refus. Le serveur en oppose un que le pro ne connaît pas — un article
   * que la vitrine publique n'expose pas.
   */
  async setPublicPrice(sku: string, ttcCents: number): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/catalog/${encodeURIComponent(sku)}/public-price`, {
        ttcCents,
      }),
    );
  }

  /** Retire l'étiquette publique : l'article repasse à celle du PIM. */
  async alignPublicOnPim(sku: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(
        `${B2B_API_BASE}/admin/catalog/${encodeURIComponent(sku)}/public-price`,
      ),
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
