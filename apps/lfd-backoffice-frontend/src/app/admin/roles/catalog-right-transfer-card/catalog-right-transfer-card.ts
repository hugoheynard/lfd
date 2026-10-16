import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CatalogRightTransferView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import { StaffRolesService } from '../staff-roles.service';
import { pendingCount, transferLines, type TransferLine } from './transfer-lines';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **L'aperçu du transfert « Catalogue vendu » → « Catalogue publié »**
 * (`documentation/droits-et-permissions/plan-droit-lfc-catalog.md`, C2).
 *
 * Lecture seule, et délibérément : on accorde à l'écran, un rôle à la fois.
 * La carte dit ce qui reste ; « Sans écart » est la condition du lot L2. Elle
 * disparaîtra avec lui.
 */
@Component({
  selector: 'app-catalog-right-transfer-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent, FoldBadgeComponent, FoldCalloutComponent],
  templateUrl: './catalog-right-transfer-card.html',
  styleUrl: './catalog-right-transfer-card.scss',
})
export class CatalogRightTransferCard {
  private readonly service = inject(StaffRolesService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<CatalogRightTransferView | null>(null);

  protected readonly lines = computed<readonly TransferLine[]>(() => {
    const view = this.view();
    return view === null ? [] : transferLines(view);
  });

  protected readonly pending = computed(() => {
    const view = this.view();
    return view === null ? 0 : pendingCount(view);
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.view.set(await this.service.catalogRightTransfer());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
