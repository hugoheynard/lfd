import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { qrMatrix, type QrMatrix } from './qr';

/**
 * Un **vrai QR code scannable**, rendu en SVG depuis `qrcode-generator`.
 *
 * SVG et non image : il reste net à toutes les tailles et à tous les zooms, ce
 * qui compte quand quelqu'un rapproche un téléphone d'un autre téléphone.
 */
@Component({
  selector: 'lfd-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qr-code.html',
  styleUrl: './qr-code.scss',
})
export class QrCode {
  /** Ce que le code encode. Une URL, pour que l'appareil photo natif l'ouvre. */
  readonly value = input.required<string>();

  /**
   * Ce que dit un lecteur d'écran. Le contenu brut serait inutile à l'oreille
   * (une URL à jeton de 26 caractères) : on décrit l'objet, pas sa charge.
   */
  readonly label = input<string>('QR code');

  protected readonly matrix = computed<QrMatrix>(() => qrMatrix(this.value()));
}
