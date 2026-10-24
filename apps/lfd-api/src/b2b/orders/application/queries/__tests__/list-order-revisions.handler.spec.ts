import type { ReplacedCompositionView } from "@lfd/contracts";

import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  OrderRevisionHistoryReader,
  type RecordedOrderRevision,
} from "../../../domain/ports/order-revision-history.reader.js";
import { ListOrderRevisionsHandler } from "../list-order-revisions.handler.js";
import { ListOrderRevisionsQuery } from "../list-order-revisions.query.js";

/**
 * **Les versions précédentes d'une commande** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, §6) : l'ordre du
 * port, l'auteur staff nommé par l'annuaire, le 404 d'une commande inconnue.
 *
 * Les instants ne sont que des données rendues telles quelles.
 */

const REPLACED: ReplacedCompositionView = {
  requestedDeliveryDate: "2026-11-10",
  fulfillmentMethod: "pickup",
  pickupAddress: {
    label: "Labo",
    ligne1: "5 rue du Four",
    ligne2: "",
    codePostal: "73150",
    ville: "Val d'Isère",
    pays: "France",
  },
  deliveryAddress: null,
  window: { start: "07:00", end: "08:00" },
  note: "",
  subtotalCents: 2_000,
  discountCents: 200,
  deliveryFeeCents: 0,
  vatCents: 99,
  totalCents: 1_899,
  lines: [
    {
      sku: "VIE-001",
      productName: "Croissant",
      quantity: 10,
      unitPriceMillicents: 200_000,
      vatRate: 5.5,
      lineTotalCents: 2_000,
    },
  ],
};

const BY_STAFF: RecordedOrderRevision = {
  replacedRevision: 1,
  revisedAt: new Date("2026-11-09T10:00:00.000Z"),
  author: { kind: "staff", staffId: "stf_1" },
  changes: ["date"],
  totalBeforeCents: 3_798,
  totalAfterCents: 3_798,
  replaced: REPLACED,
};

const BY_CUSTOMER: RecordedOrderRevision = {
  replacedRevision: 0,
  revisedAt: new Date("2026-11-08T10:00:00.000Z"),
  author: { kind: "customer", name: "Léa Martin" },
  changes: ["lines"],
  totalBeforeCents: 1_899,
  totalAfterCents: 3_798,
  replaced: null,
};

class FixedRevisionHistory extends OrderRevisionHistoryReader {
  constructor(private readonly answer: readonly RecordedOrderRevision[] | null) {
    super();
  }

  historyOf(): Promise<readonly RecordedOrderRevision[] | null> {
    return Promise.resolve(this.answer);
  }
}

describe("ListOrderRevisionsHandler", () => {
  it("rend les révisions dans l'ordre du port, l'auteur staff nommé par l'annuaire", async () => {
    const staff = new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Hugo", lastName: "H" }, "stf_1"),
    );
    const handler = new ListOrderRevisionsHandler(
      new FixedRevisionHistory([BY_STAFF, BY_CUSTOMER]),
      staff,
    );

    const entries = await handler.execute(new ListOrderRevisionsQuery("ord_1"));

    expect(entries).toEqual([
      {
        replacedRevision: 1,
        revisedAt: "2026-11-09T10:00:00.000Z",
        author: { kind: "staff", name: "Hugo H" },
        changes: ["date"],
        totalBeforeCents: 3_798,
        totalAfterCents: 3_798,
        replaced: REPLACED,
      },
      {
        replacedRevision: 0,
        revisedAt: "2026-11-08T10:00:00.000Z",
        author: { kind: "customer", name: "Léa Martin" },
        changes: ["lines"],
        totalBeforeCents: 1_899,
        totalAfterCents: 3_798,
        replaced: null,
      },
    ]);
  });

  it("un auteur staff absent de l'annuaire reste sans nom — jamais un nom inventé", async () => {
    const handler = new ListOrderRevisionsHandler(
      new FixedRevisionHistory([BY_STAFF]),
      new FixedStaffAuthorDirectory(),
    );

    const [entry] = await handler.execute(new ListOrderRevisionsQuery("ord_1"));

    expect(entry?.author).toEqual({ kind: "staff", name: null });
  });

  it("une commande jamais modifiée : une liste vide", async () => {
    const handler = new ListOrderRevisionsHandler(
      new FixedRevisionHistory([]),
      new FixedStaffAuthorDirectory(),
    );

    await expect(handler.execute(new ListOrderRevisionsQuery("ord_1"))).resolves.toEqual([]);
  });

  it("une commande inconnue : 404", async () => {
    const handler = new ListOrderRevisionsHandler(
      new FixedRevisionHistory(null),
      new FixedStaffAuthorDirectory(),
    );

    await expect(handler.execute(new ListOrderRevisionsQuery("ord_x"))).rejects.toThrow(
      OrderNotFoundError,
    );
  });
});
