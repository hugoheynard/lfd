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
import { filter, map } from 'rxjs';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldLoadingStateComponent,
  FoldSurfaceDirective,
  FoldViewNavComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { DayCalendar } from '../../shared/day-calendar/day-calendar';
import { RoadRoutingReadiness } from '../road-routing-readiness';
import { RoundPdf } from '../round-pdf';
import { TOUR_MANAGER_DAY_OPTIONS, TourManagerDay } from './tour-manager-day';
import { TourManagerSummary } from './tour-manager-summary';
import { isAddressBookUrl, TOUR_MANAGER_TABS } from './tour-manager-views';

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
 * Le bandeau porte les onglets (Tournées, Adresses), puis le jour
 * (`TourManagerDay`, fourni ici) avec son calendrier pour une date lointaine,
 * le dossier du jour, le résumé, et la date et l'heure à droite. Sur l'onglet
 * Adresses, qui ne dépend d'aucun jour, le bandeau ne garde que les onglets et
 * l'heure.
 *
 * À l'ouverture, elle réveille le calcul routier et le sonde
 * (`RoadRoutingReadiness`) : tant qu'il n'est pas prêt, l'onglet Tournées est
 * flouté et inerte sous un voile ; l'onglet Adresses, qui n'en dépend pas,
 * reste libre, comme le bandeau.
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
    FoldCardComponent,
    FoldLoadingStateComponent,
    FoldSurfaceDirective,
    FoldViewNavComponent,
    FoldViewToggleComponent,
    RouterOutlet,
  ],
  providers: [TourManagerDay, TourManagerSummary, RoundPdf, RoadRoutingReadiness],
  templateUrl: './tour-manager-workspace-page.html',
  styleUrl: './tour-manager-workspace-page.scss',
})
export class TourManagerWorkspacePage {
  private readonly permissions = inject(PermissionsStore);
  protected readonly days = inject(TourManagerDay);
  protected readonly dayOptions = TOUR_MANAGER_DAY_OPTIONS;
  protected readonly tabs = TOUR_MANAGER_TABS;

  private readonly router = inject(Router);
  /** L'onglet Adresses est ouvert : le jour et son dossier se retirent du bandeau. */
  protected readonly onAddressBook = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => isAddressBookUrl(this.router.url)),
    ),
    { initialValue: isAddressBookUrl(this.router.url) },
  );
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

  protected readonly routing = inject(RoadRoutingReadiness);
  /** Le voile du calcul routier, sur l'onglet Tournées seulement. */
  protected readonly routingVeiled = computed(() => !this.onAddressBook() && this.routing.veiled());

  protected readonly now = signal(new Date());
  protected readonly stamp = computed(() => stampLabelOf(this.now()));

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      // Le calcul routier se réveille dès l'ouverture — sous le
      // droit de lire les tournées, celui que la route exige.
      if (this.canPrintDossier()) {
        this.routing.start();
      }
      const timer = setInterval(() => this.now.set(new Date()), CLOCK_TICK_MS);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
  }

  /** Ouvre le dossier des tournées du jour commun. */
  protected printDossier(): Promise<void> {
    return this.pdf.printDay(this.days.day());
  }
}
