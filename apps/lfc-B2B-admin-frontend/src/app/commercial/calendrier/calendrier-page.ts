import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  FoldCalendarAgendaComponent,
  FoldCalendarDayComponent,
  FoldCalendarMonthComponent,
  FoldCalendarToolbarComponent,
  FoldCalendarWeekComponent,
  foldToday,
  type FoldCalendarAgendaMode,
  type FoldCalendarDate,
  type FoldCalendarEvent,
  type FoldCalendarView,
} from 'fold-ng';
import type { AppointmentView } from '@lfd/contracts';

import { AvailabilityService } from '../availability/availability.service';
import { buildAppointmentEvents } from './appointment-events';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Ce que le calendrier trace : **des rendez-vous, et rien d'autre**. Le composant
 * ne connaît que `FoldCalendarEvent` ; c'est l'app qui sait ce qu'il y a dedans,
 * et qui le retrouve par son id.
 */
type CalendarEvent = FoldCalendarEvent<AppointmentView>;

/**
 * Page **Calendrier** du commercial : son agenda de rendez-vous, en mois,
 * semaine ou jour, flanqué à droite du rail « à venir » (`fold-calendar-agenda`).
 *
 * Un seul flux, volontairement. La page traçait aussi trois bandes de dossier
 * (inscriptions, attente, activation) : c'était un pipeline déguisé en agenda,
 * qui noyait les seuls événements qu'on vient y chercher — ceux où quelqu'un
 * attend un appel à une heure précise. Le pipeline se lit dans **Prospects**,
 * qui est fait pour ça ; ici on tient un agenda.
 *
 * Un flux unique retire aussi les chips de filtre : filtrer une liste qui n'a
 * qu'une source ne peut que la vider.
 *
 * Cliquer un rendez-vous ouvre la **fiche commerciale** — la demande, le client
 * et ses chiffres, les actions. C'est là que se fait le travail ; le calendrier
 * n'est que la porte d'entrée.
 *
 * `today` est posé **après le premier rendu** (navigateur) : le paquet fold n'a
 * pas d'horloge et un SSR ne doit pas en inventer une, sinon l'hydratation
 * diverge.
 */
@Component({
  selector: 'app-calendrier-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCalendarMonthComponent,
    FoldCalendarWeekComponent,
    FoldCalendarDayComponent,
    FoldCalendarToolbarComponent,
    FoldCalendarAgendaComponent,
  ],
  templateUrl: './calendrier-page.html',
  styleUrl: './calendrier-page.scss',
})
export class CalendrierPage {
  private readonly appointmentsApi = inject(AvailabilityService);
  private readonly router = inject(Router);

  /** Le jour courant, posé au 1er rendu navigateur — `undefined` en SSR. */
  protected readonly today = signal<FoldCalendarDate | undefined>(undefined);
  /** Le jour de référence affiché ; la pagination toolbar/clavier l'écrit. */
  protected readonly date = signal<FoldCalendarDate>(foldToday());
  protected readonly view = signal<FoldCalendarView>('week');
  /** Les lectures offertes par la toolbar. */
  protected readonly views: readonly FoldCalendarView[] = ['month', 'week', 'day'];

  /** État du rail « à traiter » — persistés côté app si on veut qu'ils collent. */
  protected readonly agendaMode = signal<FoldCalendarAgendaMode>('todo');
  protected readonly agendaCollapsed = signal(false);

  protected readonly state = signal<LoadState>('loading');
  private readonly appointments = signal<readonly AppointmentView[]>([]);

  /** Les rendez-vous projetés — vides tant que `today` n'est pas posé (donc en SSR). */
  protected readonly events = computed<readonly CalendarEvent[]>(() =>
    this.today() === undefined ? [] : buildAppointmentEvents(this.appointments()),
  );

  constructor() {
    afterNextRender(() => this.today.set(foldToday()));
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.appointments.set(await this.appointmentsApi.appointments(windowStart(), windowEnd()));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Ouvre la **page** du rendez-vous cliqué. Une page et non un tiroir : c'est là
   * qu'on travaille, avec la fiche du client sous les yeux — et elle se partage,
   * se rafraîchit, se garde ouverte pendant l'appel.
   */
  protected async openEvent(event: CalendarEvent): Promise<void> {
    const appointment = this.appointments().find((a) => `appt:${a.id}` === event.id);
    if (appointment !== undefined) {
      await this.router.navigate(['/rendez-vous', appointment.id]);
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
