import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
// Valeurs par le sous-chemin sans zod (budget `cloudflare`).
import {
  CUSTOMER_CANCELLATION_REASON_CODES,
  CUSTOMER_CANCELLATION_REASON_MAX_LENGTH,
  type CustomerCancellationReasonCode,
} from '@lfd/contracts/shop-values';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldListboxComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { fill } from '../../copy/client-copy.service';
import { orderCancelCopy } from '../../copy/screens/order-cancel.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import {
  type CancellableState,
  type CancelReason,
  moneySentence,
  untilLabel,
} from '../cancellation-wording';

/**
 * **La confirmation d'une annulation** — la même composition dans le dialogue
 * de « Mes commandes » et sur la page de l'invité (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C6.8).
 *
 * Ce qui arrivera à l'argent et au bon, en une phrase ; jusqu'à quand c'est
 * possible ; le motif, facultatif (une liste, et un texte quand c'est
 * « Autre ») ; « Annuler ma commande » / « Garder ma commande ».
 *
 * Il ne parle pas au réseau : il rend le motif choisi, et l'hôte écrit. Le
 * refus du serveur lui revient en `refusal`, et reste affiché ici — c'est là
 * qu'on décide de réessayer ou de garder la commande.
 */
@Component({
  selector: 'app-cancel-order-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldListboxComponent, FoldTextareaComponent],
  templateUrl: './cancel-order-form.html',
  styleUrl: './cancel-order-form.scss',
})
export class CancelOrderForm {
  readonly state = input.required<CancellableState>();
  /** Une écriture est en vol : les deux boutons se figent. */
  readonly busy = input(false);
  /** La phrase du dernier refus, ou `null`. */
  readonly refusal = input<string | null>(null);

  readonly confirmed = output<CancelReason>();
  readonly kept = output<void>();

  private readonly locale = inject(ClientLocale).current;
  protected readonly c = screenCopy('orderCancel', orderCancelCopy);

  protected readonly reasonCode = signal<CustomerCancellationReasonCode | null>(null);
  protected readonly reasonText = signal('');

  protected readonly reasonOptions = computed(() =>
    CUSTOMER_CANCELLATION_REASON_CODES.map((code) => ({
      value: code,
      label: this.c().reasons[code],
    })),
  );

  protected readonly money = computed(() => moneySentence(this.state(), this.c()));

  protected readonly until = computed(() => {
    const until = this.state().until;
    return until === null
      ? null
      : fill(this.c().until, { when: untilLabel(until, this.locale(), this.c()) });
  });

  protected readonly other = computed(() => this.reasonCode() === 'other');

  /** Le texte libre, borné comme au serveur : au-delà, il serait refusé en `400`. */
  protected setText(value: string): void {
    this.reasonText.set(value.slice(0, CUSTOMER_CANCELLATION_REASON_MAX_LENGTH));
  }

  protected confirm(): void {
    if (this.busy()) {
      return;
    }
    this.confirmed.emit(reasonOf(this.reasonCode(), this.reasonText()));
  }
}

/**
 * Le corps du `POST` : rien sans motif, le code seul sinon, et le texte
 * seulement pour « Autre » — un texte tapé puis abandonné en changeant de
 * motif ne part pas.
 */
export function reasonOf(code: CustomerCancellationReasonCode | null, text: string): CancelReason {
  if (code === null) {
    return {};
  }
  const said = text.trim();
  return code === 'other' && said !== ''
    ? { reasonCode: code, reasonText: said }
    : { reasonCode: code };
}
