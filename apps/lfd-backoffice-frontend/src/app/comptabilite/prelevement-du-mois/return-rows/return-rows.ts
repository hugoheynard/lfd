import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CollectionReturnView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { returnAmount, returnBadge, returnSentence } from '../../collection-return-wording';

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'debtor', label: 'Débiteur' },
  { key: 'what', label: 'Retour' },
  { key: 'amount', label: 'Montant', numeric: true },
  { key: 'state', label: 'Suite' },
  { key: 'actions', label: 'Gestes' },
];

/** Un geste sur un retour, que le conteneur exécute. */
export type ReturnGesture = 'represent' | 'settle' | 'write-off';

export interface ReturnGestureEvent {
  readonly item: CollectionReturnView;
  readonly gesture: ReturnGesture;
}

/**
 * **Les retours d'un lot** et leurs gestes (R5a). Re-présenter n'est offert
 * que si le serveur l'admet — sinon ses mots disent pourquoi. Un motif qui
 * dit que le mandat ne tient plus PROPOSE de le révoquer, par le geste qui
 * existe déjà sur la fiche du client : rien n'est révoqué d'ici.
 */
@Component({
  selector: 'app-return-rows',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    RouterLink,
  ],
  templateUrl: './return-rows.html',
  styleUrl: './return-rows.scss',
})
export class ReturnRows {
  readonly returns = input.required<readonly CollectionReturnView[]>();
  readonly canWrite = input(false);
  readonly pendingId = input<string | null>(null);

  readonly gesture = output<ReturnGestureEvent>();

  protected readonly columns = COLUMNS;
  protected readonly rowKey = (row: CollectionReturnView): string => row.id;

  protected readonly badge = returnBadge;
  protected readonly sentence = returnSentence;
  protected readonly amount = returnAmount;

  protected informationsOf(row: CollectionReturnView): readonly string[] {
    return ['/comptes-clients', row.debtorCompanyId, 'informations'];
  }
}
