import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AdminBackorderOriginView } from '@lfd/contracts';
import { FoldCalloutComponent } from 'fold-ng';

/**
 * **« Issue du reliquat de ORD-… »**, sur la fiche d'une commande née d'un
 * reliquat (`AdminOrderView.backorderOrigin`) : le lien vers la commande
 * d'origine, dont elle reprend les lignes et les prix. Rien pour une commande
 * ordinaire.
 */
@Component({
  selector: 'app-order-backorder-origin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, RouterLink],
  templateUrl: './order-backorder-origin.html',
})
export class OrderBackorderOrigin {
  readonly origin = input.required<AdminBackorderOriginView | null>();
}
