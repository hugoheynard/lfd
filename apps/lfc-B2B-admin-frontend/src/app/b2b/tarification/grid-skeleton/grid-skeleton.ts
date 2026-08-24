import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * **L'ossature de l'écran, pendant que les prix se résolvent.**
 *
 * Une ossature plutôt qu'un rond qui tourne : elle reprend les proportions du
 * vrai écran — le bandeau, puis des rayons de lignes — donc l'œil se place avant
 * que la donnée n'arrive. Un spinner, lui, ne dit que « attends ».
 *
 * Composant à part et non quelques lignes dans la page : c'est de la
 * présentation pure, sans état, et la page a déjà sept colonnes à décrire.
 */
@Component({
  selector: 'app-grid-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './grid-skeleton.html',
  styleUrl: './grid-skeleton.scss',
})
export class GridSkeleton {
  /** Deux rayons de trois lignes : assez pour dire la forme, pas assez pour mentir. */
  protected readonly shelves = [0, 1];
  protected readonly rows = [0, 1, 2];
}
