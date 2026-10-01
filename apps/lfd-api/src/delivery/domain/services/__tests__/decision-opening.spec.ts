import { DELIVERY_INCIDENT_REASONS } from "@lfd/contracts";

import { DECISION_OPENING_REASONS, opensDecision } from "../decision-opening.js";

describe("opensDecision — quel signalement ouvre une décision du commercial (§ 9, B3)", () => {
  it("à la remise : personne, refus, accès impossible", () => {
    expect(opensDecision("doorstep", "nobody_present")).toBe(true);
    expect(opensDecision("doorstep", "refused")).toBe(true);
    expect(opensDecision("doorstep", "access_impossible")).toBe(true);
  });

  it("pas un problème du livreur ou du produit : adresse introuvable, marchandise abîmée, autre", () => {
    expect(opensDecision("doorstep", "address_not_found")).toBe(false);
    expect(opensDecision("doorstep", "goods_damaged")).toBe(false);
    expect(opensDecision("doorstep", "other")).toBe(false);
  });

  it("jamais un problème technique ou routier", () => {
    expect(opensDecision("technical", "vehicle_breakdown")).toBe(false);
    expect(opensDecision("road", "road_closed")).toBe(false);
  });

  it("chaque motif qui ouvre est un motif « à la remise » proposé au livreur", () => {
    const doorstep: readonly string[] = DELIVERY_INCIDENT_REASONS.doorstep;
    expect(DECISION_OPENING_REASONS.every((reason) => doorstep.includes(reason))).toBe(true);
  });
});
