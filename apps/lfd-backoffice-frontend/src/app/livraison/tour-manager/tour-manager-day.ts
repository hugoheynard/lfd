import { computed, inject, Injectable, linkedSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { FoldViewToggleOption } from 'fold-ng';
import { map } from 'rxjs';

import { DAY_QUERY_PARAM, dayOfQuery, parisDayOf, shiftDay } from '../run-sheet';

/** Les segments du bandeau, ceux de la Supervision : la date lointaine passe par le calendrier. */
export const TOUR_MANAGER_DAY_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: '-1', label: 'Hier' },
  { value: '0', label: 'Aujourd’hui' },
  { value: '1', label: 'Demain' },
];

const DAY_MS = 86_400_000;

/** Combien de jours séparent deux `AAAA-MM-JJ` — en UTC, sur la date seule. */
export function daysBetween(isoDay: string, from: string): number {
  const utc = (value: string): number => {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
  };
  return Math.round((utc(isoDay) - utc(from)) / DAY_MS);
}

/**
 * **Le jour de Tour manager** — UN pour les deux onglets (Hugo, 2026-10-26).
 *
 * Fourni par la coquille, et non par chaque page : changer d'onglet ne
 * recrée que la page, le jour reste. Il est lu dans `?jour=` et réécrit dans
 * `?jour=` — un favori ou un lien partagé rouvre le même —, et suit l'adresse
 * quand un lien la change. Sans jour lisible, **demain** : la tournée se
 * prépare la veille, défaut que les deux pages avaient déjà chacune.
 */
@Injectable()
export class TourManagerDay {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Le jour du poste, à Paris : aucune lecture du serveur ne le dit ici. */
  readonly today = parisDayOf(new Date());

  private readonly fromUrl = toSignal(
    this.route.queryParamMap.pipe(map((params) => dayOfQuery(params.get(DAY_QUERY_PARAM)))),
    { initialValue: dayOfQuery(this.route.snapshot.queryParamMap.get(DAY_QUERY_PARAM)) },
  );

  /** Posé tout de suite au choix, puis recalé sur l'adresse quand elle change. */
  readonly day = linkedSignal(() => this.fromUrl() ?? shiftDay(this.today, 1));

  /** L'écart au jour du poste : −1 hier, 0 aujourd'hui, +1 demain. */
  readonly relative = computed(() => daysBetween(this.day(), this.today));

  /** Aucun segment allumé hors ±1 : c'est le calendrier qui dit la date. */
  readonly dayValue = computed(() => {
    const relative = this.relative();
    return Math.abs(relative) > 1 ? '' : String(relative);
  });

  /** Un segment Hier / Aujourd'hui / Demain. */
  pickRelative(value: string): void {
    const shift = Number(value);
    if (Number.isInteger(shift)) {
      this.show(shiftDay(this.today, shift));
    }
  }

  /**
   * Un jour, ou `null` (« Aujourd'hui » du calendrier). Écrit dans l'URL en
   * `replaceUrl` : parcourir dix jours n'empile pas dix pages à dépiler.
   */
  show(day: string | null): void {
    const target = day ?? this.today;
    this.day.set(target);
    void this.router.navigate([], {
      queryParams: { [DAY_QUERY_PARAM]: target },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
