import type { LeadView } from "@lfd/contracts";

import { prospectsFrom } from "../prospect.js";

// Dates comparées entre elles seulement (tri) : `prospectsFrom` ne lit pas l'horloge.
function lead(overrides: Partial<LeadView> = {}): LeadView {
  return {
    id: "lead_1",
    businessName: "Bistrot du Coin",
    contactName: "Paul Martin",
    email: "chef@bistrot.fr",
    phone: "06 12 34 56 78",
    siret: "",
    status: "contacted",
    notes: "",
    linkedUserId: null,
    createdAt: "2026-08-10T09:00:00.000Z",
    lastContactedAt: "2026-08-16T09:00:00.000Z",
    ...overrides,
  };
}

describe("prospectsFrom", () => {
  it("rend un lead actif avec ce que la file affiche : établissement, contact, coordonnées, étape, depuis", () => {
    expect(prospectsFrom([lead()])).toEqual([
      {
        leadId: "lead_1",
        businessName: "Bistrot du Coin",
        contactName: "Paul Martin",
        phone: "06 12 34 56 78",
        email: "chef@bistrot.fr",
        status: "contacted",
        capturedAt: "2026-08-10T09:00:00.000Z",
        lastContactedAt: "2026-08-16T09:00:00.000Z",
      },
    ]);
  });

  it("garde les quatre étapes ouvertes et écarte les leads clos (converti, perdu)", () => {
    const prospects = prospectsFrom([
      lead({ id: "l_new", status: "new" }),
      lead({ id: "l_contacted", status: "contacted" }),
      lead({ id: "l_qualified", status: "qualified" }),
      lead({ id: "l_negotiating", status: "negotiating" }),
      lead({ id: "l_converted", status: "converted" }),
      lead({ id: "l_lost", status: "lost" }),
    ]);
    expect(prospects.map((p) => p.leadId).sort()).toEqual([
      "l_contacted",
      "l_negotiating",
      "l_new",
      "l_qualified",
    ]);
  });

  it("met en tête le lead touché le plus récemment (dernier contact, sinon saisie)", () => {
    const prospects = prospectsFrom([
      lead({ id: "l_old", createdAt: "2026-08-01T09:00:00.000Z", lastContactedAt: null }),
      lead({
        id: "l_called",
        createdAt: "2026-08-02T09:00:00.000Z",
        lastContactedAt: "2026-08-15T09:00:00.000Z",
      }),
      lead({ id: "l_fresh", createdAt: "2026-08-12T09:00:00.000Z", lastContactedAt: null }),
    ]);
    expect(prospects.map((p) => p.leadId)).toEqual(["l_called", "l_fresh", "l_old"]);
  });

  it("rend une file vide sans lead", () => {
    expect(prospectsFrom([])).toEqual([]);
  });
});
