import { Injectable } from "@nestjs/common";

import {
  AccountOrderEngagement,
  type AccountEngagement,
} from "../../../orders/domain/ports/account-order-engagement.js";
import { OrderCollection } from "../../domain/entities/order-collection.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";
import {
  OrderEngagementReader,
  type OrderEngagementFacts,
} from "../../domain/ports/order-engagement.reader.js";

/**
 * La comptabilité répond à la commande : **qu'a-t-on déjà engagé** sur
 * cette commande au compte, et **ferme sa ligne d'encaissement** quand
 * l'équipe l'annule (plan `documentation/commandes/annulation/plan-annulation-de-commande.md`,
 * C5.4, C5.5). Implémente le port que la commande déclare ; relié dans
 * `appBootstrap/account-order-engagement.module.ts`.
 *
 * Les deux gestes s'exécutent dans l'unité de travail de l'annulation, sous
 * son verrou de ligne `orders` : c'est ce verrou que l'émission mensuelle,
 * la constitution d'un lot et « réglée autrement » prennent aussi.
 */
@Injectable()
export class AccountOrderEngaging extends AccountOrderEngagement {
  constructor(
    private readonly facts: OrderEngagementReader,
    private readonly collections: OrderCollectionRepository,
  ) {
    super();
  }

  async engagementOf(orderId: string): Promise<AccountEngagement | null> {
    return engagementFrom(await this.facts.factsOf(orderId));
  }

  /**
   * La ligne passe `cancelled` par l'agrégat : `close` refuse tout état
   * autre que `due`/`excluded` — une ligne engagée ne se ferme pas.
   */
  async closeForCancellation(orderId: string, amountCents: number, at: Date): Promise<void> {
    const existing = await this.collections.ofOrder(orderId);
    if (existing === null) {
      await this.collections.saveAll([
        OrderCollection.closedAtCancellation(orderId, amountCents, at),
      ]);
      return;
    }
    existing.close(at);
    await this.collections.saveAll([existing]);
  }
}

/**
 * L'engagement, dans l'ordre des refus du plan (C5.2) : facturée, puis
 * l'état de la ligne, puis un rejet passé. `cancelled` ne se lit pas sur une
 * commande vivante : `null`, que la règle refuse (S6).
 */
export function engagementFrom(facts: OrderEngagementFacts): AccountEngagement | null {
  if (facts.invoice !== null) {
    return {
      kind: "invoiced",
      invoiceNumber: facts.invoice.number,
      issuedOn: facts.invoice.issuedOn,
    };
  }
  const collection = facts.collection;
  switch (collection?.state) {
    case "batched":
      return {
        kind: "collecting",
        state: "batched",
        collectionDay: collection.collectionDay,
        statementNumber: collection.statementId,
      };
    case "collected":
    case "returned":
      return {
        kind: "collected",
        state: collection.state,
        collectionDay: collection.collectionDay,
      };
    case "written_off":
      return { kind: "written_off" };
    case "settled_otherwise":
      return { kind: "settled_otherwise" };
    case "cancelled":
      return null;
    default:
      return facts.rejectedBefore ? { kind: "returned_before" } : { kind: "free" };
  }
}
