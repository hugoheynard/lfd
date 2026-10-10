import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { seriesMonth } from '../media-series';

/** Ce qu'une pastille de série lit — la référence d'une tuile comme la vue d'une liste. */
export interface SeriesChipValue {
  readonly title: string;
  readonly shotOn: string | null;
}

/**
 * **La pastille d'une série** — « Shooting carte 2026 · mars 2026 ».
 *
 * Cousine de `app-tag-chip`, et volontairement DISTINCTE : une série n'est pas
 * un mot-clé. Une image en a au plus une, elle regroupe au lieu de filtrer, et
 * les deux pastilles côte à côte sur une tuile ne doivent pas se lire comme
 * une seule liste. D'où l'icône de dossier et la surface `info` — là où le
 * mot-clé reste sur la surface de carte.
 *
 * 🔴 Applicative faute de primitive, pour la même raison que la pastille de
 * mot-clé : `fold-badge` n'a qu'un `content` texte, sans icône ni bouton de
 * retrait (vérifié dans `fold-ng.d.ts` le 2026-10-10).
 */
@Component({
  selector: 'app-series-chip',
  imports: [FoldIconComponent],
  templateUrl: './series-chip.html',
  styleUrl: './series-chip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeriesChip {
  readonly series = input.required<SeriesChipValue>();
  /** Ajoute le × — le relâcher d'un filtre, retirer un choix. */
  readonly removable = input(false, { transform: booleanAttribute });
  /** Ce que dit le × à qui ne le voit pas. */
  readonly removeLabel = input('Retirer la série');

  readonly removed = output();

  protected readonly month = computed(() => seriesMonth(this.series().shotOn));
}
