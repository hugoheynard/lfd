import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import type { OrderSettlement } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { ClientOrders } from '../../client-orders.service';
import type { ClientCopy } from '../../copy/client-copy.model';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { formatCents } from '../../format-money';
import { ClientCart } from '../client-cart.service';
import { quoteChangesOf, type QuoteChange } from '../quote-changes';

/**
 * **« Le total est passé de X à Y : … »** — plan
 * `documentation/pricing/centime-et-tva/plan-total-vu.md`, T3.
 *
 * La passation a refusé le total vu (409 `orders.total_changed`) ; le panier
 * a redemandé son devis. Une fois le neuf arrivé, ce bloc compare le devis du
 * clic au neuf, terme à terme (`quoteChangesOf`), et le dit en UN message.
 * Le client confirme — le nouveau total devient le total vu, et le même
 * règlement repart — ou modifie son panier.
 *
 * Rien tant que le devis neuf n'est pas là ; rien non plus si le total n'a
 * pas bougé : un écart nul ne produit aucun message.
 */
@Component({
  selector: 'app-total-changed-callout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './total-changed-callout.html',
  styleUrl: './total-changed-callout.scss',
})
export class TotalChangedCallout {
  private readonly t = inject(ClientCopyService).t;
  private readonly locale = inject(ClientLocale);
  private readonly cart = inject(ClientCart);
  private readonly orders = inject(ClientOrders);

  /** « Commander à ce total » : le règlement choisi au premier clic. */
  readonly confirm = output<OrderSettlement | null>();

  /** Le message et le nouveau total, ou `null` — rien à dire. */
  protected readonly change = computed(() => {
    const change = this.orders.totalChange();
    if (change === null || this.cart.pricing() !== 'ready') {
      return null;
    }
    const after = this.cart.totals();
    if (after.totalCents === change.before.totalCents) {
      return null;
    }
    const c = this.t().cart;
    const names = new Map(this.cart.lines().map((line) => [line.product.sku, line.product.name]));
    const terms = quoteChangesOf(change.before, after, (sku) => names.get(sku) ?? sku).map((term) =>
      this.phraseOf(term, c),
    );
    const list = new Intl.ListFormat(this.locale.current(), { type: 'conjunction' });
    return {
      settlement: change.settlement,
      message: fill(c.totalChanged, {
        before: formatCents(change.before.totalCents),
        after: formatCents(after.totalCents),
        changes: list.format(terms.length === 0 ? [c.changeOther] : terms),
      }),
      confirmLabel: fill(c.totalChangedConfirm, { total: formatCents(after.totalCents) }),
      modifyLabel: c.totalChangedModify,
    };
  });

  protected modify(): void {
    this.orders.dismissTotalChange();
  }

  private phraseOf(term: QuoteChange, c: ClientCopy['cart']): string {
    switch (term.kind) {
      case 'lateFeeAppeared':
        return fill(c.changeLateFeeAppeared, { amount: formatCents(term.amountCents) });
      case 'lateFee':
        return c.changeLateFee;
      case 'deliveryFee':
        return c.changeDeliveryFee;
      case 'discount':
        return c.changeDiscount;
      case 'voucher':
        return c.changeVoucher;
      case 'discountEnded': {
        const locale = this.locale.current();
        const label =
          locale === 'en' ? term.label.en : locale === 'it' ? term.label.it : term.label.fr;
        return fill(c.changeDiscountEnded, { label });
      }
      case 'lineRemoved':
        return fill(c.changeLineRemoved, { name: term.name });
      case 'linePrice':
        return fill(c.changeLinePrice, { name: term.name });
      case 'vat':
        return c.changeVat;
    }
  }
}
