import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import type { OrderHandoverShipmentView } from '@lfd/contracts';
import { FoldCheckboxComponent, FoldFieldsetComponent } from 'fold-ng';

/**
 * **Les envois prêts d'une commande, à cocher** (plan E7 reliquat, choix 13,
 * lot L4c) — la commande et le reste de la commande, quand le client n'est pas
 * venu entre les deux.
 *
 * Cochés par défaut : le cas courant est qu'il repart avec tout. Décocher un
 * envoi le laisse au comptoir ; « Remettre » ne remet que les rangs cochés,
 * d'un seul geste — le serveur les grave ensemble, ou aucun.
 *
 * L'écran ne le montre qu'à partir de DEUX envois : avec un seul, il n'y a rien
 * à choisir, et le comptoir reste celui d'avant.
 */
@Component({
  selector: 'app-shipment-choice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCheckboxComponent, FoldFieldsetComponent],
  templateUrl: './shipment-choice.html',
})
export class ShipmentChoice {
  readonly shipments = input.required<readonly OrderHandoverShipmentView[]>();
  /** Les rangs cochés — tenus par l'appelant, qui les envoie à « Remettre ». */
  readonly checked = model.required<readonly number[]>();

  protected readonly label = shipmentLabel;

  protected isChecked(rank: number): boolean {
    return this.checked().includes(rank);
  }

  protected toggle(rank: number, on: boolean): void {
    const others = this.checked().filter((checked) => checked !== rank);
    this.checked.set(on ? [...others, rank].sort((a, b) => a - b) : others);
  }
}

/**
 * Le libellé d'un envoi : « la commande » au rang 1, « le reste de la
 * commande » au-delà — jamais « reliquat », qui n'est pas un mot de comptoir.
 */
export function shipmentLabel(shipment: OrderHandoverShipmentView): string {
  const what = shipment.rank === 1 ? 'La commande' : 'Le reste de la commande';
  const pieces = `${String(shipment.totalUnits)} pièce${shipment.totalUnits > 1 ? 's' : ''}`;
  return `${what} — ${shipment.reference}, ${pieces}`;
}

/** Tous les rangs prêts : ce qui est coché à l'ouverture. */
export function allRanks(shipments: readonly OrderHandoverShipmentView[]): readonly number[] {
  return shipments.map(({ rank }) => rank);
}
