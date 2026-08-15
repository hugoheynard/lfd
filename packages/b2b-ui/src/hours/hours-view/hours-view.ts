import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { FoldIconComponent } from 'fold-ng';
import type { FoldIconName } from 'fold-ng';

import { declaredHours, formatTimeRange, type HoursEntry } from '../hours.model';

/** Une ligne prête à écrire : le nom, et l'heure ou le tiret qui la remplace. */
interface HoursLine {
  readonly key: string;
  readonly label: string;
  readonly text: string;
  readonly declared: boolean;
}

/**
 * Des **plages horaires affichées** — le pendant lecture de `lfd-hours-form`.
 *
 * `hideEmpty` décide de la question qui sépare les deux usages réels : une
 * liste de plages déclarées les montre **seules** (ce qui n'est pas dit
 * n'existe pas), une grille de semaine garde ses sept lignes avec un tiret,
 * parce que « mardi : rien » est justement l'information.
 *
 * Candidat `fold-ng` : zéro vocabulaire métier.
 */
@Component({
  selector: 'lfd-hours',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './hours-view.html',
  styleUrl: './hours-view.scss',
  host: { '[class.is-rows]': "layout() === 'rows'" },
})
export class HoursView {
  readonly entries = input.required<readonly HoursEntry[]>();

  /** `inline` : les plages se suivent. `rows` : une par ligne, nom à gauche. */
  readonly layout = input<'inline' | 'rows'>('inline');

  /** Ne garder que les plages déclarées. Sinon chaque ligne reste, en creux. */
  readonly hideEmpty = input(false, { transform: booleanAttribute });

  /** Ce qu'on écrit à la place d'une plage non déclarée. */
  readonly emptyText = input('—');

  /** L'horloge en tête. Vraie par défaut : elle dit « des heures » d'un regard. */
  readonly icon = input(true, { transform: booleanAttribute });
  readonly iconName = input<FoldIconName>('clock');

  /** Ce qu'on dit quand rien n'est déclaré du tout. Vide = on ne dit rien. */
  readonly noneText = input('');

  protected readonly lines = computed<readonly HoursLine[]>(() => {
    const entries = this.hideEmpty() ? declaredHours(this.entries()) : this.entries();
    return entries.map((entry) => {
      const text = formatTimeRange(entry.range);
      return {
        key: entry.key,
        label: entry.label,
        text: text === '' ? this.emptyText() : text,
        declared: text !== '',
      };
    });
  });

  /** Aucune plage à montrer : l'écran doit pouvoir le dire. */
  protected readonly isEmpty = computed(() => this.lines().length === 0);
}
