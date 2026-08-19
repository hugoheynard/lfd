import { companyWarnings, type WarningInput } from "../company-warnings.js";

const NOW = new Date("2026-08-14T09:00:00.000Z");

/** Un dossier sain, actif, sans rien à signaler — on retire ensuite. */
function company(over: Partial<WarningInput> = {}): WarningInput {
  return {
    status: "active",
    createdAt: new Date("2026-08-13T09:00:00.000Z"),
    hasLegalIdentity: true,
    hasHolder: true,
    hasBillingAddress: true,
    hasGrantedTerms: false,
    hasActiveMandate: false,
    kbisUploadedAt: null,
    kbisCertifiedAt: null,
    ...over,
  };
}

describe("les avertissements d'un dossier", () => {
  it("ne dit rien d'un compte sain", () => {
    expect(companyWarnings(company(), NOW)).toEqual([]);
  });

  it("signale un crédit accordé qu'on ne peut pas prélever", () => {
    // Le plus coûteux : on a promis un règlement différé sans moyen d'encaisser.
    const found = companyWarnings(company({ hasGrantedTerms: true }), NOW);

    expect(found).toEqual([{ kind: "mandat_absent", since: null }]);
  });

  it("se tait quand le mandat existe", () => {
    expect(
      companyWarnings(company({ hasGrantedTerms: true, hasActiveMandate: true }), NOW),
    ).toEqual([]);
  });

  it("signale un extrait déposé que personne n'a ouvert", () => {
    const uploaded = new Date("2026-08-10T09:00:00.000Z");
    const found = companyWarnings(company({ kbisUploadedAt: uploaded }), NOW);

    expect(found).toEqual([{ kind: "kbis_a_verifier", since: uploaded.toISOString() }]);
  });

  it("se tait sur un extrait vérifié", () => {
    const found = companyWarnings(
      company({ kbisUploadedAt: new Date("2026-08-10"), kbisCertifiedAt: new Date("2026-08-11") }),
      NOW,
    );

    expect(found).toEqual([]);
  });

  it("ne réclame RIEN sur les pièces d'un compte déjà actif", () => {
    // Un compte actif dont la facturation manque n'est pas « bloqué » : il
    // commande. Le dire ferait de la galerie une liste d'états, pas de gestes.
    const found = companyWarnings(
      company({ status: "active", hasBillingAddress: false, hasHolder: false }),
      NOW,
    );

    expect(found).toEqual([]);
  });

  it("signale un compte en attente auquel il manque de quoi ouvrir", () => {
    const found = companyWarnings(company({ status: "pending", hasBillingAddress: false }), NOW);

    expect(found.map((warning) => warning.kind)).toEqual(["activation_bloquee"]);
  });

  it("signale l'attente qui dure, même sans rien qui manque", () => {
    // Le dossier que personne n'a repris : complet, en attente, et oublié.
    const vieux = new Date("2026-07-20T09:00:00.000Z");
    const found = companyWarnings(company({ status: "pending", createdAt: vieux }), NOW);

    expect(found.map((warning) => warning.kind)).toEqual(["attente_prolongee"]);
  });

  it("laisse passer un compte en attente de la veille", () => {
    // Le rythme normal d'un commerçant n'est pas une alerte.
    expect(companyWarnings(company({ status: "pending" }), NOW)).toEqual([]);
  });

  it("rend UNE carte par motif, du plus grave au moins pressant", () => {
    // Deux manques sur la même société font deux cartes : la répétition du nom
    // dans la galerie EST le signal.
    const found = companyWarnings(
      company({
        status: "pending",
        createdAt: new Date("2026-07-01T09:00:00.000Z"),
        hasBillingAddress: false,
        hasGrantedTerms: true,
        kbisUploadedAt: new Date("2026-07-02T09:00:00.000Z"),
      }),
      NOW,
    );

    expect(found.map((warning) => warning.kind)).toEqual([
      "mandat_absent",
      "activation_bloquee",
      "attente_prolongee",
      "kbis_a_verifier",
    ]);
  });
});
