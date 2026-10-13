import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  type OnInit,
} from '@angular/core';
import type { InternalTransferManifestView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelHeaderComponent,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { TransferLines } from '../transfer-lines/transfer-lines';
import { DeliveryTransfersService } from '../delivery-transfers.service';
import { manifestFreshness, manifestSections, sectionSubtitle } from '../transfer-manifest';

/** Ce que le dialogue reçoit : de quoi lire et nommer le transfert. */
export interface TransferManifestDialogData {
  readonly transferId: string;
  readonly siteLabel: string;
}

type ManifestState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: InternalTransferManifestView };

/**
 * **Le manifeste d'un transfert** — ce qu'il transporte, par section
 * (commandes, réapprovisionnement) puis tous genres confondus, par article
 * (plan du transfert interne, lot T1). Une consultation : aucun geste.
 */
@Component({
  selector: 'app-transfer-manifest-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelHeaderComponent,
    TransferLines,
  ],
  templateUrl: './transfer-manifest-dialog.html',
  styleUrl: './transfer-manifest-dialog.scss',
})
export class TransferManifestDialog
  implements FoldPanelContent<TransferManifestDialogData>, OnInit
{
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<TransferManifestDialogData>();

  private readonly api = inject(DeliveryTransfersService);

  protected readonly state = signal<ManifestState>({ status: 'loading' });

  protected readonly title = computed(() => `Manifeste · → ${this.data().siteLabel}`);

  protected readonly view = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view : null;
  });

  protected readonly sections = computed(() => {
    const view = this.view();
    return view === null ? [] : manifestSections(view);
  });

  protected readonly freshness = computed(() => {
    const view = this.view();
    return view === null ? '' : manifestFreshness(view);
  });

  protected readonly totalSubtitle = computed(() => {
    const view = this.view();
    if (view === null) {
      return '';
    }
    const items = view.orders.items.length + view.resupplies.items.length;
    return sectionSubtitle(items, 'élément', 'éléments', view.totals);
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set({ status: 'loading' });
    try {
      const view = await this.api.manifest(this.data().transferId);
      this.state.set({ status: 'ready', view });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
