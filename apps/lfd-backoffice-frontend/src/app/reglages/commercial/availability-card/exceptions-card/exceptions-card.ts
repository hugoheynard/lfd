import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldChoiceRowComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
  type FoldChoiceOption,
} from 'fold-ng';
import type {
  AvailabilityConfigView,
  AvailabilityExceptionPayload,
  ExceptionKind,
} from '@lfd/contracts';

import { AvailabilityService } from '../../../../commercial/availability/availability.service';
import { NotifyService } from '../../../../notify.service';

import { addException, removeException, type AvailabilityDraft } from '../availability-draft';
import {
  boundsFor,
  parisToday,
  sameExceptions,
  upcomingExceptions,
  type ExceptionPeriod,
} from './exceptions-model';

/** Les deux natures d'un écart daté. */
const KINDS: readonly FoldChoiceOption[] = [
  { key: 'closed', label: 'Fermeture' },
  { key: 'open', label: 'Ouverture' },
];

/** Les trois portées dans la journée. */
const PERIODS: readonly FoldChoiceOption[] = [
  { key: 'morning', label: 'Matin' },
  { key: 'afternoon', label: 'Après-midi' },
  { key: 'day', label: 'Journée' },
];

/**
 * Carte **Fermetures et ouvertures exceptionnelles** : les écarts datés à la
 * grille hebdomadaire — congés, jour férié, samedi de salon.
 *
 * Deux choix portent la carte :
 *
 * - la **portée** se prend au segment (matin / après-midi / journée) plutôt
 *   qu'en saisissant deux heures. « Je ferme vendredi après-midi » est le geste
 *   réel ; taper `14:00` et `18:00` pour le dire est une corvée qui invite à la
 *   faute de frappe. Les bornes restent lisibles sur la ligne une fois ajoutée ;
 * - la liste ne montre que l'**à venir**, aujourd'hui compris. Un congé de l'an
 *   dernier ne dit plus rien de l'agenda et n'a qu'un effet : noyer les lignes
 *   qui comptent. Il n'est pas supprimé pour autant — le retirer d'office serait
 *   décider à la place du commercial.
 *
 * **Elle enregistre elle-même**, sur une route qui n'écrit que les exceptions :
 * dater un congé ne renvoie donc pas la grille, et ne peut pas l'écraser avec un
 * état chargé il y a dix minutes.
 */
@Component({
  selector: 'app-exceptions-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldDateComponent,
    FoldChoiceRowComponent,
    FoldInputComponent,
    FoldButtonComponent,
  ],
  templateUrl: './exceptions-card.html',
  styleUrl: './exceptions-card.scss',
})
export class ExceptionsCard {
  private readonly service = inject(AvailabilityService);
  private readonly notify = inject(NotifyService);

  readonly draft = input.required<AvailabilityDraft>();
  /**
   * Les exceptions **telles qu'elles sont en base**. Référence du « modifié » :
   * sans elle, la carte proposerait d'enregistrer un état identique au serveur.
   */
  readonly baseline = input<readonly AvailabilityExceptionPayload[] | null>(null);
  readonly changed = output<AvailabilityDraft>();
  /** Enregistré : le parent réaligne sa tranche et recharge l'aperçu. */
  readonly persisted = output<AvailabilityConfigView>();

  protected readonly kinds = KINDS;
  protected readonly periods = PERIODS;

  /** Aujourd'hui à Paris — plancher de saisie autant que borne de la liste. */
  protected readonly today = parisToday();

  protected readonly upcoming = computed(() =>
    upcomingExceptions(this.draft().exceptions, this.today),
  );

  /** Le formulaire d'ajout — local à la carte, il ne touche au brouillon qu'au clic. */
  protected readonly day = signal('');
  protected readonly kind = signal<ExceptionKind>('closed');
  protected readonly period = signal<ExceptionPeriod>('day');
  protected readonly reason = signal('');

  protected readonly saving = signal(false);

  /**
   * Un jour valide et **pas dans le passé** : une exception datée d'hier
   * n'apparaîtrait nulle part, et le commercial croirait l'avoir posée.
   */
  protected readonly canAdd = computed(
    () => /^\d{4}-\d{2}-\d{2}$/u.test(this.day()) && this.day() >= this.today,
  );

  /** Y a-t-il quelque chose à enregistrer ? Le pied n'apparaît qu'alors. */
  protected readonly dirty = computed(() => {
    const baseline = this.baseline();
    return baseline !== null && !sameExceptions(this.draft().exceptions, baseline);
  });

  protected onKind(key: string): void {
    this.kind.set(key === 'open' ? 'open' : 'closed');
  }

  protected onPeriod(key: string): void {
    this.period.set(key === 'morning' || key === 'afternoon' ? key : 'day');
  }

  protected add(): void {
    if (!this.canAdd()) {
      return;
    }
    const bounds = boundsFor(this.kind(), this.period());
    this.changed.emit(
      addException(this.draft(), {
        day: this.day(),
        kind: this.kind(),
        startTime: bounds.startTime,
        endTime: bounds.endTime,
        reason: this.reason().trim(),
      }),
    );
    this.day.set('');
    this.reason.set('');
  }

  /** Retire par l'index **du brouillon**, jamais par la position à l'écran. */
  protected remove(index: number): void {
    this.changed.emit(removeException(this.draft(), index));
  }

  /**
   * Le résultat part en **toast** : une fois enregistré, le pied disparaît (plus
   * rien n'est modifié), et un message posé là où le bouton vient de s'effacer
   * n'aurait nulle part où tenir.
   */
  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      // On remonte ce que le SERVEUR a écrit, pas ce qu'on croit avoir envoyé.
      this.persisted.emit(await this.service.saveExceptions(this.draft().exceptions));
      this.notify.success('Fermetures exceptionnelles enregistrées.');
    } catch (error) {
      this.notify.error(error, "L'enregistrement des fermetures a échoué.");
    } finally {
      this.saving.set(false);
    }
  }
}
