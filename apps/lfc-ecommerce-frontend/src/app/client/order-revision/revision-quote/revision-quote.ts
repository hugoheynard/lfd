import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { OrderRevisionQuoteView } from '@lfd/contracts';

import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { formatCents } from '../../format-money';

/** Le devis tel que l'écran le tient : en vol, rendu, refusé (avec la phrase du serveur) ou en panne. */
export type QuoteState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly quote: OrderRevisionQuoteView }
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'failed' };

/** L'écart dit avec son signe : « + 4,20 € », « − 3,10 € », ou « Aucun écart ». */
export function differenceLabel(
  differenceCents: number,
  copy: {
    readonly differenceMore: string;
    readonly differenceLess: string;
    readonly differenceNone: string;
  },
): string {
  if (differenceCents === 0) {
    return copy.differenceNone;
  }
  const amount = formatCents(Math.abs(differenceCents));
  return fill(differenceCents > 0 ? copy.differenceMore : copy.differenceLess, { amount });
}

/**
 * **Le nouveau total et l'écart** d'un devis de révision (plan
 * `plan-modifier-une-commande.md`, M3) — les montants du serveur, TTC, sans
 * aucun calcul ici que le signe de l'écart.
 */
@Component({
  selector: 'app-revision-quote',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './revision-quote.html',
  styleUrl: './revision-quote.scss',
})
export class RevisionQuote {
  readonly quote = input.required<OrderRevisionQuoteView>();

  private readonly t = inject(ClientCopyService).t;
  protected readonly c = computed(() => this.t().orders.revision);

  protected readonly total = computed(() => formatCents(this.quote().totalCents));
  protected readonly previous = computed(() => formatCents(this.quote().previousTotalCents));
  protected readonly difference = computed(() =>
    differenceLabel(this.quote().differenceCents, this.c()),
  );
}
