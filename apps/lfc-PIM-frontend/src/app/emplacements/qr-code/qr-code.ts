import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import qrcode from 'qrcode-generator';

interface QrMatrix {
  /** Côté du dessin, zone de silence comprise. */
  readonly dim: number;
  /** Modules noirs (coordonnées déjà décalées de la marge). */
  readonly dark: readonly { readonly x: number; readonly y: number }[];
}

/** Zone de silence normative (4 modules) — nécessaire à un scan fiable. */
const MARGIN = 4;

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

  protected readonly matrix = computed<QrMatrix>(() => {
    const qr = qrcode(0, 'M');
    qr.addData(this.url());
    qr.make();
    const count = qr.getModuleCount();
    const dark: { x: number; y: number }[] = [];
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) {
          dark.push({ x: col + MARGIN, y: row + MARGIN });
        }
      }
    }
    return { dim: count + MARGIN * 2, dark };
  });
}
