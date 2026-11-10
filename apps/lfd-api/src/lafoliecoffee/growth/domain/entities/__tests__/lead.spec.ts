import { Lead, type CaptureLeadInput } from "../lead.js";
import { InvalidLeadError, LeadTransitionError } from "../../errors/lead-errors.js";

const NOW = new Date("2026-08-20T10:00:00.000Z");

function captureInput(overrides: Partial<CaptureLeadInput> = {}): CaptureLeadInput {
  return {
    businessName: "Bistrot du Coin",
    contactName: "Marie Chef",
    email: "Marie@Bistrot.fr",
    phone: "0102030405",
    siret: "",
    notes: "Rencontrée au salon",
    ...overrides,
  };
}

describe("Lead — capture", () => {
  it("saisit un lead cold en statut new, e-mail normalisé, non persisté", () => {
    const lead = Lead.capture(captureInput());
    expect(lead.id).toBeNull();
    expect(lead.status).toBe("new");
    expect(lead.email).toBe("marie@bistrot.fr");
    expect(lead.linkedUserId).toBeNull();
    expect(lead.lastContactedAt).toBeNull();
  });

  it("refuse une raison sociale vide (le modèle se protège — DomainError)", () => {
    expect(() => Lead.capture(captureInput({ businessName: "   " }))).toThrow(InvalidLeadError);
  });
});

describe("Lead — pipeline (jalon monotone)", () => {
  it("avance new → contacted et horodate le contact", () => {
    const lead = Lead.capture(captureInput());
    lead.moveTo("contacted", NOW);
    expect(lead.status).toBe("contacted");
    expect(lead.lastContactedAt).toEqual(NOW);
  });

  it("autorise un saut avant (new → qualified) mais refuse tout recul", () => {
    const lead = Lead.capture(captureInput());
    lead.moveTo("qualified", NOW);
    expect(lead.status).toBe("qualified");
    expect(() => lead.moveTo("contacted", NOW)).toThrow(LeadTransitionError);
  });

  it("refuse de rester sur place (négociation → négociation)", () => {
    const lead = Lead.capture(captureInput());
    lead.moveTo("negotiating", NOW);
    expect(() => lead.moveTo("negotiating", NOW)).toThrow(LeadTransitionError);
  });

  it("convertit / perd depuis n'importe quel état actif", () => {
    const won = Lead.capture(captureInput());
    won.moveTo("converted", NOW);
    expect(won.status).toBe("converted");

    const lost = Lead.capture(captureInput());
    lost.moveTo("contacted", NOW);
    lost.moveTo("lost", NOW);
    expect(lost.status).toBe("lost");
  });

  it("gèle tout mouvement depuis un état clos (converted/lost terminaux)", () => {
    const lead = Lead.capture(captureInput());
    lead.moveTo("converted", NOW);
    expect(lead.isClosed).toBe(true);
    expect(() => lead.moveTo("negotiating", NOW)).toThrow(LeadTransitionError);
    expect(() => lead.moveTo("lost", NOW)).toThrow(LeadTransitionError);
  });

  it("refuse de revenir à « new »", () => {
    const lead = Lead.capture(captureInput());
    lead.moveTo("contacted", NOW);
    expect(() => lead.moveTo("new", NOW)).toThrow(LeadTransitionError);
  });
});

describe("Lead — rapprochement (linkToUser)", () => {
  it("rattache au compte et convertit quand le prospect s'inscrit", () => {
    const lead = Lead.capture(captureInput());
    lead.moveTo("contacted", NOW);
    lead.linkToUser("user_42");
    expect(lead.linkedUserId).toBe("user_42");
    expect(lead.status).toBe("converted");
  });

  it("est un no-op sur un lead déjà clos (ne ressuscite pas un perdu)", () => {
    const lead = Lead.capture(captureInput());
    lead.moveTo("lost", NOW);
    lead.linkToUser("user_42");
    expect(lead.status).toBe("lost");
    expect(lead.linkedUserId).toBeNull();
  });
});
