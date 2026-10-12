import { MemoryOrderCollections } from "../../commands/__tests__/collection-doubles.js";
import { OrderCollection } from "../../../domain/entities/order-collection.js";
import { OrderCollectionTransitionError } from "../../../domain/errors/collection-errors.js";
import {
  OrderEngagementReader,
  type OrderEngagementFacts,
} from "../../../domain/ports/order-engagement.reader.js";
import { AccountOrderEngaging, engagementFrom } from "../account-order-engaging.js";

/**
 * La comptabilité répond à l'annulation d'une commande au compte (plan
 * `order/plan-annulation-de-commande.md`, C5.4, C5.5). L'instant n'est que
 * recopié ; les jours ne sont comparés qu'à eux-mêmes.
 */

const AT = new Date("2026-10-12T15:00:00.000Z");
const NOTHING: OrderEngagementFacts = { invoice: null, collection: null, rejectedBefore: false };

function line(
  state: NonNullable<OrderEngagementFacts["collection"]>["state"],
): OrderEngagementFacts {
  return {
    ...NOTHING,
    collection: { state, collectionDay: "2026-10-20", statementId: "st_1" },
  };
}

class FixedFacts extends OrderEngagementReader {
  constructor(private readonly facts: OrderEngagementFacts) {
    super();
  }
  factsOf(): Promise<OrderEngagementFacts> {
    return Promise.resolve(this.facts);
  }
}

describe("engagementFrom — l'ordre des refus (C5.2)", () => {
  it("rien : libre", () => {
    expect(engagementFrom(NOTHING)).toEqual({ kind: "free" });
  });

  it("la facture l'emporte sur tout état de ligne", () => {
    expect(
      engagementFrom({
        ...line("written_off"),
        invoice: { number: "FA-1", issuedOn: "2026-09-30" },
      }),
    ).toEqual({ kind: "invoiced", invoiceNumber: "FA-1", issuedOn: "2026-09-30" });
  });

  it.each([
    [
      "batched",
      {
        kind: "collecting",
        state: "batched",
        collectionDay: "2026-10-20",
        statementNumber: "st_1",
      },
    ],
    ["collected", { kind: "collected", state: "collected", collectionDay: "2026-10-20" }],
    ["returned", { kind: "collected", state: "returned", collectionDay: "2026-10-20" }],
    ["written_off", { kind: "written_off" }],
    ["settled_otherwise", { kind: "settled_otherwise" }],
  ] as const)("ligne %s → refus", (state, expected) => {
    expect(engagementFrom(line(state))).toEqual(expected);
  });

  it.each(["due", "excluded"] as const)("ligne %s rejetée avant : `returned_before`", (state) => {
    expect(engagementFrom({ ...line(state), rejectedBefore: true })).toEqual({
      kind: "returned_before",
    });
  });

  it.each(["due", "excluded"] as const)("ligne %s sans rejet : libre", (state) => {
    expect(engagementFrom(line(state))).toEqual({ kind: "free" });
  });

  it("une ligne déjà fermée sur une commande vivante : illisible (`null`), que la règle refuse", () => {
    expect(engagementFrom(line("cancelled"))).toBeNull();
  });
});

describe("AccountOrderEngaging.closeForCancellation — fermer la ligne", () => {
  it("sans ligne : en crée une, née fermée, au montant de la commande", async () => {
    const collections = new MemoryOrderCollections();

    await new AccountOrderEngaging(new FixedFacts(NOTHING), collections).closeForCancellation(
      "o1",
      2_110,
      AT,
    );

    expect(collections.saved.get("o1")?.toPersistence()).toMatchObject({
      state: "cancelled",
      amountCents: 2_110,
      updatedAt: AT,
    });
  });

  it("une ligne écartée : la ferme, par l'agrégat", async () => {
    const collections = new MemoryOrderCollections();
    const excluded = OrderCollection.due("o1", 1_000, AT);
    excluded.exclude("payer_detached", AT);
    await collections.saveAll([excluded]);

    await new AccountOrderEngaging(new FixedFacts(NOTHING), collections).closeForCancellation(
      "o1",
      1_000,
      AT,
    );

    expect(collections.saved.get("o1")?.toPersistence()).toMatchObject({
      state: "cancelled",
      exclusionReason: null,
    });
  });

  it("une ligne dans un lot ne se ferme pas : l'agrégat refuse", async () => {
    const collections = new MemoryOrderCollections();
    const batched = OrderCollection.due("o1", 1_000, AT);
    batched.batch("lot_1", 1, AT);
    await collections.saveAll([batched]);

    await expect(
      new AccountOrderEngaging(new FixedFacts(NOTHING), collections).closeForCancellation(
        "o1",
        1_000,
        AT,
      ),
    ).rejects.toBeInstanceOf(OrderCollectionTransitionError);
    expect(collections.saved.get("o1")?.stateName).toBe("batched");
  });
});
