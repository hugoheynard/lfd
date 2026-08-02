import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  FoldCalendarAgendaComponent,
  FoldCalendarDayComponent,
  FoldCalendarMonthComponent,
  FoldCalendarSourceFilterComponent,
  FoldCalendarToolbarComponent,
  FoldCalendarWeekComponent,
  foldFilterBySource,
  foldToday,
  type FoldCalendarAgendaMode,
  type FoldCalendarDate,
  type FoldCalendarView,
} from 'fold-ng';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import type { AdminCompany } from '../../comptes-clients/admin-company';
import { AcquisitionSettingsService } from '../settings/acquisition-settings.service';
import {
  ACQUISITION_SOURCES,
  buildAcquisitionEvents,
  type AcquisitionEvent,
} from './acquisition-events';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Onglet **Acquisition** du commercial : le pipeline d'entrée dans un calendrier
 * fold — mois, semaine ou jour — flanqué à droite du **rail « à traiter »**
 * (`fold-calendar-agenda`), la file des tâches (les tons `warning`/`alert` : les
 * attentes qui traînent et les RDV de création). Trois flux filtrables par les
 * chips (`inscriptions` / `attente` / `rdv`). La projection vit dans
 * `acquisition-events.ts` (pure) ; ici on charge, filtre et rend.
 *
 * `today` est posé **après le premier rendu** (navigateur) : le paquet fold n'a
 * pas d'horloge et un SSR ne doit pas en inventer une, sinon l'hydratation
 * diverge — côté serveur, aucun marqueur « aujourd'hui » ni bande datée.
 */
@Component({
  selector: 'app-acquisition-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCalendarMonthComponent,
    FoldCalendarWeekComponent,
    FoldCalendarDayComponent,
    FoldCalendarToolbarComponent,
    FoldCalendarSourceFilterComponent,
    FoldCalendarAgendaComponent,
  ],
  templateUrl: './acquisition-page.html',
  styleUrl: './acquisition-page.scss',
})
export class AcquisitionPage {
  private readonly service = inject(AdminCompaniesService);
  private readonly settings = inject(AcquisitionSettingsService);

  /** Le jour courant, posé au 1er rendu navigateur — `undefined` en SSR. */
  protected readonly today = signal<FoldCalendarDate | undefined>(undefined);
  /** Le jour de référence affiché ; la pagination toolbar/clavier l'écrit. */
  protected readonly date = signal<FoldCalendarDate>(foldToday());
  protected readonly view = signal<FoldCalendarView>('month');
  /** Les lectures offertes par la toolbar. */
  protected readonly views: readonly FoldCalendarView[] = ['month', 'week', 'day'];

  protected readonly sources = ACQUISITION_SOURCES;
  /** Flux affichés ; `null` = tous (valeur initiale des chips). */
  protected readonly active = signal<ReadonlySet<string> | null>(null);

  /** État du rail « à traiter » — persistés côté app si on veut qu'ils collent. */
  protected readonly agendaMode = signal<FoldCalendarAgendaMode>('todo');
  protected readonly agendaCollapsed = signal(false);

  protected readonly state = signal<LoadState>('loading');
  private readonly companies = signal<readonly AdminCompany[]>([]);

  /** Tous les événements — vides tant que `today` n'est pas posé (donc en SSR). */
  protected readonly events = computed<readonly AcquisitionEvent[]>(() => {
    const today = this.today();
    if (today === undefined) {
      return [];
    }
    return buildAcquisitionEvents(this.companies(), today, {
      warnDays: this.settings.warnDays(),
      alertDays: this.settings.alertDays(),
    });
  });

  /** Les événements des flux actifs — ce que le calendrier et le rail tracent. */
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
