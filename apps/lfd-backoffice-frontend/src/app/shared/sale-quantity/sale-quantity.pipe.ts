import { Pipe, type PipeTransform } from '@angular/core';

import type { OrderSaleUnit } from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

/**
 * **Une quantité de ligne dans l'unité de son article** — « 12 » pour des
 * pièces, « 500 g » / « 1,25 kg » pour des grammes (plan
 * `documentation/pricing/vente-au-poids.md`, P6). Le fournil, le
 * colisage, le comptoir et la tournée lisent tous la même règle
 * (`saleQuantityLabel`) : un écran qui écrirait « 1250 » pour un saumon ferait
 * tendre 1 250 pièces.
 *
 * `unit` absente = des pièces, ce qu'est toute ligne d'avant la vente au poids.
 */
@Pipe({ name: 'saleQuantity' })
export class SaleQuantityPipe implements PipeTransform {
  transform(quantity: number, unit?: OrderSaleUnit | null): string {
    return saleQuantityLabel(quantity, unit ?? undefined);
  }
}
