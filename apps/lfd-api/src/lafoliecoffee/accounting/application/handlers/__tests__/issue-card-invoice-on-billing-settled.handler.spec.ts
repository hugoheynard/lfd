import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import { OrderBillingSettledFact } from "../../../../orders/domain/events/order-billing-settled.fact.js";
import { CardInvoiceScopeReader } from "../../../domain/ports/card-invoice-scope.reader.js";
import type { CardInvoiceScope } from "../../../domain/services/card-invoicing.js";
import { IssueCardInvoiceCommand } from "../../commands/issue-card-invoice.command.js";
import { IssueCardInvoiceOnBillingSettled } from "../issue-card-invoice-on-billing-settled.handler.js";

/**
 * Le réveil au solde (plan E9, lot F, § 3.5) : il rejoue la facture d'une
 * carte pro, et écarte sans lever toute autre commande — au compte,
 * particulier, introuvable — avant le verrou et la lecture d'argent.
 */

class FixedScopes extends CardInvoiceScopeReader {
  constructor(private readonly scope: CardInvoiceScope | null) {
    super();
  }

  scopeOf(): Promise<CardInvoiceScope | null> {
    return Promise.resolve(this.scope);
  }
}

const CARD_PRO: CardInvoiceScope = {
  companyId: "c_port",
  clientele: "pro",
  cancelled: false,
  totalCents: 1_000,
  paymentStatus: "paid",
};

function delivery() {
  const fact = new OrderBillingSettledFact("w_1", "o_1", "closed", 1_000, "2030-01-10");
  return { eventId: "e_1", type: fact.durableFact().type, payload: fact.durableFact().payload };
}

async function run(scope: CardInvoiceScope | null): Promise<readonly unknown[]> {
  const sent: unknown[] = [];
  const module = await Test.createTestingModule({
    providers: [
      IssueCardInvoiceOnBillingSettled,
      { provide: CardInvoiceScopeReader, useValue: new FixedScopes(scope) },
      {
        provide: CommandBus,
        useValue: {
          execute: (command: unknown) => {
            sent.push(command);
            return Promise.resolve();
          },
        },
      },
    ],
  }).compile();
  await module.get(IssueCardInvoiceOnBillingSettled).handle(delivery());
  return sent;
}

describe("IssueCardInvoiceOnBillingSettled", () => {
  it("une carte pro : rejoue la facture de la commande", async () => {
    expect(await run(CARD_PRO)).toEqual([new IssueCardInvoiceCommand("o_1")]);
  });

  it.each<[string, CardInvoiceScope | null]>([
    ["au compte", { ...CARD_PRO, paymentStatus: "not_required" }],
    ["d'un particulier", { ...CARD_PRO, clientele: "public" }],
    ["sans société", { ...CARD_PRO, companyId: null }],
    ["introuvable", null],
  ])("une commande %s : rien, et aucune erreur", async (_label, scope) => {
    expect(await run(scope)).toEqual([]);
  });
});
