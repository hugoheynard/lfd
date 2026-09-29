import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **chargement** (plan de tournée, lot 4) — lus au dépôt, un sac
 * à la main, par qui n'a pas le code sous les yeux : chacun nomme le cas réel
 * et le geste de sortie (`CLAUDE.md` §0).
 */

/** Aucun sac sous cet identifiant, ou sous ce code. */
export class DeliveryBagNotFoundError extends ResourceNotFoundError {
  constructor(bagIdOrCode: string) {
    super(
      "delivery.bag_not_found",
      `Aucun sac sous « ${bagIdOrCode} » : vérifiez le code imprimé sur l'étiquette, ou réimprimez-la depuis la commande.`,
    );
  }
}

/** Le code tapé n'a pas la forme d'un code de sac. */
export class InvalidBagCodeError extends DomainError {
  constructor(raw: string) {
    super(
      "delivery.bag_code_invalid",
      `« ${raw} » n'est pas un code de sac : il tient en six caractères, chiffres et lettres, sous le QR de l'étiquette.`,
    );
  }
}

/** Déclarer zéro sac, ou plus que la borne d'une déclaration. */
export class InvalidBagCountError extends DomainError {
  constructor(max: number) {
    super(
      "delivery.bag_count_invalid",
      `On déclare de 1 à ${String(max)} sacs à la fois : pour davantage, déclarez-en encore.`,
    );
  }
}

/** Pourquoi une commande ne reçoit pas de sac. */
export type UndeclarableReason = "unknown" | "cancelled" | "not_delivery";

const UNDECLARABLE_WORDS: Readonly<Record<UndeclarableReason, string>> = {
  unknown: "n'existe pas",
  cancelled: "est annulée",
  not_delivery: "n'est pas en livraison (retrait au comptoir)",
};

/** La commande ne peut pas recevoir de sac de livraison. */
export class BagsNotDeclarableError extends BusinessError {
  constructor(reference: string, reason: UndeclarableReason) {
    super(
      "delivery.bags_not_declarable",
      `La commande ${reference} ${UNDECLARABLE_WORDS[reason]} : elle ne reçoit pas de sac de livraison. Rechargez la commande.`,
    );
  }
}

/** Où part un sac — de quoi le nommer dans un refus. */
export interface BagDestination {
  readonly vehicleName: string;
  readonly serviceDay: string;
  readonly passage: number;
}

/**
 * 🔴 **Le bon sac, dans la mauvaise camionnette** (L4-C2) — l'erreur probable
 * à trois véhicules. Le refus NOMME le véhicule et le jour où le sac doit
 * partir ; rien n'est chargé.
 */
export class BagInOtherRoundError extends BusinessError {
  constructor(code: string, destination: BagDestination) {
    super(
      "delivery.bag_in_other_round",
      `Ce sac (${code}) part dans « ${destination.vehicleName} », le ${destination.serviceDay} (passage ${String(destination.passage)}) : ne le chargez pas ici, posez-le avec ce véhicule.`,
    );
  }
}

/** La commande du sac n'est dans aucune tournée vivante. */
export class BagOrderNotComposedError extends BusinessError {
  constructor(code: string, reference: string) {
    super(
      "delivery.bag_order_not_composed",
      `Le sac ${code} appartient à la commande ${reference}, qui n'est dans aucune tournée : répartissez-la d'abord (Livraison → Tournées), puis chargez-le.`,
    );
  }
}

/** Charger un sac annulé. */
export class BagVoidedError extends BusinessError {
  constructor(code: string) {
    super(
      "delivery.bag_voided",
      `Le sac ${code} a été annulé : son étiquette ne vaut plus. Retirez-la, et utilisez une étiquette valide de la commande.`,
    );
  }
}

/** Annuler un sac chargé (L4-C19). */
export class BagLoadedError extends BusinessError {
  constructor(code: string) {
    super(
      "delivery.bag_loaded",
      `Le sac ${code} est chargé dans le véhicule : déchargez-le d'abord, puis annulez son étiquette.`,
    );
  }
}

/**
 * **La tournée est partie** (I6, L4-C4) : plus rien ne s'y compose ni ne s'y
 * charge, et ses sacs ne s'annulent plus.
 */
export class DeliveryRoundDepartedError extends BusinessError {
  constructor(vehicleName: string, serviceDay: string) {
    super(
      "delivery.round_departed",
      `La tournée « ${vehicleName} » du ${serviceDay} est partie : sa composition et son chargement sont figés. Rechargez l'écran.`,
    );
  }
}

/**
 * **Partir avec un arrêt non chargé** (Q14, L4-C17) : refusé. Le refus liste
 * les références ; le geste de sortie est de charger, ou de retirer l'arrêt.
 */
export class DeliveryRoundNotReadyError extends BusinessError {
  constructor(vehicleName: string, unlabelled: readonly string[], partial: readonly string[]) {
    const causes = [
      unlabelled.length > 0 ? `sans sac déclaré : ${unlabelled.join(", ")}` : null,
      partial.length > 0 ? `des sacs restent à charger : ${partial.join(", ")}` : null,
    ].filter((cause): cause is string => cause !== null);
    super(
      "delivery.round_not_ready",
      `« ${vehicleName} » ne peut pas partir — ${causes.join(" ; ")}. Déclarez et chargez leurs sacs, ou retirez ces arrêts de la tournée.`,
    );
  }
}

/** Déplacer un arrêt qui a un sac chargé (L4-C5) : le sac serait dans la mauvaise camionnette. */
export class LoadedStopMoveError extends BusinessError {
  constructor(vehicleName: string) {
    super(
      "delivery.loaded_stop_move",
      `Un sac de cet arrêt est déjà chargé dans « ${vehicleName} » : déchargez-le d'abord, puis déplacez l'arrêt.`,
    );
  }
}

/** Le chargement a bougé pendant le geste (un arrêt déplacé ou retiré entre-temps). */
export class DeliveryLoadingStaleError extends BusinessError {
  constructor() {
    super(
      "delivery.loading_stale",
      "La tournée de ce sac vient de changer : rechargez l'écran de chargement, puis refaites votre geste.",
    );
  }
}

/** Une commande annulée depuis sa composition ne part pas. */
export class DepartureOrderCancelledError extends BusinessError {
  constructor(vehicleName: string, references: readonly string[]) {
    super(
      "delivery.departure_order_cancelled",
      `« ${vehicleName} » ne peut pas partir : ${references.length > 1 ? "les commandes" : "la commande"} ${references.join(", ")} ${references.length > 1 ? "ont été annulées" : "a été annulée"}. Retirez l'arrêt de la tournée, puis partez.`,
    );
  }
}

/** Une tournée sans arrêt ne part pas. */
export class EmptyDeliveryRoundError extends BusinessError {
  constructor(vehicleName: string) {
    super(
      "delivery.round_empty",
      `« ${vehicleName} » n'a aucun arrêt : tournée vide — ajoutez des arrêts, ou laissez-la au dépôt.`,
    );
  }
}

/**
 * Le commerce ne sert plus la commande d'un arrêt : on ne fige pas une feuille
 * vide, on n'invente ni adresse ni contact.
 */
export class DepartureSheetMissingError extends BusinessError {
  constructor(vehicleName: string, orderId: string) {
    super(
      "delivery.departure_sheet_missing",
      `« ${vehicleName} » ne peut pas partir : une de ses commandes est introuvable au commerce (identifiant ${orderId} — son numéro n'est plus connu), sa feuille de livraison ne peut pas être figée. Retirez cet arrêt de la tournée.`,
    );
  }
}

/** Deux déclarations simultanées ont tiré le même code : rien n'est écrit. */
export class BagCodeCollisionError extends BusinessError {
  constructor() {
    super(
      "delivery.bag_code_collision",
      "Une autre déclaration de sacs vient de prendre le même code : aucun sac n'a été créé, déclarez à nouveau.",
    );
  }
}

/** Aucun code libre après plusieurs tirages : un défaut, pas un geste à refaire. */
export class BagCodeExhaustedError extends TechnicalError {
  constructor(attempts: number) {
    super(
      "delivery.bag_code_exhausted",
      `Aucun code de sac libre après ${String(attempts)} tirages : signalez-le à l'équipe technique.`,
    );
  }
}
