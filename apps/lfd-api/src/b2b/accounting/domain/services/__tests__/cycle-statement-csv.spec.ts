import type { CycleOrder } from "../../ports/cycle-orders.reader.js";
import { aggregateStatement } from "../cycle-statement.js";
import { rateLabel, statementCsv, STATEMENT_SCOPE } from "../cycle-statement-csv.js";

/**
 * Dates absolues, et c'est l'exception prévue (CLAUDE.md §5) : le rendu ne lit
 * aucune horloge, il convertit des instants donnés en jours locaux.
 */
const SEPTEMBER = {
  companyName: "Boulangerie du Port",
  month: "2026-09",
  startsAt: new Date("2026-08-31T22:00:00.000Z"),
  closesAt: new Date("2026-09-30T22:00:00.000Z"),
  inProgress: false,
};

function order(overrides: Partial<CycleOrder>): CycleOrder {
  return {
    id: "o1",
    orderNumber: "CMD-1",
    placedAt: new Date("2026-09-14T22:30:00.000Z"),
    companyId: "c-port",
    siteName: "Boulangerie du Port",
    subtotalCents: 10_000,
    discountCents: 500,
    voucherDiscountCents: 0,
    deliveryFeeCents: 1_500,
    lateFeeCents: 0,
    vatCents: 1_000,
    vatShares: [
      { rate: 5.5, amountCents: 700 },
      { rate: 20, amountCents: 300 },
    ],
    totalCents: 12_000,
    collectionState: "due",
    ...overrides,
  };
}

function rowsOf(csv: string): readonly string[] {
  return csv.replace(/^\uFEFF/u, "").split("\r\n");
}

describe("statementCsv", () => {
  it("dit le périmètre et le caractère provisoire avant toute donnée", () => {
    const rows = rowsOf(statementCsv(aggregateStatement([]), SEPTEMBER));
    expect(rows[0]).toContain("PROVISOIRE");
    expect(rows[1]).toContain("Du 2026-09-01 00h00 inclus au 2026-10-01 00h00 exclu");
    expect(rows[2]).toBe(`"${STATEMENT_SCOPE}"`);
  });

  it("ouvre une colonne par taux présent, et une pour la TVA non ventilée", () => {
    const legacy = order({ id: "o2", orderNumber: "CMD-2", vatShares: null, vatCents: 220 });
    const rows = rowsOf(statementCsv(aggregateStatement([order({}), legacy]), SEPTEMBER));
    const header = rows[5] ?? "";
    expect(header).toContain('"TVA 5,5 % (€)";"TVA 20 % (€)";"TVA non ventilée (€)"');

    // La commande ventilée : 7,00 et 3,00 en colonnes, 0 en non ventilée.
    expect(rows[6]).toContain(";7,00;3,00;0,00;10,00;120,00");
    // La commande sans ventilation : rien par taux, tout en non ventilée.
    expect(rows[7]).toContain(";0,00;0,00;2,20;2,20;120,00");
  });

  it("date chaque commande en jour LOCAL — 22h30 UTC le 14 est le 15 à Paris", () => {
    const rows = rowsOf(statementCsv(aggregateStatement([order({})]), SEPTEMBER));
    expect(rows[6]?.startsWith('"2026-09-15";"CMD-1"')).toBe(true);
  });

  it("finit par une ligne de total qui recopie les totaux du relevé", () => {
    const rows = rowsOf(statementCsv(aggregateStatement([order({})]), SEPTEMBER));
    expect(rows.at(-2)).toBe(
      '"Total";"1 commande(s)";;;;100,00;5,00;0,00;95,00;15,00;0,00;7,00;3,00;0,00;10,00;120,00',
    );
  });
});

describe("rateLabel", () => {
  it("écrit le taux à la française", () => {
    expect(rateLabel(5.5)).toBe("5,5 %");
    expect(rateLabel(20)).toBe("20 %");
  });

  it("renseigne le site de chaque commande, et nomme le payeur d'un site qui suivait le principal", () => {
    const paid = aggregateStatement([order({ siteName: "Chalet Edelweiss" })], () => ({
      companyId: "c-alpes",
      name: "Alpes Chalets",
    }));
    const [line] = rowsOf(statementCsv(paid, SEPTEMBER)).filter((row) => row.includes("CMD-1"));
    expect(line).toContain('"Chalet Edelweiss";"Alpes Chalets"');
  });
});
