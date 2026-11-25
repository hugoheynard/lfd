import { checkJournalFact } from "@lfd/contracts/journal-facts";

import { Backorder } from "../../domain/entities/backorder.js";
import { BackorderLine } from "../../domain/value-objects/backorder-line.js";
import { BackorderJournalFacts } from "../backorder-journal-facts.js";

function backorder(): Backorder {
  return Backorder.open({
    id: "bo_1",
    originOrderId: "ord_origin",
    companyId: null,
    buyerUserId: "usr_1",
    lines: [
      BackorderLine.of({ sku: "VIE-001-1", quantity: 2, saleUnit: "piece" }),
      BackorderLine.of({ sku: "PAI-010-1", quantity: 750, saleUnit: "weight" }),
    ],
    openedAt: new Date("2026-01-10T09:00:00.000Z"),
  });
}

describe("les faits du reliquat", () => {
  it("backorder.opened : sur la commande d'origine, le reste par article", () => {
    const fact = BackorderJournalFacts.opened(backorder(), "CMD-142");

    expect(fact).toEqual({
      type: "backorder.opened",
      subjectType: "order",
      subjectId: "ord_origin",
      payload: {
        subjectLabel: "CMD-142",
        lines: [
          { sku: "VIE-001-1", quantity: 2, saleUnit: "piece" },
          { sku: "PAI-010-1", quantity: 750, saleUnit: "weight" },
        ],
      },
    });
    expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
  });

  it("backorder.converted : la commande qui en est issue", () => {
    const fact = BackorderJournalFacts.converted(backorder(), "CMD-142", {
      id: "ord_new",
      number: "CMD-150",
    });

    expect(fact.payload).toEqual({
      subjectLabel: "CMD-142",
      orderId: "ord_new",
      orderNumber: "CMD-150",
    });
    expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
  });

  it("backorder.abandoned : la commande d'origine seule", () => {
    const fact = BackorderJournalFacts.abandoned(backorder(), "CMD-142");

    expect(fact).toMatchObject({ subjectType: "order", subjectId: "ord_origin" });
    expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
  });

  // Le sujet est l'ORIGINE (un reliquat par origine), jamais l'identifiant du
  // reliquat : le fil de la commande doit les rassembler.
  it("les trois faits portent la commande d'origine, pas l'identifiant du reliquat", () => {
    const facts = [
      BackorderJournalFacts.opened(backorder(), "CMD-142"),
      BackorderJournalFacts.converted(backorder(), "CMD-142", { id: "ord_new", number: "CMD-150" }),
      BackorderJournalFacts.abandoned(backorder(), "CMD-142"),
    ];

    expect(facts.map((fact) => fact.subjectId)).toEqual(["ord_origin", "ord_origin", "ord_origin"]);
    expect(facts.map((fact) => fact.subjectType)).toEqual(["order", "order", "order"]);
  });

  it("backorder.opened garde les grammes tels quels, sans les convertir", () => {
    const fact = BackorderJournalFacts.opened(backorder(), "CMD-142");

    const { lines } = fact.payload as { readonly lines: readonly unknown[] };
    expect(lines).toContainEqual({ sku: "PAI-010-1", quantity: 750, saleUnit: "weight" });
  });

  it("le fait de transformation ne désigne pas l'origine comme commande issue", () => {
    const fact = BackorderJournalFacts.converted(backorder(), "CMD-142", {
      id: "ord_new",
      number: "CMD-150",
    });

    expect(fact.payload).toMatchObject({ orderId: "ord_new" });
    expect(fact.payload).not.toMatchObject({ orderId: "ord_origin" });
  });
});
