import {
  DossierRecipientNotFoundError,
  DuplicateDossierRecipientError,
  InvalidRecipientEmailError,
  RecipientNameRequiredError,
  SuspendedStaffRecipientError,
  UnknownStaffRecipientError,
} from "../../errors/dossier-recipient-errors.js";
import { DossierRecipient, type DossierStaffCard } from "../dossier-recipient.js";
import { DossierRecipients } from "../dossier-recipients.js";

const NOW = new Date();

function by(id: string) {
  return { id, addedBy: "s-admin", addedAt: NOW };
}

function card(overrides: Partial<DossierStaffCard> = {}): DossierStaffCard {
  return {
    staffUserId: "s-paul",
    firstName: "Paul",
    lastName: "Martin",
    email: "Paul@Fournil.fr",
    jobTitle: "Chef",
    active: true,
    ...overrides,
  };
}

function external(id: string, email: string): DossierRecipient {
  return DossierRecipient.ofExternal({ email, firstName: "Jeanne", lastName: "Roux" }, by(id));
}

describe("DossierRecipient — qui peut recevoir le dossier", () => {
  it("inscrit une fiche active par sa référence, et la nomme", () => {
    const recipient = DossierRecipient.ofStaff("s-paul", card(), by("r-1"));
    expect(recipient.target).toMatchObject({ kind: "staff", staffUserId: "s-paul" });
    expect(recipient.label).toBe("Paul Martin");
    expect(recipient.email).toBe("Paul@Fournil.fr");
  });

  it("refuse une fiche inconnue de l'annuaire", () => {
    expect(() => DossierRecipient.ofStaff("s-x", null, by("r-1"))).toThrow(
      UnknownStaffRecipientError,
    );
  });

  it("refuse une fiche suspendue, en la nommant", () => {
    expect(() => DossierRecipient.ofStaff("s-paul", card({ active: false }), by("r-1"))).toThrow(
      /Paul Martin est suspendu/u,
    );
    expect(() => DossierRecipient.ofStaff("s-paul", card({ active: false }), by("r-1"))).toThrow(
      SuspendedStaffRecipientError,
    );
  });

  it("inscrit un externe, adresse normalisée, poste vide lu comme absent", () => {
    const recipient = DossierRecipient.ofExternal(
      { email: " Jeanne@X.fr", firstName: " Jeanne ", lastName: "Roux", jobTitle: "  " },
      by("r-1"),
    );
    expect(recipient.email).toBe("jeanne@x.fr");
    expect(recipient.target).toMatchObject({
      kind: "external",
      firstName: "Jeanne",
      lastName: "Roux",
      jobTitle: null,
    });
  });

  it("garde le poste d'un externe quand il est dit", () => {
    const recipient = DossierRecipient.ofExternal(
      { email: "j@x.fr", firstName: "J", lastName: "R", jobTitle: "Comptable" },
      by("r-1"),
    );
    expect(recipient.target).toMatchObject({ jobTitle: "Comptable" });
  });

  it.each([
    ["sans prénom", { firstName: " ", lastName: "Roux" }],
    ["sans nom", { firstName: "Jeanne", lastName: "" }],
  ])("refuse un externe %s", (_case, names) => {
    expect(() => DossierRecipient.ofExternal({ email: "j@x.fr", ...names }, by("r-1"))).toThrow(
      RecipientNameRequiredError,
    );
  });

  it("refuse un externe à l'adresse mal formée", () => {
    expect(() => external("r-1", "jeanne.x.fr")).toThrow(InvalidRecipientEmailError);
  });

  it("nomme une fiche disparue par son id, sans adresse", () => {
    const recipient = DossierRecipient.restore(
      { kind: "staff", staffUserId: "s-gone", card: null },
      by("r-1"),
    );
    expect(recipient.label).toBe("s-gone");
    expect(recipient.email).toBeNull();
  });
});

describe("DossierRecipients — une adresse ne figure qu'une fois", () => {
  it("retient les ajouts depuis le chargement", () => {
    const list = DossierRecipients.restore([]);
    const recipient = external("r-1", "j@x.fr");
    list.add(recipient);
    expect(list.recipients).toEqual([recipient]);
    expect(list.added).toEqual([recipient]);
  });

  it("refuse deux externes à la même adresse, quelle que soit la casse", () => {
    const list = DossierRecipients.restore([external("r-1", "j@x.fr")]);
    expect(() => list.add(external("r-2", "J@X.FR"))).toThrow(DuplicateDossierRecipientError);
    expect(list.added).toEqual([]);
  });

  it("refuse la même fiche deux fois", () => {
    const list = DossierRecipients.restore([DossierRecipient.ofStaff("s-paul", card(), by("r-1"))]);
    expect(() => list.add(DossierRecipient.ofStaff("s-paul", card(), by("r-2")))).toThrow(
      DuplicateDossierRecipientError,
    );
  });

  it("refuse un externe qui porte l'adresse d'une fiche déjà inscrite, en nommant la fiche", () => {
    const list = DossierRecipients.restore([DossierRecipient.ofStaff("s-paul", card(), by("r-1"))]);
    expect(() => list.add(external("r-2", "paul@fournil.fr"))).toThrow(/Paul Martin/u);
  });

  it("refuse une fiche dont l'adresse est déjà inscrite en externe", () => {
    const list = DossierRecipients.restore([external("r-1", "paul@fournil.fr")]);
    expect(() => list.add(DossierRecipient.ofStaff("s-paul", card(), by("r-2")))).toThrow(
      DuplicateDossierRecipientError,
    );
  });

  it("retire un destinataire et retient le retrait, avec son auteur", () => {
    const recipient = external("r-1", "j@x.fr");
    const list = DossierRecipients.restore([recipient]);
    expect(list.remove("r-1", "s-admin", NOW)).toBe(recipient);
    expect(list.recipients).toEqual([]);
    expect(list.removed).toEqual([{ recipient, removedBy: "s-admin", removedAt: NOW }]);
  });

  it("une adresse retirée peut revenir", () => {
    const list = DossierRecipients.restore([external("r-1", "j@x.fr")]);
    list.remove("r-1", "s-admin", NOW);
    expect(() => list.add(external("r-2", "j@x.fr"))).not.toThrow();
  });

  it("refuse de retirer un id absent", () => {
    expect(() => DossierRecipients.restore([]).remove("r-x", "s-admin", NOW)).toThrow(
      DossierRecipientNotFoundError,
    );
  });
});
