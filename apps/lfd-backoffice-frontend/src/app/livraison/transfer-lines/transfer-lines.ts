import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { TransferManifestLineView } from '@lfd/contracts';

import { SaleQuantityPipe } from '../../shared/sale-quantity/sale-quantity.pipe';

/**
 * **Des lignes de manifeste** — quantité, article, SKU — telles qu'on les
 * recompte en chargeant ou en déchargeant. Présentationnel : le manifeste des
 * tournées et l'arrêt de « Ma tournée » les écrivent pareil. Un article au
 * poids dit « 1,25 kg » (P6 de `vente-au-poids.md`).
 */
@Component({
  selector: 'app-transfer-lines',
  imports: [SaleQuantityPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transfer-lines.html',
  styleUrl: './transfer-lines.scss',
})
export class TransferLines {
  readonly lines = input.required<readonly TransferManifestLineView[]>();
}
