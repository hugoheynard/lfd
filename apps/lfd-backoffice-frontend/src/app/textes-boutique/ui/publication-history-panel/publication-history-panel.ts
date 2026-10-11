import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDisclosureComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelHeaderComponent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { ShopCopyService } from '../../data/shop-copy.service';
import { publicationOf, type Publication } from '../../rules/publication-history';

const HISTORY_LIMIT = 20;

const WHEN = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

/**
 * **L'historique des publications** (plan §7, §10) — les vingt dernières, et
 * pour chacune les textes changés, avant et après. C'est la seule mémoire de
 * ce que la boutique disait la veille : de quoi relire, et remettre à la main.
 */
@Component({
  selector: 'app-publication-history-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDisclosureComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './publication-history-panel.html',
  styleUrl: './publication-history-panel.scss',
})
export class PublicationHistoryPanel implements OnInit {
  static readonly foldPanel: FoldPanelDefaults = { width: 'lg' };

  private readonly api = inject(ShopCopyService);

  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal('');
  protected readonly publications = signal<readonly Publication[]>([]);

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.status.set('loading');
    try {
      const page = await this.api.history(1, HISTORY_LIMIT);
      this.publications.set(page.events.map(publicationOf));
      this.status.set('ready');
    } catch (error) {
      this.error.set(httpErrorMessage(error, 'L’historique n’a pas pu être lu.'));
      this.status.set('failed');
    }
  }

  protected when(iso: string): string {
    return WHEN.format(new Date(iso));
  }
}
