import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldTimeComponent,
} from 'fold-ng';

import { isDeadlineTime, withDeadline, withoutDeadline } from '../deadline-list.model';
import { formatDeadline } from '../delivery-format';

/** Les mots du champ — fournis par `lfd-delivery-specs`, dans la langue de l'app. */
export interface DeadlineListFieldLabels {
  readonly before: string;
  readonly add: string;
  /** Le libellé du champ horaire ; le nom de la ligne le suit. */
  readonly newDeadline: string;
  /** `{deadline}` : l'échéance retirée. */
  readonly remove: string;
  readonly none: string;
}

/**
 * **Une liste d'échéances à éditer** — ajouter une heure, en retirer une
 * (plan composition automatique, CA3 : une adresse peut en porter plusieurs,
 * 6 h pour le pain, 11 h pour le déjeuner).
 *
 * L'ordre et l'unicité sont tenus à chaque geste (`deadline-list.model.ts`) :
 * la liste rendue est toujours celle que le contrat accepte.
 */
@Component({
  selector: 'lfd-deadline-list-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent, FoldButtonIconComponent, FoldTimeComponent],
  templateUrl: './deadline-list-field.html',
  styleUrl: './deadline-list-field.scss',
})
export class DeadlineListField {
  /** Les échéances, triées et sans doublon (two-way). */
  readonly value = model.required<readonly string[]>();
  /** Le nom de la ligne : « Tous les jours », « Lundi »… */
  readonly name = input.required<string>();
  readonly labels = input.required<DeadlineListFieldLabels>();

  /** L'heure tapée, pas encore ajoutée. */
  protected readonly pending = signal('');

  protected readonly canAdd = computed(() => {
    const time = this.pending();
    return isDeadlineTime(time) && !this.value().includes(time);
  });

  protected readonly newLabel = computed(() => `${this.labels().newDeadline} · ${this.name()}`);

  protected text(time: string): string {
    return formatDeadline(time, this.labels().before);
  }

  protected removeLabel(time: string): string {
    return this.labels().remove.replace('{deadline}', this.text(time));
  }

  protected add(): void {
    if (!this.canAdd()) {
      return;
    }
    this.value.update((times) => withDeadline(times, this.pending()));
    this.pending.set('');
  }

  protected remove(time: string): void {
    this.value.update((times) => withoutDeadline(times, time));
  }
}
