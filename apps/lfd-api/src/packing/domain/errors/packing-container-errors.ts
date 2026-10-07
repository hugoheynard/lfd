import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * **Les refus de la colonne Contenants** (K2b,
 * `documentation/colisage/colisage.md` §5–§5.1). Lus au
 * poste, les doigts farinés : chacun nomme le cas réel et le geste de sortie.
 */

/**
 * La commande a été colisée avec l'ANCIEN poste (`counted`) : elle est née
 * avant la colonne Contenants. Depuis K3c (`colisage.md` §17.6),
 * elle est en lecture seule — ni remplie, ni fermée, ni rouverte ici.
 */
export class ContainersCountedError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.containers.counted",
      `Commande ${reference} colisée avec l'ancien poste : elle ne se modifie plus ici. Si elle doit changer, voyez-le avec l'administrateur.`,
    );
  }
}

/** Aucun contenant sous cet identifiant, sur cette commande. */
export class PackingContainerNotFoundError extends ResourceNotFoundError {
  constructor(reference: string) {
    super(
      "packing.container.not_found",
      `Ce contenant n'existe pas sur la commande ${reference}. Rechargez le poste : il a peut-être été créé sur une autre commande.`,
    );
  }
}

/** Le contenant est annulé : il ne reçoit plus rien, et ne rend plus rien. */
export class PackingContainerVoidedError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.container.voided",
      `Ce contenant de la commande ${reference} a été annulé : il ne se remplit ni ne se vide plus. Glissez les produits dans un autre contenant, ou créez-en un.`,
    );
  }
}

/** Une quantité à répartir ou à retirer qui n'est pas un nombre de pièces. */
export class InvalidContainerQuantityError extends DomainError {
  constructor(value: number) {
    super(
      "packing.container.invalid_quantity",
      `Quantité invalide : ${String(value)}. Saisissez un nombre entier de pièces, au moins une.`,
    );
  }
}

/** On répartit plus que ce qui reste de la ligne. */
export class OverAllocationError extends BusinessError {
  constructor(productName: string, remaining: number) {
    super(
      "packing.container.over_allocation",
      `Il ne reste que ${String(remaining)} « ${productName} » à répartir sur cette commande. Saisissez au plus ${String(remaining)}, ou retirez-en d'un autre contenant d'abord.`,
    );
  }
}

/** On retire d'un contenant plus qu'il n'en porte. */
export class WithdrawBeyondContentError extends BusinessError {
  constructor(productName: string, held: number) {
    super(
      "packing.container.withdraw_beyond",
      `Ce contenant ne porte que ${String(held)} « ${productName} ». Retirez-en au plus ${String(held)}.`,
    );
  }
}

/** Déplacer des pièces d'un contenant vers lui-même. */
export class MoveToSameContainerError extends DomainError {
  constructor(reference: string) {
    super(
      "packing.container.move_to_same",
      `Commande ${reference} : le contenant de départ et celui d'arrivée sont le même. Choisissez un autre contenant d'arrivée.`,
    );
  }
}

/** Fermer une commande dont une quantité n'est pas répartie (§3). */
export class UnallocatedLinesError extends BusinessError {
  constructor(reference: string, productNames: readonly string[]) {
    super(
      "packing.containers.unallocated",
      `La commande ${reference} ne peut pas être déclarée prête : ${productNames.join(", ")} ne sont pas entièrement répartis dans ses contenants. Glissez le reste dans un contenant, puis fermez.`,
    );
  }
}

/** Un contenant `bin` dont le bac a été annulé par ailleurs (défense en profondeur, §5.1). */
export class ContainerBinGoneError extends BusinessError {
  constructor(code: string) {
    super(
      "packing.container.bin_gone",
      `Le bac ${code} a été annulé côté livraison : ce contenant ne reçoit plus rien. Annulez-le ici, et créez un autre bac.`,
    );
  }
}

/** Une livraison part en bacs ; les sacs sont ceux du retrait (Hugo, 2026-10-04). */
export class BagOnDeliveryError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.container.bag_on_delivery",
      `La commande ${reference} part en livraison : elle se colise en bacs, que la livraison étiquette et charge. Les sacs sont réservés aux retraits — créez un bac.`,
    );
  }
}

/**
 * « Proposer » ne s'applique qu'à une commande SANS contenant (suite de K2b,
 * plan §7) : la proposition dimensionne toute la commande, et la mêler à des
 * contenants déjà faits doublerait des bacs.
 */
export class ProposalOverContainersError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.proposal.containers_exist",
      `La commande ${reference} a déjà des contenants : « Proposer » ne s'applique qu'à une commande qui n'en a aucun. Glissez le reste à la main, ou annulez ses contenants puis proposez de nouveau.`,
    );
  }
}

/** La livraison ne propose aucun bac : la grille des contenances ne couvre pas la commande. */
export class EmptyProposalError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.proposal.empty",
      `Rien à proposer pour la commande ${reference} : aucun type de bac en service n'a de contenance pour ses produits. Créez les bacs à la main, ou demandez à un responsable de la livraison de remplir l'écran « Contenances ».`,
    );
  }
}
