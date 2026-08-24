import { deriveLeadScores, type LeadEvent } from "../lead-score.js";

const NOW = new Date("2026-08-20T10:00:00.000Z");

/** Inscription d'une personne (sujet = user). */
function registered(subjectId: string, at: string, email = "chef@resto.fr"): LeadEvent {
  return {
    type: "user.registered",
    subjectType: "user",
    subjectId,
    occurredAt: new Date(at),
    actorType: "customer",
    payload: { email },
  };
}

/** Commande d'une personne (zéro-friction : companyId null par défaut). */
function ordered(
  subjectId: string,
  at: string,
  totalCents: number,
  companyId: string | null = null,
): LeadEvent {
  return {
    type: "order.placed",
    subjectType: "user",
    subjectId,
    occurredAt: new Date(at),
    actorType: "customer",
    payload: { totalCents, companyId },
  };
}

/** Abonnement souscrit par une personne (récurrence = engagement). */
function subscribed(subjectId: string, at: string): LeadEvent {
  return {
    type: "subscription.created",
    subjectType: "user",
    subjectId,
    occurredAt: new Date(at),
    actorType: "customer",
    payload: { subscriptionId: `sub_${subjectId}` },
  };
}

/** Déclaration d'une société (sujet = company). */
function declared(companyId: string, at: string, via: "self" | "staff" = "self"): LeadEvent {
  return {
    type: "company.declared",
    subjectType: "company",
    subjectId: companyId,
    occurredAt: new Date(at),
    actorType: via === "staff" ? "staff" : "customer",
    payload: { via, ownerUserId: "u_owner" },
  };
}

/** Une pièce d'activation franchie. */
function stepReached(companyId: string, at: string, step: string): LeadEvent {
  return {
    type: "company.step_reached",
    subjectType: "company",
    subjectId: companyId,
    occurredAt: new Date(at),
    actorType: "customer",
    payload: { step },
  };
}

/** Activation d'une société (clic staff d'aboutissement). */
function activated(companyId: string, at: string): LeadEvent {
  return {
    type: "company.activated",
    subjectType: "company",
    subjectId: companyId,
    occurredAt: new Date(at),
    actorType: "staff",
    payload: {},
  };
}

describe("deriveLeadScores", () => {
  it("play lock_in pour un prospect chaud sans abonnement, rythme porteur", () => {
    const [lead] = deriveLeadScores(
      [
        registered("u1", "2026-08-10T09:00:00.000Z"),
        ordered("u1", "2026-08-18T09:00:00.000Z", 5000),
      ],
      NOW,
    );
    expect(lead).toMatchObject({
      subjectType: "user",
      subjectId: "u1",
      label: "chef@resto.fr",
      play: "lock_in",
      momentum: "accelerating",
      monetaryCents: 5000,
    });
    expect(lead?.reason).toContain("pas encore d'abonnement");
    expect(lead?.score).toBeGreaterThan(0);
  });

  it("play upgrade dès qu'un abonnement existe", () => {
    const [lead] = deriveLeadScores(
      [
        registered("u1", "2026-08-10T09:00:00.000Z"),
        ordered("u1", "2026-08-18T09:00:00.000Z", 5000),
        subscribed("u1", "2026-08-18T10:00:00.000Z"),
      ],
      NOW,
    );
    expect(lead?.play).toBe("upgrade");
    expect(lead?.reason).toContain("déjà abonné");
  });

  it("play win_back pour un prospect chaud devenu silencieux (momentum dormant)", () => {
    const [lead] = deriveLeadScores(
      [
        registered("u1", "2026-06-01T09:00:00.000Z"),
        ordered("u1", "2026-06-05T09:00:00.000Z", 3000),
      ],
      NOW,
    );
    expect(lead?.play).toBe("win_back");
    expect(lead?.momentum).toBe("dormant");
    expect(lead?.reason).toContain("silencieux");
  });

  it("play rescue pour un dossier d'activation bloqué, scoré par complétion + urgence", () => {
    const [lead] = deriveLeadScores(
      [
        declared("c1", "2026-08-06T09:00:00.000Z"),
        stepReached("c1", "2026-08-06T10:00:00.000Z", "vat"),
        stepReached("c1", "2026-08-06T11:00:00.000Z", "kbis"),
      ],
      NOW,
    );
    expect(lead).toMatchObject({
      subjectType: "company",
      subjectId: "c1",
      play: "rescue",
      momentum: null,
      recencyDays: 14, // bloqué depuis le 6 août
    });
    expect(lead?.reason).toBe("Dossier 2/4 pièces, bloqué depuis 14 j");
  });

  it("exclut les mid (inscrits sans commande) — ils vivent dans l'onglet Prospects", () => {
    const leads = deriveLeadScores([registered("u1", "2026-08-18T09:00:00.000Z")], NOW);
    expect(leads).toHaveLength(0);
  });

  it("exclut une société déjà activée (plus un dossier à secourir)", () => {
    const leads = deriveLeadScores(
      [declared("c1", "2026-08-06T09:00:00.000Z"), activated("c1", "2026-08-08T09:00:00.000Z")],
      NOW,
    );
    expect(leads).toHaveLength(0);
  });

  it("exclut une personne qui transacte pour une société (client établi, pas un prospect)", () => {
    const leads = deriveLeadScores(
      [
        registered("u1", "2026-08-10T09:00:00.000Z"),
        ordered("u1", "2026-08-18T09:00:00.000Z", 5000, "company_42"),
      ],
      NOW,
    );
    expect(leads).toHaveLength(0);
  });

  it("trie par score décroissant et borne le score dans 0..100", () => {
    const leads = deriveLeadScores(
      [
        // Lead fort : gros montant, fréquent, récent, abonné.
        registered("u_strong", "2026-07-20T09:00:00.000Z"),
        ordered("u_strong", "2026-08-12T09:00:00.000Z", 60000),
        ordered("u_strong", "2026-08-16T09:00:00.000Z", 60000),
        ordered("u_strong", "2026-08-19T09:00:00.000Z", 60000),
        subscribed("u_strong", "2026-08-19T10:00:00.000Z"),
        // Lead faible : petite commande ancienne.
        registered("u_weak", "2026-06-10T09:00:00.000Z"),
        ordered("u_weak", "2026-06-12T09:00:00.000Z", 800),
      ],
      NOW,
    );
    expect(leads.map((lead) => lead.subjectId)).toEqual(["u_strong", "u_weak"]);
    for (const lead of leads) {
      expect(lead.score).toBeGreaterThanOrEqual(0);
      expect(lead.score).toBeLessThanOrEqual(100);
    }
    expect(leads[0]?.score).toBeGreaterThan(leads[1]?.score ?? 0);
  });

  it("estampille chaque ligne du `now` injecté (fraîcheur de la reco)", () => {
    const [lead] = deriveLeadScores(
      [
        registered("u1", "2026-08-10T09:00:00.000Z"),
        ordered("u1", "2026-08-18T09:00:00.000Z", 5000),
      ],
      NOW,
    );
    expect(lead?.computedAt).toBe(NOW.toISOString());
  });
});

import type { LeadView } from "@lfd/contracts";

function coldLead(overrides: Partial<LeadView> = {}): LeadView {
  return {
    id: "lead_1",
    businessName: "Traiteur Démarché",
    contactName: "",
    email: "",
    phone: "",
    siret: "",
    status: "qualified",
    notes: "",
    linkedUserId: null,
    createdAt: "2026-08-10T09:00:00.000Z",
    lastContactedAt: "2026-08-18T09:00:00.000Z",
    ...overrides,
  };
}

describe("deriveLeadScores — leads cold (play nurture)", () => {
  it("score un lead cold actif avec la play nurture (avancement × récence)", () => {
    const [lead] = deriveLeadScores([], NOW, [coldLead()]);
    expect(lead).toMatchObject({
      subjectType: "lead",
      subjectId: "lead_1",
      play: "nurture",
      label: "Traiteur Démarché",
      momentum: null,
    });
    expect(lead?.reason).toContain("qualifié");
    expect(lead?.score).toBeGreaterThan(0);
  });

  it("exclut les leads cold clos (converted/lost) de la queue", () => {
    const leads = deriveLeadScores([], NOW, [
      coldLead({ id: "l1", status: "converted" }),
      coldLead({ id: "l2", status: "lost" }),
    ]);
    expect(leads).toHaveLength(0);
  });

  it("classe un lead en négociation récent au-dessus d'un lead à peine saisi", () => {
    const leads = deriveLeadScores([], NOW, [
      coldLead({
        id: "hot_lead",
        status: "negotiating",
        lastContactedAt: "2026-08-19T09:00:00.000Z",
      }),
      coldLead({
        id: "cold_lead",
        status: "new",
        lastContactedAt: null,
        createdAt: "2026-07-01T09:00:00.000Z",
      }),
    ]);
    expect(leads[0]?.subjectId).toBe("hot_lead");
    expect(leads[0]?.score ?? 0).toBeGreaterThan(leads[1]?.score ?? 0);
  });
});
