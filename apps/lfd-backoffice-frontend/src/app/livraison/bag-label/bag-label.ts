import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DeliveryBagView } from '@lfd/contracts';

import { QrCode } from '../../shared/qr-code/qr-code';
import { bagIndexLabel } from '../delivery-loading';

/**
 * **L'étiquette d'un sac — gabarit PROVISOIRE, une page A4** (L4-C16).
 *
 * 🔴 Isolée à dessein : le support des étiquettes n'est pas tranché (Q22 —
 * imprimante d'étiquettes ou planche A4 adhésive). Quand il le sera, c'est ce
 * composant, et lui seul, qui change ; la page qui les liste et le QR qu'elles
 * portent ne bougent pas.
 *
 * Ce qu'on lit de loin : la référence et le rang du sac. Ce qu'on tape quand le
 * QR est illisible : le code court, en gros.
 */
@Component({
  selector: 'app-bag-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QrCode],
  templateUrl: './bag-label.html',
  styleUrl: './bag-label.scss',
})
export class BagLabel {
  readonly bag = input.required<DeliveryBagView>();
  /** L'adresse absolue du sac — ce qu'encode le QR (L4-C13). */
  readonly url = input.required<string>();

  protected readonly indexLabel = bagIndexLabel;
}
