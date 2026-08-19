import type { ActivationPiece } from "@lfd/contracts";

import type { AdminCompanyDetailView } from "../ports/admin-company.reader.js";

/**
 * Ce qui **empêche** d'activer un compte. Des codes, pas des phrases : le
 * serveur tranche, l'écran formule. Mélanger les deux ferait de chaque
 * reformulation un déploiement backend, et d'une traduction une migration.
 */
export type ActivationBlocker =
  "identite_legale" | "detenteur" | "telephone" | "tva" | "facturation";

/** Une pièce du dossier, telle que la fiche la montre. */
export interface ActivationCheck {
  readonly piece: ActivationPiece;
  /**
   * Cette pièce **empêche-t-elle** l'activation ? Faux = on la réclame quand
   * même, elle ne gate rien (le KBIS, aujourd'hui).
   */
  readonly blocking: boolean;
  readonly done: boolean;
}

/**
 * Le **verdict** d'activation d'un compte : la seule autorité.
 *
 * Il existait en deux exemplaires — la porte serveur, et sa transcription dans
 * l'écran staff — et les deux ont dérivé : la porte lisait « KBIS vérifié » là
 * où l'écran lisait « KBIS déposé », donc « Activer le compte » s'allumait sur
 * un dossier que le serveur refusait par un 409. Une règle écrite deux fois est
 * une règle qui finira par se contredire ; celle-ci n'est plus écrite qu'ici, et
 * l'écran ne fait que la rendre.
 *
 * Pur : fiche → verdict. Ni Nest, ni Prisma, ni horloge, **ni configuration**.
 */
export interface ActivationGate {
  /** Le serveur accepterait-il d'activer maintenant ? */
  readonly canActivate: boolean;
  /** Ce qui s'y oppose, dans l'ordre où on le corrigerait. */
  readonly blocking: readonly ActivationBlocker[];
  /** L'état pièce par pièce — de quoi dresser la liste, sans la redéduire. */
  readonly checklist: readonly ActivationCheck[];
}

/**
 * Les pièces demandées, et **lesquelles bloquent** — écrit ici, en dur.
 *
 * C'était un réglage staff (`b2b_platform_settings`, un mode par pièce). Il a
 * disparu : le parcours d'ouverture est arrêté, et un parcours arrêté ne se
 * reconfigure pas depuis un écran. Une case cochée par erreur un mardi soir
 * changeait la définition de « client » pour toute la plateforme, sans revue,
 * sans test, sans trace.
 *
 * - `tva` — bloquante. Sans numéro, une société assujettie n'est pas facturable.
 *   Les non-assujetties sont déjà réputées en règle (cf. `isDone`).
 * - `kbis` — **jamais bloquante**. C'est une convention interne : on veut voir
 *   l'extrait, on ne veut pas perdre la commande de demain matin pour un PDF.
 *   Le signal vit ailleurs (file de vérification), pas dans cette porte.
 * - `billing` — bloquante. Il faut savoir à qui adresser la facture.
 *
 * La **livraison** n'y figure plus du tout : le service n'existe pas. Le jour
 * où il ouvre, elle revient ici — dans un commit, avec ses tests, pas dans une
 * case à cocher.
 */
const PIECES: readonly { readonly piece: ActivationPiece; readonly blocking: boolean }[] = [
  { piece: "tva", blocking: true },
  { piece: "kbis", blocking: false },
  { piece: "billing", blocking: true },
];

const PIECE_BLOCKERS: Readonly<Partial<Record<ActivationPiece, ActivationBlocker>>> = {
  tva: "tva",
  billing: "facturation",
};

export function activationGate(company: AdminCompanyDetailView): ActivationGate {
  const checklist = PIECES.map((piece) => ({
    piece: piece.piece,
    blocking: piece.blocking,
    done: isDone(company, piece.piece),
  }));

  const blocking: ActivationBlocker[] = [];
  // L'identité légale n'est pas une pièce parmi d'autres : sans SIRET, il n'y a
  // rien à facturer.
  if (!hasLegalIdentity(company)) {
    blocking.push("identite_legale");
  }
  // Un compte s'OUVRE sans détenteur — le commercial n'a parfois que l'enseigne,
  // et l'adresse arrive le lendemain. Il ne devient pas CLIENT sans : activer
  // sans personne à qui ouvrir l'espace fabriquerait un compte actif où nul ne
  // peut se connecter, et le client découvrirait au premier besoin qu'on lui a
  // ouvert une porte sans lui donner la clé.
  if (!hasHolder(company)) {
    blocking.push("detenteur");
  }
  // Un livreur qui cherche une porte doit pouvoir appeler quelqu'un — n'importe
  // lequel des interlocuteurs, pas forcément le détenteur.
  if (!isReachable(company)) {
    blocking.push("telephone");
  }
  for (const check of checklist) {
    const blocker = PIECE_BLOCKERS[check.piece];
    if (check.blocking && !check.done && blocker !== undefined) {
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
    case "tva":
      // Non assujetti ⇒ la TVA n'est jamais « manquante » (rien à exiger).
      return !company.vatNumberRequired || company.tvaIntracom.trim() !== "";
    case "kbis":
      // **Certifié**, et non « déposé ». Se contenter de la présence reviendrait
      // à cocher sur la foi d'un PDF que personne n'a ouvert — n'importe quel
      // fichier vaudrait alors garantie. Ne bloque rien, mais dit vrai.
      return company.kbis?.certified === true;
    case "billing":
      return company.addresses.billing !== null;
    case "delivery":
      // Le service n'existe pas : la pièce n'est jamais demandée (elle n'est pas
      // dans `PIECES`). Le cas reste écrit parce que le type l'exige, et il dira
      // la vérité le jour où la livraison ouvrira.
      return company.addresses.deliveries.length > 0;
  }
}

/** Raison sociale + forme juridique + SIRET : de quoi facturer. */
function hasLegalIdentity(company: AdminCompanyDetailView): boolean {
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

/** Au moins un numéro joignable, sur le détenteur ou sur un interlocuteur. */
function isReachable(company: AdminCompanyDetailView): boolean {
  return (
    company.primaryContact.phone.trim() !== "" ||
    company.contacts.some((contact) => contact.phone.trim() !== "")
  );
}
