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
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { toLine } from '../../admin/journal/journal-line';
import type { JournalLine } from '../../admin/journal/journal.service';
import { FactDetail } from '../../shared/journal/fact-detail/fact-detail';
import { FactSentence } from '../../shared/journal/fact-sentence/fact-sentence';
import { AdminOrdersService } from '../orders.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **« Historique »** sur la fiche d'une commande (plan `plan-page-commandes.md`
 * §3 bis) : les faits du journal qui la touchent, mis en phrase par le même
 * moteur que le journal d'activité, pour qu'un fait se lise pareil aux deux
 * endroits.
 *
 * Un échec de lecture reste DANS la carte : le statut, la composition et le
 * prix, lus par une autre route, restent à l'écran.
 */
@Component({
  selector: 'app-order-history-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FactDetail,
    FactSentence,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './order-history-card.html',
  styleUrl: './order-history-card.scss',
})
export class OrderHistoryCard {
  readonly orderId = input.required<string>();

  private readonly service = inject(AdminOrdersService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly lines = signal<readonly JournalLine[]>([]);

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
      const events = await this.service.history(orderId);
      this.lines.set(events.map(toLine));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
