import {
  projectContacts,
  type AccessRow,
  type ContactRow,
  type HolderRow,
} from "../company-contacts.projection.js";

const HOLDER: HolderRow = {
  contactPrenom: "Camille",
  contactNom: "Rousseau",
  contactFonction: "Gérante",
  contactEmail: "camille@halles.fr",
  contactTelephone: "01 42 71 08 44",
};

/** Une société ouverte sur sa seule enseigne : colonnes de contact vides. */
const NO_HOLDER: HolderRow = {
  contactPrenom: "",
  contactNom: "",
  contactFonction: "",
  contactEmail: "",
  contactTelephone: "",
};

const RECEPTION: ContactRow = {
  id: "ct_1",
  prenom: "Rachid",
  nom: "Pereira",
  fonction: "réception",
  email: "r@p.fr",
  telephone: "06 12 34 56 78",
  role: "admin",
};

/** Le jour de référence de tous ces tests — le temps est une donnée, pas un hasard. */
const NOW = new Date("2026-08-12T10:00:00.000Z");

/** Rattachée hier : l'invitation est fraîche. */
const YESTERDAY = new Date("2026-08-11T10:00:00.000Z");

/** Rattachée il y a 20 jours : au-delà de la validité d'une invitation. */
const LONG_AGO = new Date("2026-07-23T10:00:00.000Z");

const ACTIVE: AccessRow = {
  email: "camille@halles.fr",
  status: "active",
  emailVerified: true,
  invitedAt: YESTERDAY,
  acceptedAt: YESTERDAY,
};

describe("projectContacts", () => {
  it("met le détenteur en tête, avec l'état de son accès", () => {
    const rows = projectContacts(HOLDER, [RECEPTION], [ACTIVE], NOW);

    expect(rows.map((row) => row.email)).toEqual(["camille@halles.fr", "r@p.fr"]);
    expect(rows[0]?.contactId).toBeNull();
    expect(rows[0]?.role).toBe("owner");
    expect(rows[0]?.access).toBe("active");
  });

  it("N'INVENTE PAS de détenteur quand il n'y en a pas", () => {
    // La ligne fantôme rendait une carte « Fonction — / E-mail (vide) », avec le
    // bouton « ouvrir l'accès » offert dessus — et ce bouton partait vraiment.
    const rows = projectContacts(NO_HOLDER, [RECEPTION], [], NOW);

    expect(rows.map((row) => row.email)).toEqual(["r@p.fr"]);
  });

  it("ne compte pas une adresse blanche comme une adresse", () => {
    // Des espaces ne font pas un détenteur : c'est la même absence, écrite
    // autrement — et la clé de rapprochement les traite déjà comme telle.
    const rows = projectContacts({ ...NO_HOLDER, contactEmail: "   " }, [], [], NOW);

    expect(rows).toEqual([]);
  });

  it("garde le carnet même sans détenteur rattaché", () => {
    // Le responsable réception existe indépendamment : un compte ouvert au
    // téléphone peut très bien avoir des interlocuteurs avant son détenteur.
    const rows = projectContacts(NO_HOLDER, [RECEPTION], [], NOW);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.access).toBe("none");
  });
});

describe("projectContacts — l'échéance d'une invitation", () => {
  const invited = (invitedAt: Date): AccessRow => ({
    email: "camille@halles.fr",
    status: "invited",
    emailVerified: false,
    invitedAt,
    acceptedAt: null,
  });

  it("laisse « invité » tant que le délai court", () => {
    const rows = projectContacts(HOLDER, [], [invited(YESTERDAY)], NOW);

    expect(rows[0]?.access).toBe("invited");
  });

  it("dit « expirée » au-delà — ce que l'entrée refuse aussi", () => {
    // Aucun balayage n'existe (vérifié le 2026-10-10) : l'entrée refuse une
    // invitation expirée, et l'écran dit la même chose qu'elle.
    const rows = projectContacts(HOLDER, [], [invited(LONG_AGO)], NOW);

    expect(rows[0]?.access).toBe("expired");
  });

  it("ne périme JAMAIS un accès déjà réclamé", () => {
    // Une personne entrée il y a deux ans reste active : l'échéance porte sur
    // l'invitation, pas sur l'ancienneté du client.
    const rows = projectContacts(
      HOLDER,
      [],
      [{ ...ACTIVE, invitedAt: LONG_AGO, acceptedAt: LONG_AGO }],
      NOW,
    );

    expect(rows[0]?.access).toBe("active");
  });

  it("dit « expirée » pour une personne active AILLEURS dont l'invitation ici a expiré", () => {
    // Le statut `active` est porté par la personne : entrée par une autre
    // société, elle n'a pas accepté celle-ci, et l'entrée ne l'ouvre pas
    // (§8.1 bis, objection B2). L'écran ne doit pas dire « active ».
    const rows = projectContacts(
      HOLDER,
      [],
      [{ ...ACTIVE, invitedAt: LONG_AGO, acceptedAt: null }],
      NOW,
    );

    expect(rows[0]?.access).toBe("expired");
  });

  it("dit « invitée » pour une personne active ailleurs tant que l'invitation ici vit", () => {
    const rows = projectContacts(
      HOLDER,
      [],
      [{ ...ACTIVE, invitedAt: YESTERDAY, acceptedAt: null }],
      NOW,
    );

    expect(rows[0]?.access).toBe("invited");
  });
});
