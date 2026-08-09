import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldChoiceRowComponent,
  FoldDisclosureComponent,
  FoldScrollRegionDirective,
  type FoldChoiceOption,
} from 'fold-ng';
import type { Slot } from '@lfd/contracts';

import { groupSlots, periodOf, type SlotPeriod } from './slots-model';

/** Sentinelle : « le client a tout replié », par opposition à « il n'a rien choisi ». */
const NONE = '';

/**
 * Combien de jours on montre d'emblée.
 *
 * L'agenda est ouvert sur trois semaines, mais dérouler vingt journées libres
 * ne donne pas l'image d'une équipe disponible — plutôt celle d'une équipe que
 * personne n'appelle. Cinq dates suffisent à choisir ; le reste est à un clic
 * pour qui cherche vraiment plus loin.
 */
const FIRST_DAYS = 5;

/** Le filtre de demi-journée, proposé seulement s'il sert à quelque chose. */
const PERIODS: readonly FoldChoiceOption[] = [
  { key: 'all', label: 'Tout' },
  { key: 'morning', label: 'Matin' },
  { key: 'afternoon', label: 'Après-midi' },
];

/**
 * **Choix d'un créneau** — les jours en sections, les heures en pastilles.
 *
 * Deux partis pris :
 *
 * - **aucune date brute.** « Aujourd'hui », « Demain », puis « jeudi 14 août » :
 *   c'est ce qu'on lit sans effort. `2026-08-14` demande une traduction mentale
 *   pour un geste qui devrait en être exempt ;
 * - le **filtre matin / après-midi** n'apparaît que si les deux existent
 *   réellement. Proposer de filtrer une liste qui n'a que des matinées, c'est
 *   offrir un bouton qui ne peut que vider l'écran ;
 * - les jours sont des **accordéons, un seul ouvert**. Sur trois semaines de
 *   disponibilité, tout déplier fait défiler une page entière pour choisir une
 *   heure ; le compte porté par chaque en-tête permet de viser un jour sans
 *   l'ouvrir. Le premier est ouvert d'office : un écran entièrement replié
 *   demanderait un clic avant de montrer quoi que ce soit ;
 * - on n'en montre que **les cinq premières dates**, et la liste est **bornée en
 *   hauteur**. Un agenda déroulé sur trois semaines pousse le reste du
 *   formulaire — motif, message, bouton d'envoi — hors de l'écran, et donne
 *   l'image d'une équipe que personne n'appelle plutôt que d'une équipe
 *   disponible.
 *
 * Le composant ne charge rien et ne réserve rien : il reçoit des créneaux et
 * rend celui qu'on choisit. C'est le panneau qui parle au serveur.
 */
@Component({
  selector: 'app-slot-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldChoiceRowComponent,
    FoldDisclosureComponent,
    FoldBadgeComponent,
    FoldScrollRegionDirective,
  ],
  templateUrl: './slot-picker.html',
  styleUrl: './slot-picker.scss',
})
export class SlotPicker {
  readonly slots = input.required<readonly Slot[]>();
  /** Le jour local du jour, et celui d'après — passés pour rester testable. */
  readonly today = input.required<string>();
  readonly tomorrow = input.required<string>();
  /** Le créneau retenu (`startAt` ISO), vide tant qu'on n'a rien choisi. */
  readonly chosen = model<string>('');

  protected readonly periods = PERIODS;
  protected readonly period = model<SlotPeriod>('all');

  /** Le filtre n'a de sens que si les deux demi-journées sont représentées. */
  protected readonly showFilter = computed(() => {
    const kinds = new Set(this.slots().map((slot) => periodOf(slot.time)));
    return kinds.size > 1;
  });

  protected readonly days = computed(() =>
    groupSlots(this.slots(), this.period(), this.today(), this.tomorrow()),
  );

  /** Combien de créneaux le filtre courant laisse — dit avant de faire défiler. */
  protected readonly count = computed(() =>
    this.days().reduce((total, day) => total + day.slots.length, 0),
  );

  /** A-t-on déplié la liste au-delà des premières dates ? */
  protected readonly expanded = signal(false);

  /** Les jours réellement rendus — les cinq premiers, ou tous si on a déplié. */
  protected readonly visibleDays = computed(() =>
    this.expanded() ? this.days() : this.days().slice(0, FIRST_DAYS),
  );

  /** Combien de dates restent cachées — `0` quand il n'y a rien de plus. */
  protected readonly hiddenDays = computed(() => this.days().length - this.visibleDays().length);

  /**
   * Le jour que le client a déplié. `null` tant qu'il n'a rien touché — c'est ce
   * qui laisse le composant ouvrir le premier sans jamais contredire un choix.
   */
  private readonly picked = signal<string | null>(null);

  /** Le jour effectivement ouvert : le sien, ou le premier par défaut. */
  protected readonly openDay = computed(() => {
    const days = this.visibleDays();
    const picked = this.picked();
    if (picked === null) {
      return days[0]?.day ?? NONE;
    }
    // Le filtre a pu faire disparaître le jour ouvert : on ne garde pas ouvert
    // un jour qui n'est plus là.
    return days.some((day) => day.day === picked) ? picked : NONE;
  });

  /** Un seul ouvert : ouvrir un jour referme l'autre, c'est tout le principe. */
  protected setOpen(day: string, open: boolean): void {
    this.picked.set(open ? day : NONE);
  }

  /** « 3 disponibles » — le badge qui permet de viser un jour sans l'ouvrir. */
  protected availability(count: number): string {
    return count > 1 ? `${count} disponibles` : `${count} disponible`;
  }

  protected onPeriod(key: string): void {
    this.period.set(key === 'morning' || key === 'afternoon' ? key : 'all');
  }
}
