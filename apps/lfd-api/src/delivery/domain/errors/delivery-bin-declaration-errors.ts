import { BusinessError, DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la **déclaration des bacs typés** et du **bac partagé** (lot 4
 * bis, v2-4, tranche B) — lus au colisage, un bac à la main, par qui n'a pas
 * le code sous les yeux : chacun nomme le cas réel et le geste de sortie.
 */

/** Zéro bac, ou plus de bacs entiers que la borne d'une déclaration. */
export class InvalidBinDeclarationCountError extends DomainError {
  constructor(max: number) {
    super(
      "delivery.bin_declaration_count_invalid",
      `On déclare de 1 à ${String(max)} bacs entiers à la fois, plus une moitié au besoin : pour davantage, déclarez-en encore.`,
    );
  }
}

/** Le nombre de sacs posés dans un bac est négatif, non entier ou trop grand. */
export class InvalidInnerBagsError extends DomainError {
  constructor(max: number) {
    super(
      "delivery.bin_inner_bags_invalid",
      `Le nombre de sacs posés dans un bac est un entier de 0 à ${String(max)}.`,
    );
  }
}

/** Un type archivé n'est plus déclarable (v2-7). */
export class BinTypeArchivedForDeclarationError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.bin_type_archived_for_declaration",
      `Le type « ${name} » est archivé : il ne se déclare plus. Choisissez un type en service, ou réactivez-le dans Livraison → Bacs.`,
    );
  }
}

/** Une moitié sur un type sans cloison. */
export class BinTypeNotDivisibleError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.bin_type_not_divisible",
      `Le type « ${name} » n'accepte pas de cloison : il ne se déclare qu'en bacs entiers. Choisissez un type cloisonnable pour un demi-bac.`,
    );
  }
}

/** Partager avec un bac qui n'est pas une moitié, ou qui a été annulé. */
export class BinNotShareableError extends BusinessError {
  constructor(code: string, reason: "whole" | "voided" | "same_order") {
    const words = {
      whole: "est un bac entier : seul un bac cloisonné se partage, moitié par moitié",
      voided: "a été annulé : son étiquette ne vaut plus",
      same_order: "appartient déjà à cette commande : un bac ne se partage qu'avec une autre",
    } as const;
    super(
      "delivery.bin_not_shareable",
      `Le bac ${code} ${words[reason]}. Déclarez un bac à la commande plutôt que de partager celui-ci.`,
    );
  }
}

/** L'autre moitié du bac physique est déjà prise. */
export class BinHalfTakenError extends BusinessError {
  constructor(code: string) {
    super(
      "delivery.bin_half_taken",
      `L'autre moitié du bac ${code} est déjà déclarée : un bac cloisonné n'a que deux moitiés. Déclarez un autre bac.`,
    );
  }
}

/**
 * 🔴 **Partager hors de deux arrêts consécutifs** (v2-4) : le bac descend au
 * premier arrêt, remonte, et part au second — impossible si un autre arrêt
 * s'intercale, ou si les commandes ne sont pas dans la même tournée.
 */
export class SharedBinNotAdjacentError extends BusinessError {
  constructor(reference: string, partnerReference: string) {
    super(
      "delivery.shared_bin_not_adjacent",
      `Les commandes ${reference} et ${partnerReference} ne sont pas à deux arrêts consécutifs d'une même tournée au dépôt : elles ne partagent pas un bac. Mettez les arrêts côte à côte, ou déclarez un bac à chacune.`,
    );
  }
}

/** Deux partages simultanés de la même moitié : l'index l'a vu, rien n'est écrit. */
export class BinHalfRaceError extends BusinessError {
  constructor() {
    super(
      "delivery.bin_half_race",
      "L'autre moitié de ce bac vient d'être déclarée par un autre geste : rien n'a été créé. Rechargez les bacs de la commande.",
    );
  }
}

/**
 * 🔴 **Partir avec un bac partagé à refaire** (v2-4) : ses deux commandes ne
 * sont plus à des arrêts consécutifs — une recomposition les a séparées.
 */
export class SharedBinToRedoError extends BusinessError {
  /** Les codes des bacs à refaire — la route du livreur les redit à sa façon. */
  readonly codes: readonly string[];

  constructor(
    vehicleName: string,
    bins: readonly { readonly code: string; readonly reference: string }[],
  ) {
    const listed = bins.map((bin) => `${bin.code} (${bin.reference})`).join(", ");
    super(
      "delivery.shared_bin_to_redo",
      `« ${vehicleName} » ne peut pas partir — le bac partagé ${listed} n'est plus entre deux arrêts consécutifs : recolisez-le ou remettez les arrêts côte à côte.`,
    );
    this.codes = bins.map((bin) => bin.code);
  }
}

/**
 * Les bacs de cette commande se gèrent au **poste de colisage** (K2b,
 * `colisage/colisage.md` §5.1, B1) : ses contenants s'y
 * listent, et un bac déclaré, partagé ou annulé ici n'aurait pas de contenant
 * — ou laisserait un contenant pointer un bac mort. Le geste de sortie est le
 * même pour les trois routes : le refaire depuis la colonne Contenants.
 */
export class BinsManagedAtPackingError extends BusinessError {
  constructor() {
    super(
      "delivery.bins_managed_at_packing",
      `Les bacs de cette commande se gèrent au poste de colisage : déclarez, partagez ou annulez ce bac depuis la colonne Contenants du colisage, qui garde ce qu'il contient.`,
    );
  }
}
