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
import { RouterOutlet } from '@angular/router';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldSurfaceDirective,
  FoldViewToggleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { DayCalendar } from '../../shared/day-calendar/day-calendar';
import { RoundPdf } from '../round-pdf';
import { TOUR_MANAGER_DAY_OPTIONS, TourManagerDay } from './tour-manager-day';
import { TourManagerSummary } from './tour-manager-summary';

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
 * « Voir le dossier du lundi 26 oct. » — le jour commun, au format de la date
 * du bandeau. Midi UTC : le même jour civil à Paris, été comme hiver.
 */
export function dossierLabelOf(day: string): string {
  return `Voir le dossier du ${STAMP_DAY.format(new Date(`${day}T12:00:00Z`))}`;
}

/**
 * **L'espace Tour manager** — le bandeau, puis la vue ouverte (Hugo,
 * 2026-10-26 : « le haut s'inspire du bandeau de la Supervision »).
 *
 * Le bandeau porte le jour (`TourManagerDay`, fourni ici) avec son calendrier
 * pour une date lointaine, le dossier du jour, le résumé, et la date et
 * l'heure à droite. Plus de switch d'onglets depuis le 2026-10-26 (Hugo) :
 * la « Feuille de route » est retirée, le dossier du jour porte ce qu'elle
 * montrait.
 *
 * ⚠️ **Elle n'est pas une page** : aucun `fold-page-layout` ici, la vue
 * routée porte le sien. Le seul geste du bandeau, le dossier du jour, demande
 * de lire les tournées.
 */
@Component({
  selector: 'app-tour-manager-workspace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DayCalendar,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldSurfaceDirective,
    FoldViewToggleComponent,
    RouterOutlet,
  ],
  providers: [TourManagerDay, TourManagerSummary, RoundPdf],
  templateUrl: './tour-manager-workspace-page.html',
  styleUrl: './tour-manager-workspace-page.scss',
})
export class TourManagerWorkspacePage {
  private readonly permissions = inject(PermissionsStore);
  protected readonly days = inject(TourManagerDay);
  protected readonly dayOptions = TOUR_MANAGER_DAY_OPTIONS;
  private readonly pdf = inject(RoundPdf);
  protected readonly pdfFailed = this.pdf.failed;
  protected readonly blockedPdfUrl = this.pdf.blockedUrl;
  protected readonly blockedPdfName = this.pdf.blockedFileName;

  /** Le dossier du jour, sous le droit de lire les tournées. */
  protected readonly canPrintDossier = computed(() => this.permissions.can('delivery_rounds:read'));

  private readonly summaries = inject(TourManagerSummary);
  protected readonly dossierLabel = computed(() => dossierLabelOf(this.days.day()));
  /** « 4 tournées · 20 arrêts », avant la date : publié par l'écran des tournées. */
  protected readonly summary = computed(() =>
    this.canPrintDossier() ? this.summaries.labelFor(this.days.day()) : null,
  );

  protected readonly now = signal(new Date());
  protected readonly stamp = computed(() => stampLabelOf(this.now()));

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const timer = setInterval(() => this.now.set(new Date()), CLOCK_TICK_MS);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
  }

  /** Ouvre le dossier des tournées du jour commun. */
  protected printDossier(): Promise<void> {
    return this.pdf.printDay(this.days.day());
  }
}
