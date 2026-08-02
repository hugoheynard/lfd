import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  FoldCalendarMonthComponent,
  FoldCalendarSourceFilterComponent,
  FoldCalendarToolbarComponent,
  foldFilterBySource,
  foldToday,
  type FoldCalendarDate,
  type FoldCalendarView,
} from 'fold-ng';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import type { AdminCompany } from '../../comptes-clients/admin-company';
import {
  ACQUISITION_SOURCES,
  buildAcquisitionEvents,
  type AcquisitionEvent,
} from './acquisition-events';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Onglet **Acquisition** du commercial : un mois calendrier qui rassemble le
 * pipeline d'entrée — les **inscriptions** (un repère au jour d'inscription), les
 * comptes **en attente** (bandes ouvertes dont la teinte monte avec la durée) et
 * les **RDV de création** (les `pending` qui ont demandé un rappel), filtrables
 * par les chips de flux. La projection vit dans `acquisition-events.ts` (pure) ;
 * ici on ne fait que charger, filtrer et rendre.
 *
 * `today` est posé **après le premier rendu** (navigateur) : le paquet fold n'a
 * pas d'horloge et un SSR ne doit pas en inventer une, sinon l'hydratation
 * diverge. Côté serveur, aucun marqueur « aujourd'hui » ni bande datée.
 */
@Component({
  selector: 'app-acquisition-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCalendarMonthComponent,
    FoldCalendarToolbarComponent,
    FoldCalendarSourceFilterComponent,
  ],
  templateUrl: './acquisition-page.html',
  styleUrl: './acquisition-page.scss',
})
export class AcquisitionPage {
  private readonly service = inject(AdminCompaniesService);

  /** Le jour courant, posé au 1er rendu navigateur — `undefined` en SSR. */
  protected readonly today = signal<FoldCalendarDate | undefined>(undefined);
  /** N'importe quel jour du mois affiché ; la pagination clavier/toolbar l'écrit. */
  protected readonly month = signal<FoldCalendarDate>(foldToday());
  protected readonly view = signal<FoldCalendarView>('month');

  protected readonly sources = ACQUISITION_SOURCES;
  /** Flux affichés ; `null` = tous (valeur initiale des chips). */
  protected readonly active = signal<ReadonlySet<string> | null>(null);

  protected readonly state = signal<LoadState>('loading');
  private readonly companies = signal<readonly AdminCompany[]>([]);

  /** Tous les événements — vides tant que `today` n'est pas posé (donc en SSR). */
  protected readonly events = computed<readonly AcquisitionEvent[]>(() => {
    const today = this.today();
    return today === undefined ? [] : buildAcquisitionEvents(this.companies(), today);
  });

  /** Les événements des flux actifs — ce que le calendrier trace réellement. */
  protected readonly visibleEvents = computed<readonly AcquisitionEvent[]>(() =>
    foldFilterBySource(this.events(), this.active()),
  );

  constructor() {
    afterNextRender(() => this.today.set(foldToday()));
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.companies.set(await this.service.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Ouvre le dossier de la société depuis un événement — fiche à venir (side-panel). */
  protected openCompany(event: AcquisitionEvent): void {
    void event.data;
  }
}
