import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable, Injector } from '@angular/core';
// Types seulement : une valeur du baril embarquerait zod dans le bundle initial.
import type { PublishedShopCopyView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { ClientLocale, type LocaleCode } from '../client-locale.service';
import { ShopCopyOverrides } from './shop-copy-overrides';

/**
 * Combien de temps la boutique attend ses textes publiés avant de démarrer
 * (plan `plan-textes-de-la-boutique.md`, §10). Au-delà, elle démarre avec le
 * texte du code, et un remplacement arrivé plus tard s'applique alors.
 */
export const SHOP_COPY_STARTUP_BUDGET_MS = 300;

/**
 * **Lit les remplacements publiés** (`GET /shop/copy`) et les pose dans
 * {@link ShopCopyOverrides}.
 *
 * UN appel par langue et par visite : la langue du démarrage, puis une autre
 * si le visiteur en change — jamais deux fois la même, quel que soit le nombre
 * d'écrans qui lisent les textes (ils lisent l'état, pas ce service). Un échec
 * garde le texte du code : une API en panne rend la boutique d'aujourd'hui.
 */
@Injectable({ providedIn: 'root' })
export class ShopCopyLoader {
  private readonly http = inject(HttpClient);
  private readonly overrides = inject(ShopCopyOverrides);
  private readonly locale = inject(ClientLocale);
  private readonly injector = inject(Injector);
  private readonly requests = new Map<LocaleCode, Promise<void>>();
  private following = false;

  /**
   * Le démarrage : attend la langue courante au plus `budgetMs`, et suit
   * ensuite les changements de langue. Ne rejette jamais.
   */
  start(budgetMs: number): Promise<void> {
    if (!this.following) {
      this.following = true;
      effect(() => void this.load(this.locale.current()), { injector: this.injector });
    }
    return Promise.race([
      this.load(this.locale.current()),
      new Promise<void>((resolve) => setTimeout(resolve, budgetMs)),
    ]);
  }

  /** Lit les remplacements d'une langue — une seule fois par visite. */
  load(locale: LocaleCode): Promise<void> {
    const known = this.requests.get(locale);
    if (known !== undefined) {
      return known;
    }
    const request = firstValueFrom(
      this.http.get<PublishedShopCopyView>(`${AUTH_CONFIG.apiBaseUrl}/shop/copy`, {
        params: { locale },
      }),
    ).then(
      (view) => this.overrides.receive(locale, view.texts),
      () => undefined,
    );
    this.requests.set(locale, request);
    return request;
  }
}
