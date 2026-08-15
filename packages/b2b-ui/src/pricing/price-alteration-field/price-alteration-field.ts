import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FoldCheckboxComponent, FoldNumberInputComponent } from 'fold-ng';

import {
  alterationSentence,
  alterationValue,
  buildAlteration,
  type PriceAlteration,
  type PriceDirection,
} from '../price-alteration.model';

/**
 * Éditeur d'une {@link PriceAlteration} — sens, unité, grandeur, et la phrase
 * qui dit ce que ça fait.
 *
 * Trois choix, séparés parce qu'ils répondent à trois questions :
 *
 * - **le sens** (majorer / minorer). Verrouillable via `lockedDirection` quand
 *   il est structurel — la remise d'un point de retrait ne majore jamais, et
 *   offrir le bouton inviterait à créer une donnée que l'écran ne sait pas lire ;
 * - **l'unité** (% / €) ;
 * - **la grandeur**, toujours positive : le signe se dit par le sens.
 *
 * Le cas « pas d'altération » est une **case à cocher étiquetée par l'appelant**
 * (`noneLabel`), pas un troisième bouton dans le segmenté des unités. « Aucune »
 * n'est pas une unité, et le mettre à côté de `%` et `€` forçait l'utilisateur à
 * relire trois boutons pour comprendre que le premier ne parlait pas de la même
 * chose. Sans `noneLabel`, la case n'apparaît pas : la valeur est obligatoire.
 *
 * Les deux commandes ne se contredisent jamais — saisir un nombre décoche, et
 * cocher désactive le nombre. Un écran où la case dit « aucune » pendant qu'un
 * montant reste lisible à côté n'a pas de réponse à « alors, c'est combien ? ».
 */
@Component({
  selector: 'lfd-price-alteration-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldNumberInputComponent, FoldCheckboxComponent],
  templateUrl: './price-alteration-field.html',
  styleUrl: './price-alteration-field.scss',
})
export class PriceAlterationField {
  readonly label = input.required<string>();
  readonly value = input<PriceAlteration | null>(null);
  /** Sens imposé quand il est structurel, ou `null` pour laisser choisir. */
  readonly lockedDirection = input<PriceDirection | null>(null);
  /** Étiquette de la case « pas d'altération ». Vide = pas de case, valeur exigée. */
  readonly noneLabel = input('');

  readonly valueChange = output<PriceAlteration | null>();

  protected readonly direction = signal<PriceDirection>('decrease');
  protected readonly mode = signal<'percent' | 'amount'>('percent');
  /** Grandeur telle que saisie (20 = 20 % ou 20 €), ou `null` si le champ est vide. */
  protected readonly amount = signal<number | null>(null);
  /** La case « pas d'altération » est-elle cochée ? */
  protected readonly none = signal(false);

  /** Le brouillon courant, tel qu'il sera émis. */
  protected readonly current = computed<PriceAlteration | null>(() =>
    this.none() ? null : buildAlteration(this.amount(), this.mode(), this.direction()),
  );

  protected readonly sentence = computed(() => alterationSentence(this.current()));
  protected readonly canPickDirection = computed(() => this.lockedDirection() === null);
  protected readonly hasNoneBox = computed(() => this.noneLabel() !== '');

  private readonly seeded = signal(false);

  constructor() {
    // Amorçage **unique**. Réamorcer à chaque `value()` ferait revenir l'état
    // par la valeur qu'on vient d'émettre : vider le champ émettrait `null`,
    // et l'écran se remettrait tout seul sur « pas d'altération » alors que
    // l'utilisateur était en train de retaper un nombre.
    effect(() => {
      const initial = this.value();
      const locked = this.lockedDirection();
      if (untracked(this.seeded)) {
        return;
      }
      this.seeded.set(true);
      this.direction.set(initial?.direction ?? locked ?? 'decrease');
      this.none.set(initial === null && this.noneLabel() !== '');
      if (initial !== null) {
        this.mode.set(initial.mode);
        this.amount.set(alterationValue(initial));
      }
    });
  }

  protected setDirection(direction: PriceDirection): void {
    this.direction.set(direction);
    this.emit();
  }

  protected setMode(mode: 'percent' | 'amount'): void {
    this.mode.set(mode);
    this.emit();
  }

  /** Saisir une grandeur **décoche** : on ne peut pas vouloir les deux. */
  protected setAmount(amount: number | null): void {
    this.amount.set(amount);
    this.none.set(false);
    this.emit();
  }

  protected setNone(none: boolean): void {
    this.none.set(none);
    this.emit();
  }

  private emit(): void {
    this.valueChange.emit(this.current());
  }
}
