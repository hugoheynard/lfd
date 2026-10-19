import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ShopCatalogueView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';

/**
 * **D'où viennent les tarifs pro d'un visiteur** — le tarif professionnel de
 * base, hors taxe, sans mercuriale ni remise de société.
 *
 * Une source injectable plutôt qu'une méthode du catalogue : la vue publique
 * pro est bâtie côté API en parallèle de cet écran, et sa forme se branche ici
 * seule, sans toucher à `ShopCatalogue`.
 *
 * `?audience=pro` est la forme que sert `ShopCatalogueController` (relu le
 * 2026-10-19, dans l'arbre de travail, pas encore commité) : même vue que la
 * vitrine publique, au tarif pro de base hors taxe, rien de négocié.
 */
@Injectable({ providedIn: 'root' })
export class ProShelfSource {
  private readonly http = inject(HttpClient);

  /** La vitrine pro publique, sans jeton. */
  load(): Promise<ShopCatalogueView> {
    return firstValueFrom(
      this.http.get<ShopCatalogueView>(`${AUTH_CONFIG.apiBaseUrl}/shop/catalogue`, {
        params: { audience: 'pro' },
      }),
    );
  }
}
