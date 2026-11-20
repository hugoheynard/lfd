import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { SubAccountMenuPayload, SubAccountMenuView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';

/**
 * **La carte d'un site**, lue et posée par son compte principal
 * (`GET` / `PUT /companies/:subAccountId/menu`, `carte-des-sites.md` § 4).
 *
 * Le site est dans l'adresse : la lecture ne dépend pas de l'espace courant.
 * Le `PUT` est `@Idempotent` (la carte entière, rejouée, n'écrit rien) : pas
 * de clé d'intention.
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

  private url(subAccountId: string): string {
    return `${AUTH_CONFIG.apiBaseUrl}/companies/${encodeURIComponent(subAccountId)}/menu`;
  }

  private async headers(): Promise<HttpHeaders> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}
