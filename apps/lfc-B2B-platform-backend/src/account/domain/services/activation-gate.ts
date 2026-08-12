import type { ActivationPiece, PieceMode, PlatformSettings } from "@lfd/contracts";

import type { AdminCompanyDetailView } from "../ports/admin-company.reader.js";

/**
 * Ce qui **empêche** d'activer un compte. Des codes, pas des phrases : le
 * serveur tranche, l'écran formule. Mélanger les deux ferait de chaque
 * reformulation un déploiement backend, et d'une traduction une migration.
 */
export type ActivationBlocker =
  | "identite_legale"
  | "detenteur"
  | "telephone"
  | "tva"
  | "kbis_absent"
  | "kbis_non_verifie"
  | "facturation"
  | "livraison";

/** Une pièce du dossier, telle que la fiche la montre. */
export interface ActivationCheck {
  readonly piece: ActivationPiece;
  /**
   * Le mode configuré : `required` bloque, `optional` se demande sans bloquer,
   * `hidden` ne se demande pas du tout. L'écran a besoin des trois — filtrer ici
   * lui ferait redécouvrir la nuance, et c'est ce genre de re-déduction qu'on
   * cherche justement à supprimer.
   */
  readonly mode: PieceMode;
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
 * Pur : (fiche, réglages) → verdict. Ni Nest, ni Prisma, ni horloge.
 */
export interface ActivationGate {
  /** Le serveur accepterait-il d'activer maintenant ? */
  readonly canActivate: boolean;
  /** Ce qui s'y oppose, dans l'ordre où on le corrigerait. */
  readonly blocking: readonly ActivationBlocker[];
  /** L'état pièce par pièce — de quoi dresser la liste, sans la redéduire. */
  readonly checklist: readonly ActivationCheck[];
}

/** Ordre de présentation : celui dans lequel on les réclame au client. */
const PIECES: readonly ActivationPiece[] = ["tva", "kbis", "billing", "delivery"];

const PIECE_BLOCKERS: Readonly<Record<ActivationPiece, ActivationBlocker>> = {
  tva: "tva",
  kbis: "kbis_absent",
  billing: "facturation",
  delivery: "livraison",
};

export function activationGate(
  company: AdminCompanyDetailView,
  settings: PlatformSettings,
): ActivationGate {
  const checklist = PIECES.map((piece) => ({
    piece,
    mode: settings[piece],
    done: isDone(company, piece),
  }));

  const blocking: ActivationBlocker[] = [];
  // L'identité légale n'est pas une pièce configurable : sans SIRET, il n'y a
  // rien à facturer. Elle ne se désactive donc pas en réglages.
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
    if (check.mode === "required" && !check.done) {
      blocking.push(blockerFor(company, check.piece));
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

/**
 * Le KBIS a deux façons de manquer, et elles n'appellent pas le même geste :
 * déposer un extrait, ou en ouvrir un qui dort déjà là. C'est le cas le plus
 * fréquent et le moins devinable — d'où deux codes plutôt qu'un.
 */
function blockerFor(company: AdminCompanyDetailView, piece: ActivationPiece): ActivationBlocker {
  if (piece === "kbis" && company.kbis !== null) {
    return "kbis_non_verifie";
  }
  return PIECE_BLOCKERS[piece];
}

function isDone(company: AdminCompanyDetailView, piece: ActivationPiece): boolean {
  switch (piece) {
    case "tva":
      // Non assujetti ⇒ la TVA n'est jamais « manquante » (rien à exiger).
      return !company.vatNumberRequired || company.tvaIntracom.trim() !== "";
    case "kbis":
      // **Certifié**, et non « déposé ». Se contenter de la présence reviendrait
      // à activer sur la foi d'un PDF que personne n'a ouvert — n'importe quel
      // fichier vaudrait alors garantie.
      return company.kbis?.certified === true;
    case "billing":
      return company.addresses.billing !== null;
    case "delivery":
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
