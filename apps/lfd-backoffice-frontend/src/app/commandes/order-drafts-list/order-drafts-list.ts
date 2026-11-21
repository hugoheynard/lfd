import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { OrderDraftSummaryView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { draftBadgeLabel } from '../../comptoir/nouvelle-commande-pro/draft-badge-label';
import { COUNTER_ORDER_ENTRY_LINK } from '../nouvelle-commande/order-entry-origin';
import { orderEntryParams } from '../nouvelle-commande/order-entry-return';
import { OrderDraftsService } from '../order-drafts.service';

type LoadState = 'loading' | 'ready' | 'error';

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
    FoldCardComponent,
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

  /** « Brouillon · 14 h 05 · Léa Martin » — l'auteur seulement s'il est connu. */
  protected savedLabel(draft: OrderDraftSummaryView): string {
    const when = draftBadgeLabel(draft.savedAt, new Date());
    return draft.savedByName === null ? when : `${when} · ${draft.savedByName}`;
  }

  protected resume(draft: OrderDraftSummaryView): void {
    void this.router.navigate([COUNTER_ORDER_ENTRY_LINK, draft.companyId], {
      queryParams: orderEntryParams(DRAFTS_ORIGIN),
    });
  }
}
