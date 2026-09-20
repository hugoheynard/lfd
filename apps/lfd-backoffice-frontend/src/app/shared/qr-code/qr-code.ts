import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { qrMatrix, type QrMatrix } from './qr';

/**
 * Vrai QR code scannable — matrice via `qrcode-generator` (lib de référence,
 * pure JS, SSR-safe), rendue en SVG. Noir sur blanc, comme l'exige un QR : la
 * lisibilité prime sur le thème.
 */
@Component({
  selector: 'app-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qr-code.html',
  styleUrl: './qr-code.scss',
})
export class QrCode {
  readonly url = input.required<string>();
  protected readonly matrix = computed<QrMatrix>(() => qrMatrix(this.url()));
}
