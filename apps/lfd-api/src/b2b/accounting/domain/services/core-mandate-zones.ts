import type { CreditorSnapshot } from "../creditor-snapshot.js";
import type { DebtorSnapshot } from "../debtor-snapshot.js";
import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";
import {
  caption,
  checkbox,
  CITY_STAR_X,
  CITY_X,
  dottedRow,
  FIELD_RIGHT,
  FIELD_X,
  label,
  leader,
  ROW,
  star,
  zone,
} from "./core-mandate-rows.js";
import {
  box,
  comb,
  creditorAddressOn,
  creditorNameOn,
  debtorStreetOf,
  type Doc,
  MM,
  put,
  splitAddress,
} from "./mandate-pdf-drawing.js";

/** Les zones 1 à 6 : tout ce que le débiteur remplit lui-même. */
export function debtorZones(doc: Doc, top: number, debtor: DebtorSnapshot | null): number {
  let y = top + 3 * MM;
  // `null` laisse les six zones vierges : c'est la fiche que le client remplit
  // à la main. Le dessin est le MÊME, seuls les remplissages changent — deux
  // dessins jumeaux divergeraient au premier ajustement de mise en page.
  label(doc, "Votre Nom", y);
  dottedRow(doc, y, "Nom / Prénoms du débiteur", 1, { value: debtor?.holder ?? "" });
  y += ROW;

  label(doc, "Votre adresse", y);
  dottedRow(doc, y, "Numéro et nom de la rue", 2, { value: debtorStreetOf(debtor) });
  y += ROW;

  star(doc, FIELD_X - 4 * MM, y);
  comb(doc, FIELD_X, y + 0.4 * MM, [5], debtor?.postalCode ?? "", "Le code postal");
  caption(doc, "Code Postal", FIELD_X, y + 5.2 * MM);
  dottedRow(doc, y, "Ville", 3, { value: debtor?.city ?? "", x: CITY_X });
  star(doc, CITY_STAR_X, y);
  y += ROW;

  dottedRow(doc, y, "Pays", 4, { value: debtor?.countryCode ?? "" });
  y += ROW;

  label(doc, "Les coordonnées\nde votre compte", y);
  star(doc, FIELD_X - 4 * MM, y);
  comb(
    doc,
    FIELD_X,
    y + 0.4 * MM,
    [4, 4, 4, 4, 4, 4, 3],
    debtor?.iban ?? "",
    "L'IBAN de ce compte",
  );
  caption(
    doc,
    "Numéro d'identification international du compte bancaire - IBAN (International Bank Account Number)",
    FIELD_X,
    y + 5.2 * MM,
  );
  zone(doc, 5, y);
  y += ROW;

  star(doc, FIELD_X - 4 * MM, y);
  comb(doc, FIELD_X, y + 0.4 * MM, [11], debtor?.bic ?? "", "Le BIC de cette banque");
  caption(
    doc,
    "Code international d'identification de votre banque - BIC (Bank Identifier Code)",
    FIELD_X,
    y + 5.2 * MM,
  );
  zone(doc, 6, y);
  return y + ROW;
}

/**
 * Les zones 7 à 11 : **notre côté**, recopié du snapshot.
 *
 * 🔴 L'IBAN du créancier n'apparaît nulle part ici. Les zones 5 et 6 lui
 * ressemblent, mais elles appellent l'IBAN et le BIC **du débiteur** : imprimer
 * le nôtre produirait un mandat nous autorisant à nous prélever nous-mêmes.
 */
export function creditorZones(doc: Doc, top: number, creditor: CreditorSnapshot): number {
  let y = top;

  label(doc, "Nom du créancier", y);
  dottedRow(doc, y, "Nom du créancier", 7, { value: creditorNameOn(creditor) });
  y += ROW;

  icsRow(doc, y, creditor.ics);
  y += ROW;

  const address = splitAddress(creditorAddressOn(creditor));
  dottedRow(doc, y, "Numéro et nom de la rue", 9, { value: address.street });
  y += ROW;

  star(doc, FIELD_X - 4 * MM, y);
  comb(doc, FIELD_X, y + 0.4 * MM, [5], address.postalCode);
  caption(doc, "Code Postal", FIELD_X, y + 5.2 * MM);
  dottedRow(doc, y, "Ville", 10, { value: address.city, x: CITY_X });
  star(doc, CITY_STAR_X, y);
  y += ROW;

  dottedRow(doc, y, "Pays", 11, { value: address.country });
  return y + ROW;
}

/**
 * L'anatomie d'un ICS : deux lettres de pays, deux chiffres de clé, trois
 * caractères de code activité, puis le numéro national.
 */
const ICS_HEAD_GROUPS = [2, 2, 3] as const;
const ICS_HEAD_LENGTH = 7;

/**
 * Le plus grand peigne qui tient dans la largeur du formulaire CORE : le nombre
 * de cases du peigne de l'IBAN débiteur, juste au-dessus, éprouvé sur la page.
 */
const ICS_COMB_MAX_BOXES = 27;

/**
 * La zone 8 — l'identifiant créancier, **en cases**, dimensionné sur la
 * LONGUEUR RÉELLE de l'ICS : `CreditorIdentifier` accepte de 8 à 35 caractères,
 * et un peigne fixe tronquerait en silence un ICS étranger. Au-delà de ce que la
 * largeur admet, on retombe sur la ligne pointillée — le numéro y tient entier.
 */
function icsRow(doc: Doc, y: number, ics: string): void {
  if (ics.length <= ICS_HEAD_LENGTH || ics.length > ICS_COMB_MAX_BOXES) {
    dottedRow(doc, y, "Identifiant du créancier", 8, { value: ics });
    return;
  }
  star(doc, FIELD_X - 4 * MM, y);
  comb(doc, FIELD_X, y + 0.4 * MM, [...ICS_HEAD_GROUPS, ics.length - ICS_HEAD_LENGTH], ics);
  caption(doc, "Identifiant du créancier", FIELD_X, y + 5.2 * MM);
  zone(doc, 8, y);
}

/**
 * Type de paiement, lieu et date, signature — tout ce que le signataire pose.
 *
 * ⚠️ La **zone 12 est cochée pour lui** : le régime est celui du MANDAT (figé à
 * la frappe), pas un choix du client. Une case non cochée sur un mandat signé
 * est une ambiguïté qui se découvre au premier prélèvement refusé.
 */
export function signatureZones(doc: Doc, top: number, paymentType: MandatePaymentType): number {
  let y = top;

  label(doc, "Type de paiement", y);
  star(doc, FIELD_X - 4 * MM, y);
  const afterRecurring = checkbox(
    doc,
    FIELD_X,
    y,
    "Paiement récurrent / répétitif",
    paymentType === "recurrent",
  );
  checkbox(doc, afterRecurring + 10 * MM, y, "Paiement ponctuel", paymentType === "one_off");
  zone(doc, 12, y);
  y += ROW;

  label(doc, "Signé à", y);
  star(doc, FIELD_X - 4 * MM, y);
  leader(doc, FIELD_X, y + 4 * MM, FIELD_X + 45 * MM);
  // Le renvoi (1) du modèle : cette ligne est bornée à 35 caractères par la
  // norme — un lieu plus long est tronqué par la banque.
  put(doc, "(1)", FIELD_X + 46 * MM, y + 2.6 * MM, { size: 6.2 });
  caption(doc, "Lieu", FIELD_X, y + 4.6 * MM);
  comb(doc, CITY_X, y + 0.4 * MM, [2, 2, 4]);
  caption(doc, "Date : JJ/MM/AAAA", CITY_X, y + 5.2 * MM);
  zone(doc, 13, y);
  y += ROW;

  label(doc, "Signature(s)", y + 2 * MM);
  put(doc, "Veuillez signer ici", FIELD_X, y + 2 * MM, { size: 9.5 });
  box(doc, FIELD_X + 30 * MM, y + 1 * MM, FIELD_RIGHT - FIELD_X - 30 * MM, 16 * MM);
  return y + 20 * MM;
}
