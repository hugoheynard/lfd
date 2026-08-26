import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FoldFieldsetComponent, FoldTimeComponent } from 'fold-ng';

import { hoursIssueOf, withRangePart, type HoursEntry } from '../hours.model';

/**
 * Les **champs de plages horaires nommées** — le pendant saisie de `lfd-hours`.
 *
 * Une ligne par plage, deux `fold-time` et un tiret. Les lignes sont fournies
 * par l'appelant : c'est lui qui sait s'il édite « pro / public » ou sept
 * jours, et le fragment n'en sait rien.
 *
 * Candidat `fold-ng` : les libellés visibles sont paramétrables, avec des
 * défauts français comme le reste de fold.
 */
@Component({
  selector: 'lfd-hours-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldFieldsetComponent, FoldTimeComponent],
  templateUrl: './hours-form.html',
  styleUrl: './hours-form.scss',
})
export class HoursForm {
  /** Les plages à éditer (two-way). L'ordre est celui de l'affichage. */
  readonly value = model.required<readonly HoursEntry[]>();

  /** Titre du groupe. Vide = pas de légende (le container la porte déjà). */
  readonly legend = input('');
  /** Phrase sous la légende — la nuance que les champs ne peuvent pas dire. */
  readonly hint = input('');
  readonly startLabel = input('Début');
  readonly endLabel = input('Fin');

  protected readonly issue = computed(() => hoursIssueOf(this.value()));

  protected set(key: string, part: 'start' | 'end', time: string): void {
    this.value.update((entries) => withRangePart(entries, key, part, time));
  }
}
