import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  PrincipalSitesMenuView,
  SiteMenuState,
  SubAccountMenuPayload,
  SubAccountMenuView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';
import { intentOptions } from '../../shared/gesture-intents';

/**
 * **La carte d'un sous-compte**, côté staff (`/admin/companies/:id/menu`, sous
 * `b2b_companies`). Le `PUT` pose la carte entière sous la clé d'intention de
 * l'écran (`Idempotency-Key`, obligatoire) : la même clé sur une autre carte
 * est refusée (409), d'où une clé par brouillon. La carte commune d'un
 * principal (`/sites-menu`, § 6) et la bascule d'un site (`/menu/state`)
 * suivent la même règle.
 */
@Injectable({ providedIn: 'root' })
export class SubAccountMenuService {
  private readonly http = inject(HttpClient);

  /** `menu` vaut `null` tant qu'aucune carte n'est posée. */
  read(companyId: string): Promise<SubAccountMenuView> {
    return firstValueFrom(this.http.get<SubAccountMenuView>(this.url(companyId)));
  }

  /** `204` ; `409` sur une société sans principal. Un refus est relancé. */
  async save(companyId: string, payload: SubAccountMenuPayload, intentKey: string): Promise<void> {
    await firstValueFrom(this.http.put(this.url(companyId), payload, intentOptions(intentKey)));
  }

  /** `204` ; déjà dans cet état, rien n'est fait ; `409` pour reprendre une carte propre absente. */
  async setState(companyId: string, state: SiteMenuState, intentKey: string): Promise<void> {
    await firstValueFrom(
      this.http.put(`${this.url(companyId)}/state`, { state }, intentOptions(intentKey)),
    );
  }

  /** La carte commune d'un principal ; `menu: null` sans carte commune. */
  readSitesMenu(principalId: string): Promise<PrincipalSitesMenuView> {
    return firstValueFrom(this.http.get<PrincipalSitesMenuView>(this.sitesUrl(principalId)));
  }

  /** `204` ; `409` si la société est elle-même un site. Un refus est relancé. */
  async saveSitesMenu(
    principalId: string,
    payload: SubAccountMenuPayload,
    intentKey: string,
  ): Promise<void> {
    await firstValueFrom(
      this.http.put(this.sitesUrl(principalId), payload, intentOptions(intentKey)),
    );
  }

  private sitesUrl(principalId: string): string {
    return `${B2B_API_BASE}/admin/companies/${encodeURIComponent(principalId)}/sites-menu`;
  }

  private url(companyId: string): string {
    return `${B2B_API_BASE}/admin/companies/${encodeURIComponent(companyId)}/menu`;
  }
}
