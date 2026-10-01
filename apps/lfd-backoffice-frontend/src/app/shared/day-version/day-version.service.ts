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
 * portes : chacun se lit sous deux familles de droits — celles des postes
 * (`orders` sous `b2b_orders` ; `production` sous l'un des quatre gestes du
 * fournil et du retrait, depuis le 2026-10-01), `b2b_supervision` pour la
 * Supervision (`commerce`, `supervision-production`). Le droit se choisit par
 * la porte, pas par le journal.
 *
 * `my-round` n'est pas un journal de plus : c'est la version de « ma
 * tournée » (`parcours-du-livreur.md`, PL4), sous `delivery_driving`, qui
 * MÊLE le journal de la livraison et celui du commerce pour ce jour. Opaque,
 * elle se compare par égalité — ce que fait déjà le veilleur.
 */
export type DayJournal =
  'commerce' | 'my-round' | 'orders' | 'production' | 'supervision-production';

const JOURNAL_PATHS: Readonly<Record<DayJournal, string>> = {
  commerce: 'admin/supervision/version',
  orders: 'admin/orders/day-version',
  'supervision-production': 'admin/supervision/production-version',
  production: 'admin/production/version',
  'my-round': 'admin/livraison/ma-tournee/version',
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
