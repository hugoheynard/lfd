import { deriveProspects, type ProspectEvent } from "../prospect.js";

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
