import type { ActivationBlocker, ActivationCheck, ActivationGate } from "@lfd/contracts";

/** Le verdict vit dans les contrats — l'écran staff en rendait sa transcription. */
export type { ActivationBlocker, ActivationCheck, ActivationGate };

import type { ActivationPiece } from "@lfd/contracts";

import type { AdminCompanyDetailView } from "../ports/admin-company.reader.js";
import { isPublicFormeJuridique } from "../value-objects/public-nature.js";

/**
 * Les pièces demandées, et **lesquelles bloquent** — écrit ici, en dur.
 *
 * C'était un réglage staff (`b2b_platform_settings`, un mode par pièce). Il a
 * disparu : le parcours d'ouverture est arrêté, et un parcours arrêté ne se
 * reconfigure pas depuis un écran. Une case cochée par erreur un mardi soir
 * changeait la définition de « client » pour toute la plateforme, sans revue,
 * sans test, sans trace.
 *
 * - `vat` — bloquante. Sans numéro, une société assujettie n'est pas facturable.
 *   Les non-assujetties sont déjà réputées en règle (cf. `isDone`).
 * - `kbis` — **jamais bloquante**. C'est une convention interne : on veut voir
 *   l'extrait, on ne veut pas perdre la commande de demain matin pour un PDF.
 *   Le signal vit ailleurs (file de vérification), pas dans cette porte.
 * - `billing` — bloquante. Il faut savoir à qui adresser la facture.
 * - `chorus` — bloquante, et seulement pour une forme juridique publique, à
 *   la place de `kbis` : la fiche Chorus Pro relevée dit comment adresser la
 *   facture.
 *
 * La **livraison** n'y figure plus du tout : le service n'existe pas. Le jour
 * où il ouvre, elle revient ici — dans un commit, avec ses tests, pas dans une
 * case à cocher.
 */
type PieceRule = { readonly piece: ActivationPiece; readonly blocking: boolean };

const PIECES: readonly PieceRule[] = [
  { piece: "vat", blocking: true },
  { piece: "kbis", blocking: false },
  { piece: "billing", blocking: true },
];

/**
 * Les pièces d'un **organisme public** : pas d'extrait KBIS (un organisme
 * public n'est pas immatriculé au greffe), mais la fiche Chorus Pro, et elle
 * bloque — sans elle, on ne sait pas adresser sa facture.
 */
const PUBLIC_PIECES: readonly PieceRule[] = [
  { piece: "vat", blocking: true },
  { piece: "chorus", blocking: true },
  { piece: "billing", blocking: true },
];

/** Les pièces que le principal porte pour un site qui suit sa facturation. */
const CARRIED_PIECES: ReadonlySet<ActivationPiece> = new Set(["vat", "kbis", "billing"]);

const PIECE_BLOCKERS: Readonly<Partial<Record<ActivationPiece, ActivationBlocker>>> = {
  vat: "vat",
  billing: "facturation",
  chorus: "chorus",
};

export function activationGate(company: AdminCompanyDetailView): ActivationGate {
  // Un sous-compte qui suit `billing` d'un principal ACTIF est facturé au nom
  // du principal : ni identité légale ni détenteur propres (sous-comptes
  // §2.1 bis). `Company.activate` tient la même règle.
  const carried = isLegallyCarried(company);
  const pieces = (isPublicFormeJuridique(company.formeJuridique) ? PUBLIC_PIECES : PIECES).filter(
    // Ses TVA, extrait KBIS et adresse de facturation sont ceux du payeur : ils
    // ne sont pas à fournir par le site, et la liste ne les lui réclame pas.
    (piece) => !carried || !CARRIED_PIECES.has(piece.piece),
  );
  const checklist = pieces.map((piece) => ({
    piece: piece.piece,
    blocking: piece.blocking,
    done: isDone(company, piece.piece),
  }));

  const blocking: ActivationBlocker[] = [];
  // L'identité légale n'est pas une pièce parmi d'autres : sans SIRET, il n'y a
  // rien à facturer.
  if (!hasLegalIdentity(company) && !carried) {
    blocking.push("identite_legale");
  }
  // Un compte s'OUVRE sans détenteur — le commercial n'a parfois que l'enseigne,
  // et l'adresse arrive le lendemain. Il ne devient pas CLIENT sans : activer
  // sans personne à qui ouvrir l'espace fabriquerait un compte actif où nul ne
  // peut se connecter, et le client découvrirait au premier besoin qu'on lui a
  // ouvert une porte sans lui donner la clé.
  if (!hasHolder(company) && !carried) {
    blocking.push("detenteur");
  }
  // Un livreur qui cherche une porte doit pouvoir appeler quelqu'un — n'importe
  // lequel des interlocuteurs, pas forcément le détenteur.
  if (!isReachable(company)) {
    blocking.push("telephone");
  }
  for (const check of checklist) {
    const blocker = PIECE_BLOCKERS[check.piece];
    // TVA et facturation sont celles du PAYEUR quand le sous-compte suit
    // `billing` : c'est le principal, actif, qui les a fournies à sa propre
    // activation (sous-comptes §2.1 bis, précisé le 2026-10-05).
    if (check.blocking && !check.done && blocker !== undefined && !carried) {
      blocking.push(blocker);
    }
  }

  // Seul un compte `pending` s'active : l'agrégat refuse le reste, et un bouton
  // allumé sur un compte suspendu promettrait ce que le serveur refuse.
  return {
    canActivate: company.status === "pending" && blocking.length === 0,
    blocking,
    checklist,
  };
}

function isDone(company: AdminCompanyDetailView, piece: ActivationPiece): boolean {
  switch (piece) {
    case "vat":
      // Non assujetti ⇒ la TVA n'est jamais « manquante » (rien à exiger).
      return hasRequiredVat(company);
    case "kbis":
      // **Certifié**, et non « déposé ». Se contenter de la présence reviendrait
      // à cocher sur la foi d'un PDF que personne n'a ouvert — n'importe quel
      // fichier vaudrait alors garantie. Ne bloque rien, mais dit vrai.
      return company.kbis?.certified === true;
    case "billing":
      return company.addresses.billing !== null;
    case "chorus":
      return company.chorusRouting !== null;
    case "delivery":
      // Le service n'existe pas : la pièce n'est jamais demandée (elle n'est pas
      // dans `PIECES`). Le cas reste écrit parce que le type l'exige, et il dira
      // la vérité le jour où la livraison ouvrira.
      return company.addresses.deliveries.length > 0;
  }
}

/** Suit-il `billing` d'un principal actif, à l'instant de la lecture de la fiche ? */
function isLegallyCarried(company: AdminCompanyDetailView): boolean {
  const { parent, follows } = company.hierarchy;
  return (
    parent !== null &&
    parent.status === "active" &&
    follows.some((follow) => follow.aspect === "billing")
  );
}

/**
 * La TVA est-elle en règle ? Non assujetti : toujours. Exportée pour le suivi
 * commercial, qui compte la même pièce.
 */
export function hasRequiredVat(
  company: Pick<AdminCompanyDetailView, "vatNumberRequired" | "vatNumber">,
): boolean {
  return !company.vatNumberRequired || company.vatNumber.trim() !== "";
}

/**
 * Raison sociale + forme juridique + SIRET : de quoi facturer. Exportée pour
 * le suivi commercial, qui compte la même pièce.
 */
export function hasLegalIdentity(
  company: Pick<AdminCompanyDetailView, "raisonSociale" | "formeJuridique" | "siret">,
): boolean {
  return (
    company.raisonSociale.trim() !== "" &&
    company.formeJuridique.trim() !== "" &&
    company.siret.trim() !== ""
  );
}

/**
 * Un détenteur est-il rattaché ? L'**adresse** en décide : c'est elle qui ouvre
 * l'espace, et c'est le seul champ que le rattachement exige.
 */
function hasHolder(company: AdminCompanyDetailView): boolean {
  return company.primaryContact.email.trim() !== "";
}

/**
 * Au moins un numéro joignable, sur le détenteur ou sur un interlocuteur.
 * Exportée pour le suivi commercial, qui compte la même pièce.
 */
export function isReachable(company: {
  readonly primaryContact: { readonly phone: string };
  readonly contacts: readonly { readonly phone: string }[];
}): boolean {
  return (
    company.primaryContact.phone.trim() !== "" ||
    company.contacts.some((contact) => contact.phone.trim() !== "")
  );
}
