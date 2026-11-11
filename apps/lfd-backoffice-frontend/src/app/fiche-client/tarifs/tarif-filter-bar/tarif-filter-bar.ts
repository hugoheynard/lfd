import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { FoldCheckboxComponent, FoldListboxComponent, FoldSearchComponent } from 'fold-ng';

/**
 * **Le filtre au-dessus de la table des tarifs** — une famille, une recherche
 * par nom ou SKU, et une case qui resserre la table. Partagé par la
 * composition (« Seulement les articles avec un prix ferme ») et l'avenant
 * (« Seulement les changements »). État local : rien ne part au serveur.
 */
@Component({
  selector: 'app-tarif-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCheckboxComponent, FoldListboxComponent, FoldSearchComponent],
  templateUrl: './tarif-filter-bar.html',
  styleUrl: './tarif-filter-bar.scss',
})
export class TarifFilterBar {
  readonly shelfOptions = input.required<readonly { value: string; label: string }[]>();
  readonly checkLabel = input.required<string>();
  readonly shelf = model.required<string>();
  readonly search = model.required<string>();
  readonly checked = model.required<boolean>();
}
