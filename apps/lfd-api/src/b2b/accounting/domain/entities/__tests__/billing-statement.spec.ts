import { simulateInvoiceDossier } from "../../services/invoice-dossier.js";
import { CREDITOR, frozenOrder } from "../../services/__tests__/collection-fixtures.js";
import {
  StatementTotalMismatchError,
  StatementWithoutOrdersError,
} from "../../errors/billing-statement-errors.js";
import {
  BillingStatement,
  STATEMENT_BODY_VERSION,
  STATEMENT_COMPUTED_WITH,
  statementSellerOf,
  type IssueStatementInput,
  type StatementBuyer,
  type StatementOrder,
} from "../billing-statement.js";

/**
 * L'arrêté de facturation (plan `plan-le-prelevement-suit-la-facture.md`,
 * F3). Les dates ne sont comparées qu'entre elles — jamais à l'horloge.
 */

const PLACED = new Date("2026-09-15T08:00:00.000Z");

const BUYER: StatementBuyer = {
  companyId: "c_port",
  name: "Boulangerie du Port",
  legalForm: "SARL",
  siret: "55210055400013",
  siren: "552100554",
  vatNumber: "FR89552100554",
  billingAddressLines: ["1 rue du Port", "73000 Chambéry"],
};

function bon(orderId: string, requestedDeliveryDate: string | null): StatementOrder {
  return { orderId, frozen: { ...frozenOrder(`CMD-${orderId}`, PLACED), requestedDeliveryDate } };
}

function input(orders: readonly StatementOrder[]): IssueStatementInput {
  const dossier = simulateInvoiceDossier(orders.map((order) => order.frozen));
  return {
    id: "st_1",
    batchId: "b_1",
    lineRank: 1,
    legalEntityId: CREDITOR.legalEntityId,
    payerCompanyId: BUYER.companyId,
    seller: statementSellerOf(CREDITOR),
    buyer: BUYER,
    issuedOn: "2026-10-02",
    orders,
    invoice: dossier.invoice,
    ordersTotalCents: dossier.ordersTotalCents,
    lineAmountCents: dossier.invoice.totalCents,
  };
}

describe("BillingStatement.issue", () => {
  it("fige la facture telle quelle : totaux HT/TVA/TTC lus sur sa ventilation, bons rattachés", () => {
    const given = input([bon("o1", null), bon("o2", null)]);

    const state = BillingStatement.issue(given).toPersistence();

    expect(state).toMatchObject({
      totalHtCents: given.invoice.vat.taxableBaseCents,
      totalVatCents: given.invoice.vat.vatCents,
      totalTtcCents: given.lineAmountCents,
      ordersTotalCents: 2_000,
      orderIds: ["o1", "o2"],
      bodyVersion: STATEMENT_BODY_VERSION,
      computedWith: STATEMENT_COMPUTED_WITH,
    });
    expect(state.totalHtCents + state.totalVatCents).toBe(state.totalTtcCents);
    expect(state.body).toBe(given.invoice);
  });

  it("porte la période de la première à la dernière date demandée des bons", () => {
    const state = BillingStatement.issue(
      input([bon("o1", "2026-09-20"), bon("o2", null), bon("o3", "2026-09-03")]),
    ).toPersistence();

    expect([state.periodStartsOn, state.periodEndsOn]).toEqual(["2026-09-03", "2026-09-20"]);
  });

  it("laisse la période vide quand aucun bon n'a de date — jamais inventée", () => {
    const state = BillingStatement.issue(input([bon("o1", null)])).toPersistence();

    expect([state.periodStartsOn, state.periodEndsOn]).toEqual([null, null]);
  });

  it("ne fige du vendeur que ce que la facture imprime — pas les réglages du mandat", () => {
    const seller = BillingStatement.issue(input([bon("o1", null)])).toPersistence().seller;

    expect(seller).toMatchObject({ siren: CREDITOR.siren, ics: CREDITOR.ics });
    expect(Object.keys(seller)).not.toContain("preNotificationDays");
    expect(Object.keys(seller)).not.toContain("mandateContractDescription");
  });

  it("refuse un arrêté sans bon", () => {
    const given = { ...input([bon("o1", null)]), orders: [] };

    expect(() => BillingStatement.issue(given)).toThrow(StatementWithoutOrdersError);
  });

  it("refuse une ligne qui prélèverait un autre chiffre que le total de sa facture", () => {
    const given = input([bon("o1", null)]);

    expect(() =>
      BillingStatement.issue({ ...given, lineAmountCents: given.lineAmountCents + 1 }),
    ).toThrow(StatementTotalMismatchError);
  });
});
