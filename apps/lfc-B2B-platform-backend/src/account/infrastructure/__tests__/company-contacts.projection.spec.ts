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
  role: "manager",
};

const ACTIVE: AccessRow = { email: "camille@halles.fr", status: "active", emailVerified: true };

describe("projectContacts", () => {
  it("met le détenteur en tête, avec l'état de son accès", () => {
    const rows = projectContacts(HOLDER, [RECEPTION], [ACTIVE]);

    expect(rows.map((row) => row.email)).toEqual(["camille@halles.fr", "r@p.fr"]);
    expect(rows[0]?.contactId).toBeNull();
    expect(rows[0]?.role).toBe("owner");
    expect(rows[0]?.access).toBe("active");
  });

  it("N'INVENTE PAS de détenteur quand il n'y en a pas", () => {
    // La ligne fantôme rendait une carte « Fonction — / E-mail (vide) », avec le
    // bouton « ouvrir l'accès » offert dessus — et ce bouton partait vraiment.
    const rows = projectContacts(NO_HOLDER, [RECEPTION], []);

    expect(rows.map((row) => row.email)).toEqual(["r@p.fr"]);
  });

  it("ne compte pas une adresse blanche comme une adresse", () => {
    // Des espaces ne font pas un détenteur : c'est la même absence, écrite
    // autrement — et la clé de rapprochement les traite déjà comme telle.
    const rows = projectContacts({ ...NO_HOLDER, contactEmail: "   " }, [], []);

    expect(rows).toEqual([]);
  });

  it("garde le carnet même sans détenteur rattaché", () => {
    // Le responsable réception existe indépendamment : un compte ouvert au
    // téléphone peut très bien avoir des interlocuteurs avant son détenteur.
    const rows = projectContacts(NO_HOLDER, [RECEPTION], []);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.access).toBe("none");
  });
});
