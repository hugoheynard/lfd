import { KbisNotFoundError } from "../../errors/account-errors.js";
import { Company } from "../../entities/company.js";
import { KbisDeposit, type KbisCertification, type KbisFile } from "../kbis-deposit.js";

/**
 * **L'extrait déposé, et la parole d'un agent dessus.**
 *
 * Une seule règle compte ici, et elle a vécu jusqu'au 2026-09-03 dans un
 * adaptateur Prisma qui remettait quatre colonnes à `null` : **un nouveau
 * fichier n'est jamais certifié**. Elle n'est plus appliquée, elle est vraie par
 * construction — ce fichier le vérifie, et vérifie surtout qu'on ne peut plus
 * l'oublier en passant par un autre chemin d'écriture.
 *
 * Dates absolues : elles ne sont comparées qu'entre elles, jamais à l'horloge.
 */

const FILE: KbisFile = {
  storageKey: "companies/c1/kbis",
  fileName: "kbis.pdf",
  contentType: "application/pdf",
  size: 4096,
  uploadedAt: new Date("2026-02-03T10:00:00Z"),
};

const REPLACEMENT: KbisFile = {
  ...FILE,
  fileName: "kbis-2026.pdf",
  uploadedAt: new Date("2026-06-01T10:00:00Z"),
};

const CERTIFICATION: KbisCertification = {
  at: new Date("2026-02-04T09:00:00Z"),
  bySub: "auth0|staff_1",
  byName: "Marc Rousseau",
  byRole: "comptabilite",
};

function sampleCompany(kbis: KbisDeposit | null): Company {
  return Company.reconstitute({
    id: "c1",
    raisonSociale: "PQ Marais",
    enseigne: "Le Pain Quotidien",
    formeJuridique: "SAS",
    siret: "81245678900021",
    vatNumber: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status: "active",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
    kbis,
  });
}

describe("le dépôt de KBIS", () => {
  it("arrive NON certifié", () => {
    expect(KbisDeposit.deposit(FILE).certified).toBe(false);
    expect(KbisDeposit.deposit(FILE).certification).toBeNull();
  });

  it("porte la parole de l'agent une fois certifié", () => {
    const certified = KbisDeposit.deposit(FILE).certify(CERTIFICATION);

    expect(certified.certified).toBe(true);
    expect(certified.certification).toEqual(CERTIFICATION);
    expect(certified.file).toEqual(FILE);
  });

  /** Une parole ne se corrige pas en place : chaque geste rend un nouveau dépôt. */
  it("ne mute pas le dépôt d'origine en certifiant", () => {
    const deposited = KbisDeposit.deposit(FILE);

    deposited.certify(CERTIFICATION);

    expect(deposited.certified).toBe(false);
  });

  it("retire la parole sans toucher au fichier", () => {
    const revoked = KbisDeposit.deposit(FILE).certify(CERTIFICATION).revoke();

    expect(revoked.certified).toBe(false);
    expect(revoked.file).toEqual(FILE);
  });
});

describe("le KBIS d'une société", () => {
  /**
   * **La règle, et la raison qu'elle existe** : laisser le nom d'un agent sur un
   * extrait qu'il n'a jamais vu ferait mentir la trace — or c'est précisément ce
   * qu'une trace est censée empêcher.
   */
  it("décertifie en remplaçant l'extrait", () => {
    const company = sampleCompany(KbisDeposit.deposit(FILE).certify(CERTIFICATION));

    company.depositKbis(REPLACEMENT);

    expect(company.kbis?.file.fileName).toBe("kbis-2026.pdf");
    expect(company.kbis?.certified).toBe(false);
  });

  /**
   * Certifier « à blanc » produirait un compte dont personne n'a jamais vu les
   * papiers. La garde vivait dans le handler, qui lisait la présence du fichier
   * par un port de LECTURE avant d'écrire en aveugle.
   */
  it("refuse de certifier une société sans extrait", () => {
    const company = sampleCompany(null);

    expect(() => company.certifyKbis(CERTIFICATION)).toThrow(KbisNotFoundError);
  });

  it("certifie quand l'extrait est là", () => {
    const company = sampleCompany(KbisDeposit.deposit(FILE));

    company.certifyKbis(CERTIFICATION);

    expect(company.kbis?.certification).toEqual(CERTIFICATION);
  });

  it("décertifie sur demande, sans perdre le fichier", () => {
    const company = sampleCompany(KbisDeposit.deposit(FILE).certify(CERTIFICATION));

    company.revokeKbisCertification();

    expect(company.kbis?.certified).toBe(false);
    expect(company.kbis?.file.fileName).toBe("kbis.pdf");
  });

  /** Idempotent : décertifier ce qui ne l'est pas ne fait rien, et ne se refuse pas. */
  it.each([
    ["déjà décertifiée", KbisDeposit.deposit(FILE)],
    ["sans extrait du tout", null],
  ])("laisse faire un retrait sur une société %s", (_cas, kbis) => {
    const company = sampleCompany(kbis);

    expect(() => company.revokeKbisCertification()).not.toThrow();
    expect(company.kbis?.certified ?? false).toBe(false);
  });

  /** L'état sérialisé porte le dépôt : c'est ce que l'adaptateur écrit. */
  it("emporte le dépôt dans l'état à persister", () => {
    const company = sampleCompany(KbisDeposit.deposit(FILE).certify(CERTIFICATION));

    expect(company.toPersistence().kbis?.certification).toEqual(CERTIFICATION);
  });
});
