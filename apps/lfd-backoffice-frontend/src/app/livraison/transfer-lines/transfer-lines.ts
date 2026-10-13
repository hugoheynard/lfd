import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { TransferManifestLineView } from '@lfd/contracts';

/**
 * **Des lignes de manifeste** — quantité, article, SKU — telles qu'on les
 * recompte en chargeant ou en déchargeant. Présentationnel : le manifeste des
 * tournées et l'arrêt de « Ma tournée » les écrivent pareil.
 */
@Component({
  selector: 'app-transfer-lines',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transfer-lines.html',
  styleUrl: './transfer-lines.scss',
})
export class TransferLines {
  readonly lines = input.required<readonly TransferManifestLineView[]>();
}
