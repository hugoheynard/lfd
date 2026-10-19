import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ShopFeaturedView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { ClientLocale } from '../client-locale.service';

/**
 * **Les incontournables pros, pour un visiteur** — ce que l'accueil pro public
 * (`/pro`) montre sous les deux modes (Hugo, 2026-10-19).
 *
 * Route publique, sans jeton : `GET /shop/featured?audience=pro&lang=…`.
 * Aucun prix n'y voyage, par décision (`shop-featured.ts`) : un tarif pro
 * dépend de la société, qu'un visiteur n'a pas. La langue est celle de
 * l'interface au moment de la lecture.
 */
@Injectable({ providedIn: 'root' })
export class ProFeaturedGateway {
  private readonly http = inject(HttpClient);
  private readonly locale = inject(ClientLocale);

  list(): Promise<ShopFeaturedView> {
    return firstValueFrom(
      this.http.get<ShopFeaturedView>(`${AUTH_CONFIG.apiBaseUrl}/shop/featured`, {
        params: { audience: 'pro', lang: this.locale.current() },
      }),
    );
  }
}
