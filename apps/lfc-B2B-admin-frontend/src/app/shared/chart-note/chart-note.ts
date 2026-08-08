import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * **Légende d'un graphe** — sous une visualisation de dashboard, une note en deux
 * lignes : *Objectif* (ce que le graphe cherche à répondre) et *Lecture* (comment
 * l'interpréter). Toujours visible (contrairement à la bulle d'aide), purement
 * présentational.
 */
@Component({
  selector: 'app-chart-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chart-note.html',
  styleUrl: './chart-note.scss',
})
export class ChartNote {
  /** Ce que le graphe cherche à répondre. */
  readonly goal = input.required<string>();
  /** Comment lire le graphe. */
  readonly read = input.required<string>();
}
