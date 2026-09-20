import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CatalogItemView, CustomerSkuStat } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Le **catalogue vu du back-office**, et ce que chaque client y reprend.
 *
 * Aucun état local, et surtout aucune copie du catalogue dans le bundle : les
 * prix affichés ici sont ceux que le serveur appliquera à la validation. Un
 * commercial qui annonce un tarif au téléphone doit lire la même table que le
 * checkout, sans quoi il promet ce qui sera refusé.
 */
@Injectable({ providedIn: 'root' })
export class AdminCatalogService {
  private readonly http = inject(HttpClient);

  /**
   * Le catalogue entier, déjà rangé par rayon côté serveur.
   *
   * ⚠️ `/admin/catalog/sellable`, et non `/admin/catalog` : deux contrôleurs
   * déclarent ce préfixe, et la racine est servie par l'autre — celui du
   * catalogue B2B, qui rend les SKU de VARIANT et aucun champ `category`. Cette
   * méthode a donc rendu pendant des semaines des objets sans rayon, typés ici
   * comme s'ils en avaient, et tous les écrans qui rangent par rayon montraient
   * « rayon inconnu » (corrigé le 2026-09-13).
   */
  async list(): Promise<readonly CatalogItemView[]> {
    return firstValueFrom(
      this.http.get<readonly CatalogItemView[]>(`${B2B_API_BASE}/admin/catalog/sellable`),
    );
  }

  /** Ce que cette société a déjà commandé, les plus repris en tête. */
  async habitsOf(companyId: string): Promise<readonly CustomerSkuStat[]> {
    return firstValueFrom(
      this.http.get<readonly CustomerSkuStat[]>(
        `${B2B_API_BASE}/admin/catalog/companies/${encodeURIComponent(companyId)}`,
      ),
    );
  }
}
