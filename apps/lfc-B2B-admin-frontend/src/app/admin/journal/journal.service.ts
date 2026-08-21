import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ActivityEventView, ActivityModule, ActivityPageView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/** Ce que l'écran demande au journal. Tout est facultatif. */
export interface JournalFilters {
  readonly module?: ActivityModule;
  readonly type?: string;
  readonly actorId?: string;
  readonly since?: string;
  /** Curseur : l'`id` de la dernière ligne déjà affichée. */
  readonly before?: string;
}

/** Lecture du journal d'activité (`GET /admin/activity`). */
@Injectable({ providedIn: 'root' })
export class JournalService {
  private readonly http = inject(HttpClient);

  page(filters: JournalFilters): Promise<ActivityPageView> {
    return firstValueFrom(
      this.http.get<ActivityPageView>(`${B2B_API_BASE}/admin/activity`, {
        params: paramsOf(filters),
      }),
    );
  }
}

/** Seuls les filtres renseignés partent : un paramètre vide filtrerait sur du vide. */
function paramsOf(filters: JournalFilters): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      params = params.set(key, value);
    }
  }
  return params;
}

/**
 * Ce que l'événement raconte, **en français**.
 *
 * Deux lignes, et c'est délibéré : la première dit CE QUI s'est passé, la
 * seconde QUAND, PAR QUI et POUR QUI. Tout sur une seule ligne, on ne lisait
 * plus rien ; réparti sur deux, un journal se parcourt à l'œil.
 */
export interface JournalLine {
  readonly event: ActivityEventView;
  /** « Commande ORD-142 passée » — la phrase, dérivée du type et du payload. */
  readonly sentence: string;
  /** « 21 août 2026 à 14:32 » — jamais l'ISO brut. */
  readonly when: string;
  /** « Hugo Heynard (Commercial) », ou la NATURE de l'acteur si l'annuaire l'ignorait. */
  readonly actor: string;
  /** « pour Boulangerie Martin (SARL MARTIN) » — vide quand le fait n'a pas de client. */
  readonly forWhom: string;
  /** « 3 familles à emporter · 1 sur place » — vide quand le fait n'a pas de portée. */
  readonly blast: string;
}
