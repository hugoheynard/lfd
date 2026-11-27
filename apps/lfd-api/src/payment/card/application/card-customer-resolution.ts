import { Injectable, Logger } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import type { CardPaymentPayer } from "../../channels/requests/card-payments.js";
import { CardCustomerReader } from "../domain/ports/card-customer.reader.js";
import { CardCustomerRecorder } from "../domain/ports/card-customer.recorder.js";
import type { CardProvider } from "../domain/ports/card-provider.js";
import type { PaymentAccount } from "../domain/value-objects/payment-account.js";

/** La clé d'idempotence de la création d'un client : la même pour la même personne sur le même compte. */
export function customerIdempotencyKey(account: PaymentAccount, userId: string): string {
  return `lfd-customer:${account.name}:${userId}`;
}

/**
 * **Le client du payeur sur le compte qui encaisse** (plan
 * `documentation/payment/le-pointage-stripe.md`, § 2)
 * — relu chez nous, sinon créé chez le prestataire sous une clé déterministe,
 * puis gardé.
 *
 * 🔴 HORS transaction : la création part au réseau (l'adaptateur le vérifie).
 * Un échec ne fait pas échouer le paiement : l'intention part sans client, et
 * le journal ne nomme que le compte et la personne — jamais son nom ni son
 * adresse.
 */
@Injectable()
export class CardCustomerResolution {
  private readonly logger = new Logger(CardCustomerResolution.name);

  constructor(
    private readonly reader: CardCustomerReader,
    private readonly recorder: CardCustomerRecorder,
    private readonly clock: Clock,
  ) {}

  /** La référence du client, ou `null` sans payeur ou si le prestataire a échoué. */
  async customerOf(
    account: PaymentAccount,
    provider: CardProvider,
    payer: CardPaymentPayer | undefined,
  ): Promise<string | null> {
    if (payer === undefined) {
      return null;
    }
    const known = await this.reader.find(account, payer.userId);
    if (known !== null) {
      return known;
    }
    try {
      const created = await provider.createCustomer({
        userId: payer.userId,
        name: payer.name,
        email: payer.email,
        idempotencyKey: customerIdempotencyKey(account, payer.userId),
      });
      return await this.recorder.record({
        account,
        userId: payer.userId,
        customerRef: created,
        at: this.clock.now(),
      });
    } catch (error) {
      this.logger.warn(
        `Client du compte ${account.name} non créé pour la personne ${payer.userId} : ` +
          "l'intention part sans client.",
        error instanceof Error ? error.name : "erreur inconnue",
      );
      return null;
    }
  }
}
