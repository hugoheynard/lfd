import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CatalogAdminItemView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Le catalogue **du paramétrage** : ce que le PIM a poussé, plus ce qu'on décide
 * ici.
 *
 * Écriture par geste nommé, comme côté serveur — `setPrice` / `alignOnPim` /
 * `setVisibility`. Un `update(sku, patch)` unique aurait été plus court et
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

  /** Pose le tarif de vente B2B. Le serveur refuse un prix égal à celui du PIM. */
  async setPrice(sku: string, priceMillicents: number): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/catalog/${encodeURIComponent(sku)}/price`, {
        priceMillicents,
      }),
    );
  }

  /**
   * Retire le tarif B2B : l'article repasse au prix du PIM et suivra ses hausses.
   *
   * Un `DELETE`, pas un `PUT { priceMillicents: null }` — on supprime une décision, on
   * n'en pose pas une qui vaudrait « rien ».
   */
  async alignOnPim(sku: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${B2B_API_BASE}/admin/catalog/${encodeURIComponent(sku)}/price`),
    );
  }

  /** Masque ou réaffiche l'article dans la boutique B2B. */
  async setVisibility(sku: string, hidden: boolean): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/catalog/${encodeURIComponent(sku)}/visibility`, {
        hidden,
      }),
    );
  }
}
