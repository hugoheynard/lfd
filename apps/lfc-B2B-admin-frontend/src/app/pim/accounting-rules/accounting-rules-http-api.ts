import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AccountingRulesView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

/**
 * Accès aux **règles comptables** — le réglage unique de la maison.
 *
 * Aucune forme déclarée ici : `AccountingRulesView` vient du contrat. Le front
 * ne redit pas ce que l'API affirme (cf. `lint:api-types-from-contracts`).
 */
@Injectable({ providedIn: 'root' })
export class AccountingRulesHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  read(): Promise<AccountingRulesView> {
    return firstValueFrom(this.http.get<AccountingRulesView>(this.url()));
  }

  /**
   * Le `PUT` rend la vue relue : la date du dernier réglage est un fait du
   * serveur. La recalculer ici afficherait l'heure du navigateur pour une
   * écriture faite ailleurs.
   */
  setProPriceRatio(ratioBp: number): Promise<AccountingRulesView> {
    return firstValueFrom(
      this.http.put<AccountingRulesView>(`${this.url()}/pro-price-ratio`, { ratioBp }),
    );
  }

  private url(): string {
    return `${this.base}/accounting-rules`;
  }
}
