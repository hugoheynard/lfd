import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatMillicents } from '@lfd/b2b-ui/order';
import type { PromotionDecimalsView } from '@lfd/contracts';
import { FoldCalloutComponent } from 'fold-ng';

/**
 * **« Sur N articles visés, le prix net aura plus de 2 décimales »**
 * (`documentation/promotions/plan-remise-par-ligne.md`, § 18.7) — un
 * avertissement, jamais un refus : le prix exact s'affiche au pro, et la
 * multiplication reste juste au panier. Rien ne s'affiche quand aucun
 * article n'est concerné.
 */
@Component({
  selector: 'app-promotion-decimals-callout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent],
  templateUrl: './promotion-decimals-callout.html',
})
export class PromotionDecimalsCallout {
  readonly decimals = input.required<PromotionDecimalsView | null>();

  protected readonly count = computed(() => this.decimals()?.count ?? 0);
  protected readonly headline = computed(() => {
    const count = this.count();
    const subject = count > 1 ? `${String(count)} articles visés` : '1 article visé';
    const first = this.decimals()?.examples[0];
    const example =
      first === undefined
        ? ''
        : ` (ex. ${formatMillicents(first.priceMillicents)} → ${formatMillicents(first.netMillicents)})`;
    return `Sur ${subject}, le prix net aura plus de 2 décimales${example}.`;
  });
  protected readonly examples = computed(() =>
    (this.decimals()?.examples ?? []).map((example) => ({
      sku: example.sku,
      text: `${example.name} : ${formatMillicents(example.priceMillicents)} → ${formatMillicents(example.netMillicents)}`,
    })),
  );
}
