import { companyIdsOf, deriveActivations, type ActivationEvent } from "../activation.js";
import type { CompanyIdentity } from "../ports/company-namer.js";

const MARTIN: CompanyIdentity = { enseigne: "Boulangerie Martin", raisonSociale: "SARL MARTIN" };

const NOW = new Date("2026-08-20T10:00:00.000Z");

function declared(
  companyId: string,
  at: string,
  via: "self" | "staff" = "self",
  actorType = "customer",
): ActivationEvent {
  return {
    type: "company.declared",
    subjectId: companyId,
    occurredAt: new Date(at),
    actorType,
    payload: { via },
  };
}

function step(
  companyId: string,
  at: string,
  stepName: string,
  actorType = "customer",
): ActivationEvent {
  return {
    type: "company.step_reached",
    subjectId: companyId,
    occurredAt: new Date(at),
    actorType,
    payload: { step: stepName },
  };
}

function activated(companyId: string, at: string): ActivationEvent {
  return {
    type: "company.activated",
    subjectId: companyId,
    occurredAt: new Date(at),
    actorType: "staff",
    payload: { activatedAt: at },
  };
}

describe("deriveActivations", () => {
  it("mesure la complétion et les pièces manquantes", () => {
    const [view] = deriveActivations(
      [
        declared("c1", "2026-08-10T09:00:00.000Z"),
        step("c1", "2026-08-11T09:00:00.000Z", "vat"),
        step("c1", "2026-08-12T09:00:00.000Z", "kbis"),
      ],
      NOW,
    );
    expect(view).toMatchObject({
      companyId: "c1",
      status: "pending",
      stepsReached: ["vat", "kbis"],
      stepsMissing: ["billing", "delivery"],
      completion: 0.5,
      stalledDays: 10,
    });
  });

  it("marque adoption+ une société déclarée self sans AUCUNE interaction staff", () => {
    const [view] = deriveActivations(
      [
        declared("c1", "2026-08-10T09:00:00.000Z", "self"),
        step("c1", "2026-08-11T09:00:00.000Z", "vat", "customer"),
      ],
      NOW,
    );
    expect(view!.adoptionPlus).toBe(true);
  });

  it("retire adoption+ dès qu'une pièce est posée par le staff", () => {
    const [view] = deriveActivations(
      [
        declared("c1", "2026-08-10T09:00:00.000Z", "self"),
        step("c1", "2026-08-11T09:00:00.000Z", "vat", "staff"),
      ],
      NOW,
    );
    expect(view!.adoptionPlus).toBe(false);
  });

  it("une société déclarée par le staff n'est jamais adoption+", () => {
    const [view] = deriveActivations([declared("c1", "2026-08-10T09:00:00.000Z", "staff")], NOW);
    expect(view!.adoptionPlus).toBe(false);
    expect(view!.declaredVia).toBe("staff");
  });

  it("reste adoption+ si activée par le staff sans qu'il ait posé de pièce (0-touch)", () => {
    // Le clic d'activation est toujours staff : il ne compte PAS comme hand-holding.
    const [view] = deriveActivations(
      [
        declared("c1", "2026-08-10T09:00:00.000Z", "self"),
        step("c1", "2026-08-11T09:00:00.000Z", "vat", "customer"),
        activated("c1", "2026-08-14T09:00:00.000Z"),
      ],
      NOW,
    );
    expect(view!.adoptionPlus).toBe(true);
    expect(view!.status).toBe("active");
  });

  it("passe active et arrête le compteur stalled une fois activée", () => {
    const [view] = deriveActivations(
      [declared("c1", "2026-08-10T09:00:00.000Z"), activated("c1", "2026-08-14T09:00:00.000Z")],
      NOW,
    );
    expect(view).toMatchObject({
      status: "active",
      activatedAt: "2026-08-14T09:00:00.000Z",
      stalledDays: null,
    });
  });

  it("ignore une société sans fait `company.declared` au journal", () => {
    expect(deriveActivations([step("c1", "2026-08-11T09:00:00.000Z", "vat")], NOW)).toEqual([]);
  });

  it("trie pending d'abord, le plus anciennement bloqué en tête", () => {
    const views = deriveActivations(
      [
        declared("c_active", "2026-08-01T09:00:00.000Z"),
        activated("c_active", "2026-08-05T09:00:00.000Z"),
        declared("c_recent", "2026-08-18T09:00:00.000Z"),
        declared("c_old", "2026-08-02T09:00:00.000Z"),
      ],
      NOW,
    );
    expect(views.map((v) => v.companyId)).toEqual(["c_old", "c_recent", "c_active"]);
  });
});

/**
 * Régression : le tunnel ne rendait que `companyId`, et les deux écrans qui le
 * lisent — la colonne « Société » et le coup `rescue` du cockpit — affichaient
 * donc une chaîne technique que personne ne reconnaît (fix 2026-09-12).
 */
describe("deriveActivations — le dossier porte un nom", () => {
  it("nomme le dossier par l'enseigne quand l'annuaire la connaît", () => {
    const [view] = deriveActivations(
      [declared("c1", "2026-08-10T09:00:00.000Z")],
      NOW,
      new Map([["c1", MARTIN]]),
    );

    expect(view?.companyName).toBe("Boulangerie Martin");
  });

  it("rend `null` plutôt qu'un identifiant quand la société a disparu de l'annuaire", () => {
    const [view] = deriveActivations([declared("c1", "2026-08-10T09:00:00.000Z")], NOW, new Map());

    expect(view?.companyName).toBeNull();
  });

  it("sans annuaire du tout, le dossier reste dérivable — les compteurs n'ont personne à nommer", () => {
    const [view] = deriveActivations([declared("c1", "2026-08-10T09:00:00.000Z")], NOW);

    expect(view).toMatchObject({ companyId: "c1", companyName: null, status: "pending" });
  });
});

describe("companyIdsOf", () => {
  it("ne retient que les sociétés DÉCLARÉES — une pièce orpheline n'est pas un dossier", () => {
    const ids = companyIdsOf([
      declared("c1", "2026-08-10T09:00:00.000Z"),
      step("c1", "2026-08-11T09:00:00.000Z", "vat"),
      step("c2", "2026-08-11T09:00:00.000Z", "vat"),
    ]);

    expect(ids).toEqual(["c1"]);
  });

  it("dédoublonne : on ne demande pas deux fois la même enseigne", () => {
    const ids = companyIdsOf([
      declared("c1", "2026-08-10T09:00:00.000Z"),
      declared("c1", "2026-08-10T09:00:00.000Z"),
      declared("c2", "2026-08-10T09:00:00.000Z"),
    ]);

    expect(ids).toEqual(["c1", "c2"]);
  });
});
