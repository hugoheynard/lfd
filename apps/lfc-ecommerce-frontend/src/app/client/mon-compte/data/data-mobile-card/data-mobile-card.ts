import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import { ClientCopyService } from '../../../copy/client-copy.service';
import { CardFoot } from '../../card-foot/card-foot';
import { DataPanel } from '../data-panel/data-panel';

/** La carte **Mes données** en pile : une ligne qui dit de quoi parle le panneau. */
@Component({
  selector: 'app-data-mobile-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardFoot],
  templateUrl: './data-mobile-card.html',
  styleUrl: './data-mobile-card.scss',
})
export class DataMobileCard {
  protected readonly t = inject(ClientCopyService).t;
  private readonly panels = inject(FoldPanelHostService);

  protected open(): void {
    DataPanel.open(this.panels);
  }
}
