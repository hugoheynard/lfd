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
 * **« Versions précédentes »** sur la fiche d'une commande (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification ») : chaque
 * modification — qui, quand, l'écart, ce qui a changé — et, à la demande, la
 * composition qu'elle a remplacée (lignes, quantités, prix, acheminement),
 * lue dans `public.order_revision` par `GET /admin/orders/:id/revisions`.
 *
 * Le client ne voit que la commande actuelle (partie 1) : cette carte n'existe
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
