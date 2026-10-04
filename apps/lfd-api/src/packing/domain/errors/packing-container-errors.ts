import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * **Les refus de la colonne Contenants** (K2b,
 * `documentation/colisage/plan-les-bacs-au-colisage.md` §5–§5.1). Lus au
 * poste, les doigts farinés : chacun nomme le cas réel et le geste de sortie.
 */

/**
 * La commande COMPTE ses contenants (ancien écran) : elle est née avant la
 * colonne Contenants, ou ses bacs ont été déclarés par la livraison. Aucun bac
 * existant n'est repris (§5, bascule).
 */
export class ContainersCountedError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.containers.counted",
      `La commande ${reference} compte ses contenants avec « + » et « − » : elle est née avant la colonne Contenants, et elle se finit sur l'ancien écran. Les bacs de livraison s'y déclarent une fois la commande prête.`,
    );
  }
}

/** La commande LISTE ses contenants : le compte ne se règle plus à la main (§5.1). */
export class ContainersListedError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.containers.listed",
      `La commande ${reference} liste ses contenants : le nombre de contenants se lit dans la colonne Contenants. Créez ou annulez un contenant plutôt que de le compter.`,
    );
  }
}

/** Sur une commande `listed`, une ligne entre au bac en la glissant dans un contenant. */
export class LineGoesIntoContainerError extends BusinessError {
  constructor(reference: string) {
    super(
      "packing.containers.line_by_container",
      `Sur la commande ${reference}, une ligne se met au bac en la glissant dans un contenant de la colonne Contenants : la cocher ne dirait pas dans lequel.`,
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
