import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
// Valeurs et types depuis l'entrée sans zod (budget `cloudflare`).
import {
  MARKETING_CONSENT_TEXT_VERSIONS,
  SHOP_MARKETING_SPACE,
  type MarketingConsentSpace,
  type MyMarketingPreferencesView,
} from '@lfd/contracts/shop-values';
import { firstValueFrom, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientLocale } from '../client-locale.service';

export type MarketingPreferencesStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * **Les préférences e-mail de la personne connectée** — `GET /me/marketing`
 * et ses trois gestes (doc `documentation/mail/la-desinscription-et-l-accord.md`,
 * lots C2 et C3).
 *
 * Deux lecteurs : « Mes e-mails » (Mon profil), et la case de la commande,
 * qui ne paraît à un client connecté que si sa société est `askable`
 * (règle 17). Un geste écrit (204), puis on relit : l'état affiché est
 * toujours celui du serveur.
 */
@Injectable({ providedIn: 'root' })
export class MarketingPreferences {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly locale = inject(ClientLocale);

  private readonly _status = signal<MarketingPreferencesStatus>('idle');
  private readonly _view = signal<MyMarketingPreferencesView | null>(null);

  readonly status = this._status.asReadonly();
  readonly view = this._view.asReadonly();

  /**
   * Faut-il poser la case de la boutique à un client connecté ? Faux tant que
   * rien n'est lu, et en échec : une case qu'on ne sait pas devoir poser ne
   * se pose pas (un désinscrit ne doit pas la revoir).
   */
  readonly shopAskable = computed(
    () =>
      this._view()?.spaces.find((entry) => entry.space === SHOP_MARKETING_SPACE)?.askable === true,
  );

  /** Lit les préférences — rien pour un visiteur. */
  load(): void {
    if (!this.auth.isAuthenticated()) {
      return;
    }
    this._status.set('loading');
    this.withToken((headers) =>
      this.http.get<MyMarketingPreferencesView>(`${this.base}/me/marketing`, headers),
    ).then(
      (view) => {
        this._view.set(view);
        this._status.set('ready');
      },
      () => this._status.set('error'),
    );
  }

  /** Oublie ce qui a été lu : la prochaine lecture repartira du serveur. */
  forget(): void {
    this._view.set(null);
    this._status.set('idle');
  }

  /** S'inscrire, ou se réinscrire après une désinscription. `false` : refusé. */
  subscribe(space: MarketingConsentSpace): Promise<boolean> {
    return this.write('/me/marketing/subscriptions', {
      space,
      textVersion: MARKETING_CONSENT_TEXT_VERSIONS.society,
      locale: this.locale.current(),
    });
  }

  unsubscribe(space: MarketingConsentSpace): Promise<boolean> {
    return this.write('/me/marketing/unsubscriptions', { space });
  }

  /** La case « partenaires » — refusée (409) tant que `partnersOffered` est faux. */
  acceptPartners(): Promise<boolean> {
    return this.write('/me/marketing/partners', {
      textVersion: MARKETING_CONSENT_TEXT_VERSIONS.partners,
      locale: this.locale.current(),
    });
  }

  private readonly base = AUTH_CONFIG.apiBaseUrl;

  private write(path: string, body: object): Promise<boolean> {
    return this.withToken((headers) =>
      this.http.post<void>(`${this.base}${path}`, body, headers),
    ).then(
      () => {
        this.load();
        return true;
      },
      () => false,
    );
  }

  private withToken<T>(
    call: (options: { headers: Record<string, string> }) => Observable<T>,
  ): Promise<T> {
    return firstValueFrom(
      this.auth
        .accessToken$()
        .pipe(switchMap((token) => call({ headers: { Authorization: `Bearer ${token}` } }))),
    );
  }
}
