import { ALERT_KINDS, type AlertFinding, type AlertKind, type AlertRule } from "@lfd/contracts";

import { customerWarnings } from "../customer-warnings.js";
import type { AlertDraft } from "../evaluate-order.js";

const FINDING: AlertFinding = {
  sku: "VIE-001",
  productName: "Viennoiserie",
  quantity: 12,
  baseline: 4.3,
  deviationPercent: 179,
  message: "Viennoiserie — 12 contre 4,3 en moyenne (+179 %)",
};

/** La règle d'un type, avec le canal client au choix. */
function rules(kind: AlertKind, customerVisible: boolean): ReadonlyMap<AlertKind, AlertRule> {
  const base = ALERT_KINDS[kind].defaults;
  return new Map([[kind, { ...base, delivery: { ...base.delivery, customerVisible } }]]);
}

function draft(kind: AlertKind, findings: readonly AlertFinding[] = [FINDING]): AlertDraft {
  return { kind, findings };
}

describe("customerWarnings", () => {
  it("parle au client dans SES termes, sans pourcentage ni vocabulaire interne", () => {
    const warnings = customerWarnings(
      [draft("product.quantity_drift")],
      rules("product.quantity_drift", true),
    );

    expect(warnings).toEqual([
      { sku: "VIE-001", message: "Habituellement 4,3 — cette commande en porte 12." },
    ]);
    expect(warnings[0]?.message).not.toContain("%");
  });

  it("se tait quand la règle ne coche pas l'affichage client", () => {
    // Le type est montrable, mais personne ne l'a coché : c'est un signal interne.
    const warnings = customerWarnings(
      [draft("product.quantity_drift")],
      rules("product.quantity_drift", false),
    );

    expect(warnings).toEqual([]);
  });

  it("ne montre jamais un type qui n'est pas montrable, même coché", () => {
    // Défense en profondeur : le contrat refuse déjà `customerVisible` sur ce
    // type. Si une ligne en base l'avait quand même, on ne la montre pas —
    // « vous n'aviez jamais pris ce produit » n'est pas une erreur de saisie.
    const warnings = customerWarnings(
      [draft("product.first_order")],
      rules("product.first_order", true),
    );

    expect(warnings).toEqual([]);
  });

  it("ne pose qu'un avertissement par ligne", () => {
    // Deux règles qui parlent du même produit n'ont qu'une place sous la ligne.
    const other = { ...FINDING, quantity: 30, baseline: 2 };
    const warnings = customerWarnings(
      [draft("product.quantity_drift", [FINDING, other])],
      rules("product.quantity_drift", true),
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("4,3");
  });

  it("se tait quand il n'y a aucune référence à opposer", () => {
    // Sans référence, la phrase n'apprendrait rien au client.
    const warnings = customerWarnings(
      [draft("product.quantity_drift", [{ ...FINDING, baseline: null }])],
      rules("product.quantity_drift", true),
    );

    expect(warnings).toEqual([]);
  });

  it("écrit les entiers sans décimale", () => {
    const warnings = customerWarnings(
      [draft("product.quantity_drift", [{ ...FINDING, baseline: 4 }])],
      rules("product.quantity_drift", true),
    );

    expect(warnings[0]?.message).toBe("Habituellement 4 — cette commande en porte 12.");
  });
});
