import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { FoldFieldComponent, FoldFieldListComponent, FoldIconComponent } from 'fold-ng';

import type { DetailRow } from '../detail-rows';

/** Suffixe des ids de panneau : un par instance, pour `aria-controls`. */
let nextPanel = 0;

/**
 * **Le détail d'un fait** : tout ce que la phrase n'a pas dit, clé par clé
 * (D4 du plan des phrases du journal).
 *
 * Replié par défaut — la phrase suffit à parcourir un journal — et ouvert d'un
 * geste, au clavier comme à la souris : le déclencheur est un vrai bouton qui
 * annonce son état (`aria-expanded`). Rien quand il n'y a rien à ajouter.
 *
 * ⚠️ **Pas `fold-disclosure`**, et c'est délibéré (Hugo, 2026-09-19, en
 * relisant l'écran Journal) : elle est dessinée comme une carte — bordure,
 * fond, marge intérieure, titre en gras sur toute la largeur. Répétée sous
 * chaque ligne d'un journal, même repliée, elle prenait plus de place que la
 * phrase qu'elle complète. Ici, replié, le détail n'est qu'un mot discret.
 */
@Component({
  selector: 'app-fact-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldFieldComponent, FoldFieldListComponent, FoldIconComponent],
  templateUrl: './fact-detail.html',
  styleUrl: './fact-detail.scss',
})
export class FactDetail {
  readonly rows = input.required<readonly DetailRow[]>();

  protected readonly open = signal(false);
  protected readonly panelId = `fact-detail-${String(++nextPanel)}`;

  protected toggle(): void {
    this.open.update((open) => !open);
  }
}
