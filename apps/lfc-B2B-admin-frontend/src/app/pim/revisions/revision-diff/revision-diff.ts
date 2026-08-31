import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { CatalogRevisionDiffView } from '@lfd/pim-contracts';
import { FoldCalloutComponent, FoldElementTitleComponent } from 'fold-ng';

/**
 * **Ce qui a changé entre deux révisions.**
 *
 * Trois natures, trois blocs, et elles ne se mélangent pas : ce qui est entré au
 * catalogue, ce qui en est sorti, ce qui a bougé. Une liste unique obligerait le
 * lecteur à trier lui-même, alors que les trois questions se posent séparément —
 * « qu'est-ce qu'on vend en plus » n'est pas « qu'est-ce qui a changé de prix ».
 *
 * L'en-tête vient en PREMIER. Il porte le rapport professionnel, qui bouge sans
 * qu'aucun article ne change : le mettre en bas le ferait manquer sur un diff
 * long, alors que c'est le seul changement qui touche toutes les factures d'un
 * coup.
 */
@Component({
  selector: 'app-revision-diff',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldElementTitleComponent],
  templateUrl: './revision-diff.html',
  styleUrl: './revision-diff.scss',
})
export class RevisionDiff {
  readonly diff = input.required<CatalogRevisionDiffView>();
}
