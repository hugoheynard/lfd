import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_BILLING_SETTLED,
  OrderBillingSettledFact,
} from "../../../orders/domain/events/order-billing-settled.fact.js";
import { CardInvoiceScopeReader } from "../../domain/ports/card-invoice-scope.reader.js";
import { outsideCardInvoicing } from "../../domain/services/card-invoicing.js";
import { IssueCardInvoiceCommand } from "../commands/issue-card-invoice.command.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ISSUE_CARD_INVOICE_ON_BILLING_SETTLED =
  "accounting.issue-card-invoice.on-billing-settled";

/**
 * **Le solde est posé ou corrigé : la facture carte, si elle l'attendait**
 * (plan `documentation/commandes/reliquat/plan-e9-reste-carte.md`, lot F,
 * § 3.5). La facture porte le livré : retirée sans solde, elle rend
 * `awaiting_settlement` ; ce réveil la fait repartir sans « Réessayer », que
 * le solde soit posé à la remise ou plus tard par le rapprochement.
 *
 * 🔴 **Le fait part pour toute commande soldée** — au compte et particuliers
 * compris. L'abonné les écarte d'abord par une lecture d'une ligne
 * ({@link CardInvoiceScopeReader}), sans verrou ni position carte, et rend
 * sans lever : aucune commande hors carte ne finit en relance ni en lettre
 * morte. Une commande introuvable non plus : un solde n'est écrit que sur une
 * commande qui existe, et les commandes ne se suppriment pas.
 *
 * Le périmètre n'est pas dans le payload : il se lit au moment de juger, sur
 * la ligne, et un champ ajouté au fait serait définitif pour un gain d'une
 * lecture par clé primaire.
 */
@Injectable()
@DurableHandler({
  type: ORDER_BILLING_SETTLED,
  subscriber: ISSUE_CARD_INVOICE_ON_BILLING_SETTLED,
})
export class IssueCardInvoiceOnBillingSettled implements DurableSubscriber {
  constructor(
    private readonly scopes: CardInvoiceScopeReader,
    private readonly commands: CommandBus,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const orderId = OrderBillingSettledFact.orderIdOf(delivery.payload);
    const scope = await this.scopes.scopeOf(orderId);
    if (scope === null || outsideCardInvoicing(scope)) {
      return;
    }
    await this.commands.execute(new IssueCardInvoiceCommand(orderId));
  }
}
