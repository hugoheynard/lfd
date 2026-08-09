import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  FoldPanelHostService,
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
  type FoldCalendarEvent,
  type FoldCalendarView,
} from 'fold-ng';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import type { AdminCompany } from '../../comptes-clients/admin-company';
import type { AppointmentView } from '@lfd/contracts';
import { AvailabilityService } from '../availability/availability.service';
import { AcquisitionSettingsService } from '../settings/acquisition-settings.service';
import { ACQUISITION_SOURCES, buildAcquisitionEvents } from './acquisition-events';
import { APPOINTMENT_SOURCE, buildAppointmentEvents } from './appointment-events';
import { AppointmentPanel, type AppointmentPanelData } from './appointment-panel/appointment-panel';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Ce que le calendrier trace : des bandes de dossier **et** des rendez-vous
 * horodatés. Une seule sorte d'événement, dont la **donnée** est l'union des deux
 * — plutôt qu'une union d'événements, que fold ne saurait pas unifier. Le
 * composant ne connaît que `FoldCalendarEvent` ; c'est l'app qui sait ce qu'il y
 * a dedans, et qui le retrouve par son id.
 */
type CalendarEvent = FoldCalendarEvent<AdminCompany | AppointmentView>;

/**
 * Onglet **Acquisition** du commercial : le pipeline d'entrée dans un calendrier
 * fold — mois, semaine ou jour — flanqué à droite du **rail « à traiter »**
 * (`fold-calendar-agenda`), la file des tâches (les tons `warning`/`alert`).
 * Quatre flux filtrables par les chips (`inscriptions` / `attente` / `activation`
 * / `rdv`).
 *
 * Le flux **`rdv` porte de vrais rendez-vous** — datés ET horodatés, posés sur la
 * grille horaire, cliquables vers un panneau d'actions. C'est pour eux que la vue
 * par défaut est la **semaine** : c'est là qu'un agenda se lit. Les deux
 * projections vivent dans `acquisition-events.ts` et `appointment-events.ts`
 * (pures) ; ici on charge, filtre et rend.
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
  private readonly appointmentsApi = inject(AvailabilityService);
  private readonly settings = inject(AcquisitionSettingsService);
  private readonly panels = inject(FoldPanelHostService);

  /** Le jour courant, posé au 1er rendu navigateur — `undefined` en SSR. */
  protected readonly today = signal<FoldCalendarDate | undefined>(undefined);
  /** Le jour de référence affiché ; la pagination toolbar/clavier l'écrit. */
  protected readonly date = signal<FoldCalendarDate>(foldToday());
  protected readonly view = signal<FoldCalendarView>('week');
  /** Les lectures offertes par la toolbar. */
  protected readonly views: readonly FoldCalendarView[] = ['month', 'week', 'day'];

  protected readonly sources = [...ACQUISITION_SOURCES, APPOINTMENT_SOURCE];
  /** Flux affichés ; `null` = tous (valeur initiale des chips). */
  protected readonly active = signal<ReadonlySet<string> | null>(null);

  /** État du rail « à traiter » — persistés côté app si on veut qu'ils collent. */
  protected readonly agendaMode = signal<FoldCalendarAgendaMode>('todo');
  protected readonly agendaCollapsed = signal(false);

  protected readonly state = signal<LoadState>('loading');
  private readonly companies = signal<readonly AdminCompany[]>([]);
  private readonly appointments = signal<readonly AppointmentView[]>([]);

  /** Tous les événements — vides tant que `today` n'est pas posé (donc en SSR). */
  protected readonly events = computed<readonly CalendarEvent[]>(() => {
    const today = this.today();
    if (today === undefined) {
      return [];
    }
    return [
      ...buildAcquisitionEvents(this.companies(), today, {
        warnDays: this.settings.warnDays(),
        alertDays: this.settings.alertDays(),
      }),
      ...buildAppointmentEvents(this.appointments()),
    ];
  });

  /** Les événements des flux actifs — ce que le calendrier et le rail tracent. */
  protected readonly visibleEvents = computed<readonly CalendarEvent[]>(() =>
    foldFilterBySource(this.events(), this.active()),
  );

  constructor() {
    afterNextRender(() => this.today.set(foldToday()));
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const [companies, appointments] = await Promise.all([
        this.service.list(),
        this.appointmentsApi.appointments(windowStart(), windowEnd()),
      ]);
      this.companies.set(companies);
      this.appointments.set(appointments);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Ouvre l'événement cliqué. Un **rendez-vous** ouvre son panneau d'actions ;
   * les autres flux (inscription, attente) n'ont pas encore de destination — on
   * ne feint pas d'en avoir une.
   */
  protected async openEvent(event: CalendarEvent): Promise<void> {
    if (event.sourceKey !== APPOINTMENT_SOURCE.key) {
      return;
    }
    const appointment = this.appointments().find((a) => `appt:${a.id}` === event.id);
    if (appointment === undefined) {
      return;
    }
    const ref = this.panels.open<AppointmentPanelData, boolean>(AppointmentPanel, {
      data: { appointment },
      width: 'md',
    });
    if ((await ref.closed) === true) {
      await this.load();
    }
  }
}

/** Début de la fenêtre lue : un mois en arrière, de quoi remplir les vues. */
function windowStart(): string {
  return new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
}

/** Fin de la fenêtre lue : trois mois en avant. */
function windowEnd(): string {
  return new Date(Date.now() + 92 * 24 * 60 * 60 * 1000).toISOString();
}
