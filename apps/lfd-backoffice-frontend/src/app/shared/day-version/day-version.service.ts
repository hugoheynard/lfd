import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { DayVersionView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Les journaux de journée qu'un écran peut suivre, et leur porte.
 *
 * Deux journaux côté API (un par schéma, D3 de
 * `documentation/caching-usage/plan-version-par-journee.md`), mais QUATRE
 * portes : chacun se lit sous deux droits — `b2b_orders` pour les postes
 * (`orders`, `production`), `b2b_supervision` pour la Supervision
 * (`commerce`, `supervision-production`). Le droit se choisit par la
 * porte, pas par le journal.
 */
export type DayJournal = 'commerce' | 'orders' | 'production' | 'supervision-production';

const JOURNAL_PATHS: Readonly<Record<DayJournal, string>> = {
  commerce: 'admin/supervision/version',
  orders: 'admin/orders/day-version',
  'supervision-production': 'admin/supervision/production-version',
  production: 'admin/production/version',
};

/** Lit la version d'une journée dans un journal — une opération, rien d'autre. */
@Injectable({ providedIn: 'root' })
export class DayVersionService {
  private readonly http = inject(HttpClient);

  async version(journal: DayJournal, date: string): Promise<number> {
    const view = await firstValueFrom(
      this.http.get<DayVersionView>(
        `${B2B_API_BASE}/${JOURNAL_PATHS[journal]}?date=${encodeURIComponent(date)}`,
      ),
    );
    return view.version;
  }
}
