import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FoldFieldComponent, FoldFieldListComponent } from 'fold-ng';
import type { TotalRow } from '@lfd/b2b-ui/order';

/**
 * **Le détail des montants du panier**, tel que `orderTotalRows` le rend pour
 * toute commande : au compte le seul « Total HT » et sa mention (F5), au lien
 * la TVA et le « Total TTC ». Ce bloc n'a aucune règle à lui — il affiche.
 */
@Component({
  selector: 'app-montants-panier',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldFieldComponent, FoldFieldListComponent],
  templateUrl: './montants-panier.html',
  styleUrl: './montants-panier.scss',
})
export class MontantsPanier {
  readonly rows = input.required<readonly TotalRow[]>();
}
