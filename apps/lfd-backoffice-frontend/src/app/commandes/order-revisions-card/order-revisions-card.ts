import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDisclosureComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { AdminOrdersService } from '../orders.service';
import { revisionRowOf, type RevisionRow } from './revision-entry';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **« Versions précédentes »** sur la fiche d'une commande (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, §6, M3) : chaque
 * modification — qui, quand, l'écart, ce qui a changé — et, à la demande, la
 * composition qu'elle a remplacée (lignes, quantités, prix, acheminement),
 * lue dans `public.order_revision` par `GET /admin/orders/:id/revisions`.
 *
 * Le client ne voit que la commande actuelle (§6) : cette carte n'existe
 * qu'au back-office. Un échec de lecture reste DANS la carte.
 */
@Component({
  selector: 'app-order-revisions-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDisclosureComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './order-revisions-card.html',
  styleUrl: './order-revisions-card.scss',
})
export class OrderRevisionsCard {
  readonly orderId = input.required<string>();

  private readonly service = inject(AdminOrdersService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly rows = signal<readonly RevisionRow[]>([]);

  constructor() {
    effect(() => {
      const id = this.orderId();
      untracked(() => void this.load(id));
    });
  }

  protected retry(): void {
    void this.load(this.orderId());
  }

  private async load(orderId: string): Promise<void> {
    this.state.set('loading');
    try {
      const entries = await this.service.revisions(orderId);
      this.rows.set(entries.map(revisionRowOf));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
