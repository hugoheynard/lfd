import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import type { FoldViewToggleOption } from 'fold-ng';
import { FoldSurfaceDirective, FoldViewToggleComponent } from 'fold-ng';
import { filter, map } from 'rxjs';

import { PermissionsStore } from '../../auth/permissions.store';
import { DayCalendar } from '../../shared/day-calendar/day-calendar';
import { DAY_QUERY_PARAM } from '../run-sheet';
import { TOUR_MANAGER_DAY_OPTIONS, TourManagerDay } from './tour-manager-day';
import { permittedTourManagerViews } from './tour-manager-views';

/** L'horloge du bandeau avance à la minute ; la relire plus souvent ne montre rien. */
const CLOCK_TICK_MS = 30_000;

const STAMP_DAY = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Paris',
});
const STAMP_TIME = new Intl.DateTimeFormat('fr-FR', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/** « lundi 26 oct. · 14 h 05 » — l'heure dite comme au fournil, pas « 14:05 ». */
export function stampLabelOf(now: Date): string {
  const [hours, minutes] = STAMP_TIME.format(now).split(':');
  return `${STAMP_DAY.format(now)} · ${String(Number(hours))} h ${minutes ?? '00'}`;
}

/**
 * **L'espace Tour manager** — le bandeau, puis la vue ouverte (Hugo,
 * 2026-10-26 : « le haut s'inspire du bandeau de la Supervision »).
 *
 * Le bandeau porte le switch des onglets (Tournées, Feuille de route), le
 * jour COMMUN aux deux (`TourManagerDay`, fourni ici pour survivre au
 * changement d'onglet) avec son calendrier pour une date lointaine, et la
 * date et l'heure à droite.
 *
 * ⚠️ **Elle n'est pas une page** : aucun `fold-page-layout` ici, chaque vue
 * porte le sien. Aucun droit non plus : chaque onglet garde le sien. Le
 * bandeau disparaît à l'impression — la feuille de route dit son jour.
 */
@Component({
  selector: 'app-tour-manager-workspace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DayCalendar, FoldSurfaceDirective, FoldViewToggleComponent, RouterOutlet],
  providers: [TourManagerDay],
  templateUrl: './tour-manager-workspace-page.html',
  styleUrl: './tour-manager-workspace-page.scss',
})
export class TourManagerWorkspacePage {
  private readonly permissions = inject(PermissionsStore);
  private readonly router = inject(Router);
  protected readonly days = inject(TourManagerDay);
  protected readonly dayOptions = TOUR_MANAGER_DAY_OPTIONS;

  /** Les onglets permis : un onglet sans droit mènerait à un refus du garde. */
  private readonly views = computed(() =>
    permittedTourManagerViews((permission) => this.permissions.can(permission)),
  );
  protected readonly viewOptions = computed<readonly FoldViewToggleOption[]>(() =>
    this.views().map(({ key, label, icon }) => ({
      value: key,
      label,
      ...(icon === undefined ? {} : { icon }),
    })),
  );

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** L'onglet ouvert, lu dans l'adresse. */
  protected readonly view = computed(() => {
    const path = this.url().split('?')[0] ?? '';
    return this.views().find((view) => path === view.link)?.key ?? '';
  });

  protected readonly now = signal(new Date());
  protected readonly stamp = computed(() => stampLabelOf(this.now()));

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const timer = setInterval(() => this.now.set(new Date()), CLOCK_TICK_MS);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
  }

  /** Changer d'onglet garde le jour : il part dans l'adresse de l'onglet choisi. */
  protected pickView(key: string): void {
    const view = this.views().find((candidate) => candidate.key === key);
    if (view !== undefined) {
      void this.router.navigate([view.link], {
        queryParams: { [DAY_QUERY_PARAM]: this.days.day() },
      });
    }
  }
}
