import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  PrincipalSitesMenuView,
  SiteMenuState,
  SubAccountMenuPayload,
  SubAccountMenuView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';

/**
 * **La carte d'un site et la carte commune de ses sites**
 * (`carte-des-sites.md` § 4, § 6) : `GET` / `PUT /companies/:subAccountId/menu`,
 * `PUT …/menu/state` (la bascule), `GET` / `PUT /companies/:principalId/sites-menu`.
 *
 * La société est dans l'adresse : la lecture ne dépend pas de l'espace courant.
 * Les trois `PUT` sont `@Idempotent` (un état visé, rejoué, n'écrit rien) : pas
 * de clé d'intention. Un membre du site lit sa carte, il ne l'écrit pas.
 */
@Injectable({ providedIn: 'root' })
export class SiteMenuGateway {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  async read(subAccountId: string): Promise<SubAccountMenuView> {
    return firstValueFrom(
      this.http.get<SubAccountMenuView>(this.url(subAccountId), {
        headers: await this.headers(),
      }),
    );
  }

  /** Pose la carte entière : `null` au succès, le message du serveur au refus. */
  async save(subAccountId: string, payload: SubAccountMenuPayload): Promise<string | null> {
    try {
      await firstValueFrom(
        this.http.put(this.url(subAccountId), payload, { headers: await this.headers() }),
      );
      return null;
    } catch (error) {
      return httpErrorMessage(error);
    }
  }

  /** Le site suit la carte commune, ou reprend sa carte propre : `null` au succès, le refus sinon. */
  async setState(subAccountId: string, state: SiteMenuState): Promise<string | null> {
    try {
      await firstValueFrom(
        this.http.put(
          `${this.url(subAccountId)}/state`,
          { state },
          { headers: await this.headers() },
        ),
      );
      return null;
    } catch (error) {
      return httpErrorMessage(error);
    }
  }

  async readSitesMenu(principalId: string): Promise<PrincipalSitesMenuView> {
    return firstValueFrom(
      this.http.get<PrincipalSitesMenuView>(this.sitesUrl(principalId), {
        headers: await this.headers(),
      }),
    );
  }

  /** Pose la carte commune entière : `null` au succès, le message du serveur au refus. */
  async saveSitesMenu(principalId: string, payload: SubAccountMenuPayload): Promise<string | null> {
    try {
      await firstValueFrom(
        this.http.put(this.sitesUrl(principalId), payload, { headers: await this.headers() }),
      );
      return null;
    } catch (error) {
      return httpErrorMessage(error);
    }
  }

  private sitesUrl(principalId: string): string {
    return `${AUTH_CONFIG.apiBaseUrl}/companies/${encodeURIComponent(principalId)}/sites-menu`;
  }

  private url(subAccountId: string): string {
    return `${AUTH_CONFIG.apiBaseUrl}/companies/${encodeURIComponent(subAccountId)}/menu`;
  }

  private async headers(): Promise<HttpHeaders> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}
