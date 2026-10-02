import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DeliveryBinView, DeliveryOrderRoundPlaceView } from '@lfd/contracts';

import { QrCode } from '../../shared/qr-code/qr-code';
import { binIndexLabel, halfLabel, innerBagsLabel, sharedWithLabel } from '../delivery-loading';
import { roundLabel } from '../delivery-rounds';

/**
 * **L'étiquette d'un bac — gabarit PROVISOIRE, une page A4** (L4-C16 ; lot 4
 * bis, v2-4).
 *
 * 🔴 Isolée à dessein : le support des étiquettes n'est pas tranché (Q22 —
 * imprimante d'étiquettes ou planche A4 adhésive). Quand il le sera, c'est ce
 * composant, et lui seul, qui change ; la page qui les liste et le QR qu'elles
 * portent ne bougent pas.
 *
 * Ce qu'on lit de loin : la référence, le rang, le type et la moitié (« ½
 * gauche »), et « partagé avec … » pour un bac cloisonné à deux commandes. Les
 * sacs posés dedans ne sont qu'un compte. Ce qu'on tape quand le QR est
 * illisible : le code court, en gros.
 *
 * **En tête, la tournée et le rang d'arrêt, en très gros** (lot PC3,
 * 2026-10-02) : le bac se pose dans la zone de sa tournée, au rang de son
 * arrêt — on les lit depuis l'autre bout de la pièce. Hors tournée, rien :
 * on n'imprime pas un rang qu'on ne connaît pas.
 */
@Component({
  selector: 'app-bin-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QrCode],
  templateUrl: './bin-label.html',
  styleUrl: './bin-label.scss',
})
export class BinLabel {
  readonly bin = input.required<DeliveryBinView>();
  /** L'adresse absolue du bac — ce qu'encode le QR (L4-C13). */
  readonly url = input.required<string>();
  /** La tournée de la commande et la position de son arrêt, ou `null` hors tournée. */
  readonly round = input<DeliveryOrderRoundPlaceView | null>(null);

  protected readonly roundTitle = computed(() => {
    const round = this.round();
    return round === null ? null : roundLabel(round);
  });

  /**
   * « Bac M · ½ gauche » — le type d'abord, la moitié s'il y en a une. Le nom
   * du type est imprimé tel que saisi (il dit déjà « isotherme » quand on l'a
   * voulu : le semis nomme « Bac S isotherme ») ; archivé, il reste lisible (v2-7).
   */
  protected readonly kind = computed(() => {
    const { binType, half } = this.bin();
    const side = halfLabel(half);
    return side === null ? binType.name : `${binType.name} · ${side}`;
  });

  protected readonly innerBags = computed(() => innerBagsLabel(this.bin().innerBags));

  protected readonly indexLabel = binIndexLabel;
  protected readonly sharedWith = sharedWithLabel;
}
