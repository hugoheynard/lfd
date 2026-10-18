import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AudienceCell } from '@lfd/contracts';
import {
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { audienceRowOf, type AudienceRow } from '../audience-format';

/**
 * **Une coupe de la clientèle** : son titre, puis une ligne par case. Une
 * case sous le seuil d'anonymat le dit dans la colonne des clients, et ne
 * porte qu'un tiret ailleurs — le serveur ne lui a envoyé aucun chiffre.
 */
@Component({
  selector: 'app-audience-segment-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './audience-segment-card.html',
  styleUrl: './audience-segment-card.scss',
})
export class AudienceSegmentCard {
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly cells = input.required<readonly AudienceCell[]>();

  protected readonly rows = computed(() => this.cells().map(audienceRowOf));

  protected readonly columns: readonly FoldTableColumn<AudienceRow>[] = [
    { key: 'label', label: 'Segment' },
    { key: 'clients', label: 'Clients', numeric: true },
    { key: 'orders', label: 'Commandes', numeric: true },
    { key: 'averageBasket', label: 'Panier moyen', numeric: true },
    { key: 'revenue', label: 'Chiffre d’affaires', numeric: true },
    { key: 'topFamilies', label: 'Familles en tête' },
  ];

  protected readonly rowKey = (row: AudienceRow): string => row.key;

  protected readonly empty = { title: 'Aucune commande dans cette coupe sur la période.' };
}
