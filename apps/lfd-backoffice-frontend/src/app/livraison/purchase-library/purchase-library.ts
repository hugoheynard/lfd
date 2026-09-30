import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { PurchaseBinCandidateView, PurchaseVehicleCandidateView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLinkComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import {
  PurchaseBinCandidateDialog,
  type PurchaseBinCandidateDialogData,
} from '../purchase-bin-candidate-dialog/purchase-bin-candidate-dialog';
import { archivedOnLabel, cmLabel } from '../purchase-library';
import { PurchaseLibraryService } from '../purchase-library.service';
import { priceLabel } from '../purchase-price';
import {
  PurchaseVehicleCandidateDialog,
  type PurchaseVehicleCandidateDialogData,
} from '../purchase-vehicle-candidate-dialog/purchase-vehicle-candidate-dialog';
import { cargoLabel, wheelArchesLabel } from '../vehicle-load';

type ListState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly candidates: readonly T[] };

/** Ce qu'un geste d'archivage a besoin de savoir d'un candidat. */
interface Named {
  readonly id: string;
  readonly name: string;
}

/**
 * **La bibliothèque d'achat** (`documentation/livraisons/plan-bibliotheque-d-achat.md`,
 * B-D1, lot B4) : les véhicules et les formats de bacs qu'on envisage
 * d'acheter, SÉPARÉS de la flotte et des types de bacs réels.
 *
 * Un onglet de l'assistant d'achat. Les archivés ne se montrent que sur
 * demande (`?archives=inclure`). Ajouter, corriger, archiver et réactiver
 * n'apparaissent qu'avec `delivery_rounds:write` (B-D6) ; le serveur refuse de
 * toute façon, et son refus s'affiche tel quel, la liste restant à l'écran.
 */
@Component({
  selector: 'app-purchase-library',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLinkComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './purchase-library.html',
  styleUrl: './purchase-library.scss',
})
export class PurchaseLibrary {
  private readonly api = inject(PurchaseLibraryService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly vehicles = signal<ListState<PurchaseVehicleCandidateView>>({
    status: 'loading',
  });
  protected readonly bins = signal<ListState<PurchaseBinCandidateView>>({ status: 'loading' });
  protected readonly showArchived = signal(false);
  /** Le refus d'un archivage ou d'une réactivation — les listes restent à l'écran. */
  protected readonly refusal = signal<string | null>(null);
  /** Le candidat dont un geste est en vol : les boutons attendent. */
  protected readonly busyId = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('delivery_rounds:write'));

  protected readonly price = priceLabel;
  protected readonly archivedOn = archivedOnLabel;
  protected readonly cm = cmLabel;
  protected readonly cargo = cargoLabel;
  protected readonly arches = wheelArchesLabel;

  constructor() {
    void this.loadVehicles();
    void this.loadBins();
  }

  protected toggleArchived(show: boolean): void {
    this.showArchived.set(show);
    void this.loadVehicles();
    void this.loadBins();
  }

  protected retryVehicles(): void {
    this.vehicles.set({ status: 'loading' });
    void this.loadVehicles();
  }

  protected retryBins(): void {
    this.bins.set({ status: 'loading' });
    void this.loadBins();
  }

  protected editVehicle(candidate?: PurchaseVehicleCandidateView): void {
    const data: PurchaseVehicleCandidateDialogData = candidate === undefined ? {} : { candidate };
    const opened = () =>
      this.panels.open<PurchaseVehicleCandidateDialogData, boolean>(
        PurchaseVehicleCandidateDialog,
        { data },
      ).closed;
    void this.edit(opened, candidate === undefined, () => this.loadVehicles());
  }

  protected editBin(candidate?: PurchaseBinCandidateView): void {
    const data: PurchaseBinCandidateDialogData = candidate === undefined ? {} : { candidate };
    const opened = () =>
      this.panels.open<PurchaseBinCandidateDialogData, boolean>(PurchaseBinCandidateDialog, {
        data,
      }).closed;
    void this.edit(opened, candidate === undefined, () => this.loadBins());
  }

  protected archiveVehicle(candidate: Named): Promise<void> {
    return this.act(
      candidate,
      () => this.api.archiveVehicleCandidate(candidate.id),
      'archivé',
      () => this.loadVehicles(),
    );
  }

  protected reactivateVehicle(candidate: Named): Promise<void> {
    return this.act(
      candidate,
      () => this.api.reactivateVehicleCandidate(candidate.id),
      'réactivé',
      () => this.loadVehicles(),
    );
  }

  protected archiveBin(candidate: Named): Promise<void> {
    return this.act(
      candidate,
      () => this.api.archiveBinCandidate(candidate.id),
      'archivé',
      () => this.loadBins(),
    );
  }

  protected reactivateBin(candidate: Named): Promise<void> {
    return this.act(
      candidate,
      () => this.api.reactivateBinCandidate(candidate.id),
      'réactivé',
      () => this.loadBins(),
    );
  }

  private async edit(
    opened: () => Promise<boolean | undefined>,
    isCreate: boolean,
    reload: () => Promise<void>,
  ): Promise<void> {
    this.refusal.set(null);
    if ((await opened()) !== true) {
      return;
    }
    this.notify.success(isCreate ? 'Candidat ajouté.' : 'Candidat mis à jour.');
    await reload();
  }

  private async act(
    candidate: Named,
    write: () => Promise<void>,
    done: string,
    reload: () => Promise<void>,
  ): Promise<void> {
    if (this.busyId() !== null) {
      return;
    }
    this.busyId.set(candidate.id);
    this.refusal.set(null);
    try {
      await write();
      this.notify.success(`« ${candidate.name} » ${done}.`);
      await reload();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le geste n’a pas pu être fait.'));
    } finally {
      this.busyId.set(null);
    }
  }

  private async loadVehicles(): Promise<void> {
    try {
      const view = await this.api.vehicleCandidates(this.showArchived());
      this.vehicles.set({ status: 'ready', candidates: view.candidates });
    } catch {
      this.vehicles.set({ status: 'error' });
    }
  }

  private async loadBins(): Promise<void> {
    try {
      const view = await this.api.binCandidates(this.showArchived());
      this.bins.set({ status: 'ready', candidates: view.candidates });
    } catch {
      this.bins.set({ status: 'error' });
    }
  }
}
