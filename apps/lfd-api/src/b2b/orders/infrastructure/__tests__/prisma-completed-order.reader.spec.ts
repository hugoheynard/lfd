import { CompletedOrderUnsettledError } from "../../domain/errors/completed-order-errors.js";
import { toCompleted, type CompletedRow } from "../prisma-completed-order.reader.js";

/** Une commande de 30 € HT dont seuls 10 € sont partis : le reste a été abandonné. */
const PARTIAL: CompletedRow = {
  id: "ord_1",
  orderNumber: "LFD-0001",
  createdAt: new Date(0),
  clientele: "public",
  companyId: null,
  placedByUserId: "usr_1",
  billableSubtotalCents: 1_000,
  billableDiscountCents: 100,
  billableVoucherDiscountCents: 50,
  placedBy: { auth0Sub: "auth0|x" },
};

describe("toCompleted — l'assiette des points est ce qui est PARTI", () => {
  /**
   * Régression (E6, plan reliquat choix 16) : le lecteur rendait les montants
   * de la COMMANDE, et un reste abandonné rapportait des points sur le tout.
   */
  it("un reste abandonné ne rapporte pas de points : les montants rendus sont les facturables", () => {
    expect(toCompleted(PARTIAL)).toMatchObject({
      subtotalCents: 1_000,
      discountCents: 100,
      voucherDiscountCents: 50,
    });
  });

  it("refuse, nommément, une commande définitive sans montants facturables — aucun repli", () => {
    expect(() => toCompleted({ ...PARTIAL, billableSubtotalCents: null })).toThrow(
      CompletedOrderUnsettledError,
    );
    expect(() => toCompleted({ ...PARTIAL, billableSubtotalCents: null })).toThrow(/LFD-0001/);
  });

  it("rend `null` pour une clientèle nulle, avant même de lire le solde", () => {
    expect(toCompleted({ ...PARTIAL, clientele: null, billableSubtotalCents: null })).toBeNull();
  });
});
