import { checkJournalFact } from "../index.js";

/**
 * L'historique d'une commande dit le HT d'une commande pro et le TTC d'une
 * commande particulier : `order.placed` et `order.revised` portent le HT et la
 * clientèle, optionnels parce que les faits écrits avant ne les ont pas.
 */
describe("le HT et la clientèle des faits de commande", () => {
  const placed = {
    subjectLabel: "Léa Petit",
    orderId: "o1",
    orderNumber: "C-1",
    companyId: "cmp_1",
    totalCents: 1_200,
  };
  const revised = {
    subjectLabel: "Léa Petit",
    orderId: "o1",
    orderNumber: "C-1",
    revision: 1,
    revisedBy: null,
    changes: ["lines"],
    totalBeforeCents: 1_200,
    totalAfterCents: 1_500,
  };

  it("accepte un `order.placed` écrit avant le HT", () => {
    expect(checkJournalFact("order.placed", placed)).toBeNull();
  });

  it("accepte un `order.placed` qui porte le HT et la clientèle", () => {
    expect(
      checkJournalFact("order.placed", { ...placed, totalPretaxCents: 1_000, clientele: "pro" }),
    ).toBeNull();
  });

  it("refuse une clientèle inconnue", () => {
    expect(checkJournalFact("order.placed", { ...placed, clientele: "b2b" })).not.toBeNull();
  });

  it("accepte un `order.revised` écrit avant le HT", () => {
    expect(checkJournalFact("order.revised", revised)).toBeNull();
  });

  it("accepte un `order.revised` qui porte les deux HT et la clientèle", () => {
    expect(
      checkJournalFact("order.revised", {
        ...revised,
        pretaxBeforeCents: 1_000,
        pretaxAfterCents: 1_250,
        clientele: "public",
      }),
    ).toBeNull();
  });
});
