import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { AccountAlertOverride, AccountAlertRuleView, AlertKind } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Les alertes **vues depuis un compte** : la règle globale, la dérogation
 * éventuelle, et ce qui s'applique — les trois rendues ensemble par le serveur.
 *
 * Ce service ne calcule **rien**. La résolution `dérogation ?? global` vit côté
 * serveur, une seule fois : deux implémentations finiraient par diverger, et
 * c'est l'écran qui aurait tort sans que rien ne le signale.
 */
@Injectable({ providedIn: 'root' })
export class AccountAlertRulesService {
  private readonly http = inject(HttpClient);

  list(companyId: string): Promise<AccountAlertRuleView[]> {
    return firstValueFrom(this.http.get<AccountAlertRuleView[]>(this.base(companyId)));
  }

  async saveOverride(companyId: string, override: AccountAlertOverride): Promise<void> {
    await firstValueFrom(this.http.put<void>(this.base(companyId), override));
  }

  /** Revenir au réglage global : on **supprime** la dérogation, on n'en écrit pas une neutre. */
  async clearOverride(companyId: string, kind: AlertKind): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.base(companyId)}/${kind}`));
  }

  private base(companyId: string): string {
    return `${B2B_API_BASE}/admin/companies/${companyId}/alert-rules`;
  }
}
