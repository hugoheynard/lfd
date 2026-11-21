import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { OrderDraftSummaryView } from '@lfd/contracts';
import { formatOrderDate } from '@lfd/b2b-ui/order';
import {
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';

import { COUNTER_ORDER_ENTRY_LINK } from '../nouvelle-commande/order-entry-origin';
import { orderEntryParams } from '../nouvelle-commande/order-entry-return';
import { OrderDraftsService } from '../order-drafts.service';

type LoadState = 'loading' | 'ready' | 'error';

/** L'heure d'enregistrement, à l'heure de Paris — quel que soit le fuseau du poste. */
const PARIS_TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
});

/** Le plus récent d'abord : c'est l'ordre que le serveur rend. */
const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'savedAt', label: 'Enregistré le', width: '9rem' },
  { key: 'companyName', label: 'Client' },
  { key: 'savedByName', label: 'Par', width: '14rem' },
];

const EMPTY: FoldTableEmpty = {
  title: 'Aucun brouillon',
  subtitle: 'Une saisie mise de côté par « Enregistrer le brouillon » se retrouve ici.',
};

/** Où la saisie ramène une fois finie : cet onglet-ci. */
const DRAFTS_ORIGIN = '/commandes?view=drafts';

/**
 * **Les saisies mises de côté**, un brouillon par compte, les plus récents
 * d'abord (décidé par Hugo le 2026-11-21) : on les retrouve depuis la liste
 * des commandes, sans passer par le comptoir ni se souvenir du client.
 *
 * Une ligne rouvre la saisie du compte, qui reprend le brouillon d'elle-même,
 * et y ramène quand elle est finie.
 */
@Component({
  selector: 'app-order-drafts-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './order-drafts-list.html',
  styleUrl: './order-drafts-list.scss',
})
export class OrderDraftsList {
  private readonly drafts = inject(OrderDraftsService);
  private readonly router = inject(Router);

  protected readonly state = signal<LoadState>('loading');
  protected readonly rows = signal<readonly OrderDraftSummaryView[]>([]);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.rows.set(await this.drafts.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected readonly columns = COLUMNS;
  protected readonly empty = EMPTY;
  protected readonly rowKey = (draft: OrderDraftSummaryView): string => draft.companyId;

  protected date(draft: OrderDraftSummaryView): string {
    return formatOrderDate(draft.savedAt);
  }

  protected time(draft: OrderDraftSummaryView): string {
    return PARIS_TIME.format(new Date(draft.savedAt));
  }

  protected resume(draft: OrderDraftSummaryView): void {
    void this.router.navigate([COUNTER_ORDER_ENTRY_LINK, draft.companyId], {
      queryParams: orderEntryParams(DRAFTS_ORIGIN),
    });
  }
}
