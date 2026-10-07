import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { BinTypeView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { BinTypeDialog, type BinTypeDialogData } from '../bin-type-dialog/bin-type-dialog';
import {
  activeBinsLabel,
  archivedOnLabel,
  binTraitsLabel,
  dimensionsLabel,
  litersLabel,
  splitBins,
} from '../delivery-bins';
import { DeliveryBinsService } from '../delivery-bins.service';

type BinsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly types: readonly BinTypeView[] };

/**
 * **Les bacs** — le catalogue des types de bacs dans lesquels tout part en
 * livraison (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 4
 * bis v2, tranche A).
 *
 * Un type ne se supprime pas : il s'**archive** — il reste lisible sur les bacs
 * déjà déclarés et n'est plus proposé (v2-7) — et se réactive. Les gestes
 * n'apparaissent qu'avec `delivery_settings:write` ; le serveur refuse de
 * toute façon, et ses refus s'affichent tels quels.
 */
@Component({
  selector: 'app-bins-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './bins-page.html',
  styleUrl: './bins-page.scss',
})
export class BinsPage {
  private readonly api = inject(DeliveryBinsService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly state = signal<BinsState>({ status: 'loading' });
  /** Le refus d'un archivage ou d'une réactivation — la liste reste à l'écran. */
  protected readonly refusal = signal<string | null>(null);
  /** Le type dont un geste est en vol : ses boutons attendent. */
  protected readonly busyId = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('delivery_settings:write'));

  protected readonly catalogue = computed(() => {
    const state = this.state();
    return splitBins(state.status === 'ready' ? state.types : []);
  });

  protected readonly activeCount = computed(() => activeBinsLabel(this.catalogue().active.length));

  protected readonly dimensions = dimensionsLabel;
  protected readonly liters = litersLabel;
  protected readonly traits = binTraitsLabel;
  protected readonly archivedOn = archivedOnLabel;

  constructor() {
    void this.load();
  }

  protected retry(): void {
    void this.load();
  }

  protected add(): void {
    void this.edit({});
  }

  protected correct(bin: BinTypeView): void {
    void this.edit({ bin });
  }

  protected archive(bin: BinTypeView): Promise<void> {
    return this.act(
      bin,
      () => this.api.archiveBinType(bin.id),
      `« ${bin.name} » archivé.`,
      "Le type de bac n'a pas pu être archivé.",
    );
  }

  protected reactivate(bin: BinTypeView): Promise<void> {
    return this.act(
      bin,
      () => this.api.reactivateBinType(bin.id),
      `« ${bin.name} » de nouveau proposé.`,
      "Le type de bac n'a pas pu être réactivé.",
    );
  }

  private async edit(data: BinTypeDialogData): Promise<void> {
    this.refusal.set(null);
    const ref = this.panels.open<BinTypeDialogData, boolean>(BinTypeDialog, { data });
    if ((await ref.closed) !== true) {
      return;
    }
    this.notify.success(data.bin === undefined ? 'Type de bac ajouté.' : 'Type de bac mis à jour.');
    await this.load();
  }

  private async act(
    bin: BinTypeView,
    write: () => Promise<void>,
    said: string,
    fallback: string,
  ): Promise<void> {
    if (this.busyId() !== null) {
      return;
    }
    this.busyId.set(bin.id);
    this.refusal.set(null);
    try {
      await write();
      this.notify.success(said);
      await this.load();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, fallback));
    } finally {
      this.busyId.set(null);
    }
  }

  private async load(): Promise<void> {
    // Une relecture après un geste garde la liste à l'écran.
    if (this.state().status !== 'ready') {
      this.state.set({ status: 'loading' });
    }
    try {
      const view = await this.api.binTypes();
      this.state.set({ status: 'ready', types: view.types });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}
