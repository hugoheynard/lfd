import { Company } from "../company.js";
import {
  ArchivedCompanyCannotBeAttachedError,
  ArchivedPrincipalCannotReceiveSitesError,
  CompanyAlreadyArchivedError,
  CompanyHasOrdersError,
  CompanyNotArchivedError,
  InvalidArchiveReasonError,
  PrincipalWithSitesCannotBeArchivedError,
  SiteCannotBeArchivedError,
} from "../../errors/archive-errors.js";
import { CompanyArchive } from "../../value-objects/company-archive.js";
import { HierarchyPlace } from "../../value-objects/hierarchy-place.js";

// L'instant n'est relu que tel quel, jamais comparé à l'horloge.
const AT = new Date("2026-11-22T09:00:00.000Z");

function company(over: {
  readonly id?: string;
  readonly hasSubAccounts?: boolean;
  readonly parentCompanyId?: string | null;
  readonly archive?: CompanyArchive | null;
}): Company {
  return Company.reconstitute({
    id: over.id ?? "c1",
    raisonSociale: "Ferme du Col SAS",
    enseigne: "Ferme du Col",
    formeJuridique: "SAS",
    siret: "81245678900021",
    vatNumber: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status: "pending",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
    archive: over.archive ?? null,
    hierarchy: HierarchyPlace.reconstitute({
      parentCompanyId: over.parentCompanyId ?? null,
      hasSubAccounts: over.hasSubAccounts ?? false,
      groupWithoutDelivery: false,
    }),
  });
}

const GESTURE = {
  at: AT,
  byStaffId: "staff_1",
  byName: "Camille Durand",
  reason: "  Doublon de La Ferme du Col  ",
  hasOrders: false,
};

describe("Company.archive", () => {
  it("supprime un compte sans commande : instant, auteur, motif nettoyé, statut intact", () => {
    const subject = company({});

    subject.archive(GESTURE);

    const state = subject.toPersistence();
    expect(state.archive).toMatchObject({
      archivedAt: AT,
      byStaffId: "staff_1",
      byName: "Camille Durand",
      reason: "Doublon de La Ferme du Col",
    });
    expect(state.status).toBe("pending");
    expect(state.statusChange).toBeNull();
  });

  it("garde l'auteur sans nom quand l'annuaire ne le connaît pas", () => {
    const subject = company({});

    subject.archive({ ...GESTURE, byName: "  " });

    expect(subject.archiveRecord?.byName).toBeNull();
  });

  it("refuse un compte qui a des commandes, et dit de le résilier", () => {
    const subject = company({});

    expect(() => subject.archive({ ...GESTURE, hasOrders: true })).toThrow(
      new CompanyHasOrdersError("c1").message,
    );
    expect(subject.archiveRecord).toBeNull();
  });

  it("refuse un site rattaché à un principal", () => {
    const subject = company({ parentCompanyId: "principal" });

    expect(() => subject.archive(GESTURE)).toThrow(SiteCannotBeArchivedError);
  });

  it("refuse un principal qui a des sites, en disant de les détacher", () => {
    const subject = company({ hasSubAccounts: true });

    expect(() => subject.archive(GESTURE)).toThrow(
      new PrincipalWithSitesCannotBeArchivedError("c1").message,
    );
    expect(subject.archiveRecord).toBeNull();
  });

  it("refuse un compte déjà supprimé : le premier motif reste", () => {
    const first = CompanyArchive.reconstitute(AT, "staff_0", null, "Créé par erreur");
    const subject = company({ archive: first });

    expect(() => subject.archive(GESTURE)).toThrow(CompanyAlreadyArchivedError);
    expect(subject.archiveRecord?.reason).toBe("Créé par erreur");
  });

  it.each(["", "   "])("refuse un motif vide (%j)", (reason) => {
    expect(() => company({}).archive({ ...GESTURE, reason })).toThrow(InvalidArchiveReasonError);
  });

  it("refuse un motif trop long", () => {
    expect(() => company({}).archive({ ...GESTURE, reason: "x".repeat(501) })).toThrow(
      InvalidArchiveReasonError,
    );
  });
});

describe("Company.attachTo — un compte supprimé hors de toute hiérarchie", () => {
  const archived = CompanyArchive.reconstitute(AT, "staff_0", null, "Doublon");

  it("refuse de rattacher un compte supprimé comme site", () => {
    const site = company({ archive: archived });

    expect(() => site.attachTo(company({ id: "principal" }))).toThrow(
      ArchivedCompanyCannotBeAttachedError,
    );
    expect(site.parentCompanyId).toBeNull();
  });

  it("refuse de rattacher un site à une fiche principale supprimée", () => {
    const site = company({});

    expect(() => site.attachTo(company({ id: "principal", archive: archived }))).toThrow(
      ArchivedPrincipalCannotReceiveSitesError,
    );
    expect(site.parentCompanyId).toBeNull();
  });

  it("rattache un compte rendu", () => {
    const site = company({});

    site.attachTo(company({ id: "principal" }));

    expect(site.parentCompanyId).toBe("principal");
  });
});

describe("Company.unarchive", () => {
  it("rend un compte supprimé", () => {
    const subject = company({
      archive: CompanyArchive.reconstitute(AT, "staff_0", null, "Doublon"),
    });

    subject.unarchive();

    expect(subject.toPersistence().archive).toBeNull();
  });

  it("refuse un compte qui n'est pas supprimé", () => {
    expect(() => company({}).unarchive()).toThrow(CompanyNotArchivedError);
  });
});
