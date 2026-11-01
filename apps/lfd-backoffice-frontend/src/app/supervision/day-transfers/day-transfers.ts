import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import type { DayInternalTransferView } from '@lfd/contracts';
import { FoldButtonComponent, FoldIconComponent, FoldPanelHostService } from 'fold-ng';

import { DayTransfersReader } from '../../livraison/day-transfers.reader';
import {
  TransferManifestDialog,
  type TransferManifestDialogData,
} from '../../livraison/transfer-manifest-dialog/transfer-manifest-dialog';

/**
 * **Les transferts du jour, dans la colonne Colisage de la Supervision**
 * (Hugo, 2026-11-01 : « le transfert et son manifeste doivent aussi se voir
 * dans la supervision »).
 *
 * Dans la colonne 2 parce que c'est là que les sacs d'un site servi par
 * transfert « attendent leur transfert » : préparés au Labo, ils ne passent
 * jamais par la colonne Retrait du Labo, et le manifeste dit ce qui a été
 * colisé pour partir. La Supervision ne regroupait pas ces commandes : une
 * ligne par transfert, et « Voir le manifeste » ouvre le dialogue de la
 * livraison, tel quel.
 *
 * Il se relit quand la colonne Colisage est relue (`revision`) : une clôture
 * qui crée un transfert fait bouger le journal du jour, donc la colonne.
 * Rien ne s'affiche s'il n'y a aucun transfert, ou si la lecture a échoué.
 */
@Component({
  selector: 'app-day-transfers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldIconComponent],
  providers: [DayTransfersReader],
  templateUrl: './day-transfers.html',
  styleUrl: './day-transfers.scss',
})
export class DayTransfers {
  /** Le jour supervisé ; `null` tant que le serveur ne l'a pas dit. */
  readonly date = input.required<string | null>();
  /** Ce qui fait relire : l'état de la colonne Colisage, nouveau à chaque relecture. */
  readonly revision = input<unknown>(null);

  protected readonly reader = inject(DayTransfersReader);
  private readonly panels = inject(FoldPanelHostService);

  constructor() {
    effect(() => {
      const date = this.date();
      this.revision();
      if (date !== null) {
        untracked(() => void this.reader.load(date));
      }
    });
  }

  protected openManifest(transfer: DayInternalTransferView): void {
    this.panels.open<TransferManifestDialogData, void>(TransferManifestDialog, {
      data: { transferId: transfer.transferId, siteLabel: transfer.siteLabel },
    });
  }
}
