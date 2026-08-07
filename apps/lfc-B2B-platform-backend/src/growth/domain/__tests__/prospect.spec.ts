import { deriveProspects, momentumOf, type ProspectEvent } from "../prospect.js";

const NOW = new Date("2026-08-20T10:00:00.000Z");

/** Un événement d'inscription de `subjectId` à la date donnée. */
function registered(subjectId: string, at: string, email = "chef@resto.fr"): ProspectEvent {
  return { type: "user.registered", subjectId, occurredAt: new Date(at), payload: { email } };
}

/** Un événement de commande de `subjectId` (zéro-friction sauf companyId fourni). */
function ordered(
  subjectId: string,
  at: string,
  totalCents: number,
  companyId: string | null = null,
): ProspectEvent {
  return {
    type: "order.placed",
    subjectId,
    occurredAt: new Date(at),
    payload: { totalCents, companyId },
  };
}

describe("deriveProspects", () => {
  it("classe mid une personne inscrite sans commande", () => {
    const [prospect] = deriveProspects([registered("u1", "2026-08-18T09:00:00.000Z")], NOW);
    expect(prospect).toMatchObject({
      subjectId: "u1",
      email: "chef@resto.fr",
      temperature: "mid",
      orderCount: 0,
      totalCents: 0,
      lastOrderAt: null,
      recencyDays: 2, // 18 → 20 août
    });
  });

  it("classe hot une personne qui a commandé, agrège total et dernière commande", () => {
    const [prospect] = deriveProspects(
      [
        registered("u1", "2026-08-10T09:00:00.000Z"),
        ordered("u1", "2026-08-12T09:00:00.000Z", 633),
        ordered("u1", "2026-08-15T09:00:00.000Z", 1200),
      ],
      NOW,
    );
    expect(prospect).toMatchObject({
      subjectId: "u1",
      temperature: "hot",
      orderCount: 2,
      totalCents: 1833,
      lastOrderAt: "2026-08-15T09:00:00.000Z",
      firstSeenAt: "2026-08-10T09:00:00.000Z",
      recencyDays: 5, // 15 → 20 août
    });
  });

  it("exclut une personne qui transacte pour une société (companyId non nul)", () => {
    const prospects = deriveProspects(
      [ordered("u1", "2026-08-12T09:00:00.000Z", 5000, "company_1")],
      NOW,
    );
    expect(prospects).toEqual([]);
  });

  it("un hot sans inscription connue au journal a un e-mail vide", () => {
    const [prospect] = deriveProspects([ordered("u1", "2026-08-19T09:00:00.000Z", 400)], NOW);
    expect(prospect.email).toBe("");
    expect(prospect.temperature).toBe("hot");
  });

  it("trie hot avant mid, puis par récence (le plus frais d'abord)", () => {
    const prospects = deriveProspects(
      [
        registered("mid-old", "2026-08-01T09:00:00.000Z"),
        registered("mid-fresh", "2026-08-19T09:00:00.000Z"),
        registered("hot", "2026-08-05T09:00:00.000Z"),
        ordered("hot", "2026-08-18T09:00:00.000Z", 400),
      ],
      NOW,
    );
    expect(prospects.map((p) => p.subjectId)).toEqual(["hot", "mid-fresh", "mid-old"]);
  });
});

describe("momentumOf", () => {
  const d = (iso: string): Date => new Date(iso);
  // NOW = 20 août. Fenêtre récente = (6 août, 20 août] ; précédente = (23 juil, 6 août].

  it("accélère quand la fenêtre récente dépasse la précédente", () => {
    const orders = [d("2026-08-10"), d("2026-08-15"), d("2026-08-01")]; // 2 récents, 1 avant
    expect(momentumOf(orders, NOW)).toBe("accelerating");
  });

  it("refroidit quand la récente est sous la précédente", () => {
    const orders = [d("2026-08-18"), d("2026-08-01"), d("2026-07-28")]; // 1 récent, 2 avant
    expect(momentumOf(orders, NOW)).toBe("cooling");
  });

  it("stable à volumes égaux non nuls", () => {
    const orders = [d("2026-08-15"), d("2026-08-02")]; // 1 récent, 1 avant
    expect(momentumOf(orders, NOW)).toBe("stable");
  });

  it("dormant sans aucune commande récente", () => {
    expect(momentumOf([d("2026-07-01"), d("2026-06-15")], NOW)).toBe("dormant");
    expect(momentumOf([], NOW)).toBe("dormant");
  });
});

describe("deriveProspects — momentum intégré", () => {
  it("porte le momentum sur chaque prospect (mid = dormant)", () => {
    const [prospect] = deriveProspects([registered("u_mid", "2026-08-18T09:00:00.000Z")], NOW);
    expect(prospect.momentum).toBe("dormant");
  });

  it("un hot qui accélère est marqué accelerating", () => {
    const [prospect] = deriveProspects(
      [
        ordered("u1", "2026-08-19T09:00:00.000Z", 400),
        ordered("u1", "2026-08-17T09:00:00.000Z", 400),
        ordered("u1", "2026-08-02T09:00:00.000Z", 400),
      ],
      NOW,
    );
    expect(prospect.momentum).toBe("accelerating");
  });
});

import { coldProspectsFrom, mergeProspects } from "../prospect.js";
import type { LeadView } from "@lfd/contracts";

function lead(overrides: Partial<LeadView> = {}): LeadView {
  return {
    id: "lead_1",
    businessName: "Bistrot du Coin",
    contactName: "",
    email: "chef@bistrot.fr",
    phone: "",
    siret: "",
    status: "contacted",
    notes: "",
    linkedUserId: null,
    createdAt: "2026-08-10T09:00:00.000Z",
    lastContactedAt: "2026-08-16T09:00:00.000Z",
    ...overrides,
  };
}

describe("coldProspectsFrom", () => {
  it("mappe un lead actif en prospect cold (sortant, dormant, récence depuis le dernier contact)", () => {
    const [cold] = coldProspectsFrom([lead()], NOW);
    expect(cold).toMatchObject({
      subjectId: "lead_1",
      temperature: "cold",
      source: "outbound",
      momentum: "dormant",
      orderCount: 0,
      totalCents: 0,
      lastOrderAt: null,
      label: "Bistrot du Coin",
      recencyDays: 4, // 16 → 20 août
      leadStatus: "contacted", // le statut voyage pour les actions de suivi en ligne
    });
  });

  it("écarte les leads clos (converted/lost) — dédup avec la projection entrante", () => {
    const cold = coldProspectsFrom(
      [lead({ id: "l1", status: "converted" }), lead({ id: "l2", status: "lost" })],
      NOW,
    );
    expect(cold).toHaveLength(0);
  });

  it("prend la date de saisie comme ancre quand jamais contacté", () => {
    const [cold] = coldProspectsFrom([lead({ lastContactedAt: null })], NOW);
    expect(cold.recencyDays).toBe(10); // 10 → 20 août
  });
});

describe("mergeProspects", () => {
  it("unifie hot/mid entrants et cold, triés hot → mid → cold", () => {
    const inbound = deriveProspects(
      [
        registered("u_mid", "2026-08-18T09:00:00.000Z"),
        ordered("u_hot", "2026-08-19T09:00:00.000Z", 500),
      ],
      NOW,
    );
    const merged = mergeProspects(inbound, [lead()], NOW);
    expect(merged.map((p) => p.temperature)).toEqual(["hot", "mid", "cold"]);
  });
});
