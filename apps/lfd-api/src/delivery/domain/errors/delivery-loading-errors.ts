import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **chargement** (plan de tournée, lot 4) — lus au dépôt, un bac
 * à la main, par qui n'a pas le code sous les yeux : chacun nomme le cas réel
 * et le geste de sortie (`CLAUDE.md` §0).
 */

/** Aucun bac sous cet identifiant, ou sous ce code. */
export class DeliveryBinNotFoundError extends ResourceNotFoundError {
  constructor(binIdOrCode: string) {
    super(
      "delivery.bin_not_found",
      `Aucun bac sous « ${binIdOrCode} » : vérifiez le code imprimé sur l'étiquette, ou réimprimez-la depuis la commande.`,
    );
  }
}

/** Le code tapé n'a pas la forme d'un code de bac. */
export class InvalidBinCodeError extends DomainError {
  constructor(raw: string) {
    super(
      "delivery.bin_code_invalid",
      `« ${raw} » n'est pas un code de bac : il tient en six caractères, chiffres et lettres, sous le QR de l'étiquette.`,
    );
  }
}

/** Pourquoi une commande ne reçoit pas de bac. */
export type UndeclarableReason = "unknown" | "cancelled" | "not_delivery";

const UNDECLARABLE_WORDS: Readonly<Record<UndeclarableReason, string>> = {
  unknown: "n'existe pas",
  cancelled: "est annulée",
  not_delivery: "n'est pas en livraison (retrait au comptoir)",
};

/** La commande ne peut pas recevoir de bac de livraison. */
export class BinsNotDeclarableError extends BusinessError {
  constructor(reference: string, reason: UndeclarableReason) {
    super(
      "delivery.bins_not_declarable",
      `La commande ${reference} ${UNDECLARABLE_WORDS[reason]} : elle ne reçoit pas de bac de livraison. Rechargez la commande.`,
    );
  }
}

/** Où part un bac — de quoi le nommer dans un refus. */
export interface BinDestination {
  readonly vehicleName: string;
  readonly serviceDay: string;
  readonly passage: number;
}

/**
 * 🔴 **Le bon bac, dans la mauvaise camionnette** (L4-C2) — l'erreur probable
 * à trois véhicules. Le refus NOMME le véhicule et le jour où le bac doit
 * partir ; rien n'est chargé.
 */
export class BinInOtherRoundError extends BusinessError {
  constructor(code: string, destination: BinDestination) {
    super(
      "delivery.bin_in_other_round",
      `Ce bac (${code}) part dans « ${destination.vehicleName} », le ${destination.serviceDay} (passage ${String(destination.passage)}) : ne le chargez pas ici, posez-le avec ce véhicule.`,
    );
  }
}

/** La commande du bac n'est dans aucune tournée vivante. */
export class BinOrderNotComposedError extends BusinessError {
  constructor(code: string, reference: string) {
    super(
      "delivery.bin_order_not_composed",
      `Le bac ${code} appartient à la commande ${reference}, qui n'est dans aucune tournée : répartissez-la d'abord (Livraison → Tournées), puis chargez-le.`,
    );
  }
}

/** Charger un bac annulé. */
export class BinVoidedError extends BusinessError {
  constructor(code: string) {
    super(
      "delivery.bin_voided",
      `Le bac ${code} a été annulé : son étiquette ne vaut plus. Retirez-la, et utilisez une étiquette valide de la commande.`,
    );
  }
}

/** Annuler un bac chargé (L4-C19). */
export class BinLoadedError extends BusinessError {
  constructor(code: string) {
    super(
      "delivery.bin_loaded",
      `Le bac ${code} est chargé dans le véhicule : déchargez-le d'abord, puis annulez son étiquette.`,
    );
  }
}

/**
 * **La tournée est partie** (I6, L4-C4) : plus rien ne s'y compose ni ne s'y
 * charge, et ses bacs ne s'annulent plus.
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
  /** Les références des arrêts non chargés — la route du livreur les redit à sa façon. */
  readonly references: readonly string[];

  constructor(vehicleName: string, unlabelled: readonly string[], partial: readonly string[]) {
    const causes = [
      unlabelled.length > 0 ? `sans bac déclaré : ${unlabelled.join(", ")}` : null,
      partial.length > 0 ? `des bacs restent à charger : ${partial.join(", ")}` : null,
    ].filter((cause): cause is string => cause !== null);
    super(
      "delivery.round_not_ready",
      `« ${vehicleName} » ne peut pas partir — ${causes.join(" ; ")}. Déclarez et chargez leurs bacs, ou retirez ces arrêts de la tournée.`,
    );
    this.references = [...unlabelled, ...partial];
  }
}

/** Déplacer un arrêt qui a un bac chargé (L4-C5) : le bac serait dans la mauvaise camionnette. */
export class LoadedStopMoveError extends BusinessError {
  constructor(vehicleName: string) {
    super(
      "delivery.loaded_stop_move",
      `Un bac de cet arrêt est déjà chargé dans « ${vehicleName} » : déchargez-le d'abord, puis déplacez l'arrêt.`,
    );
  }
}

/** Le chargement a bougé pendant le geste (un arrêt déplacé ou retiré entre-temps). */
export class DeliveryLoadingStaleError extends BusinessError {
  constructor() {
    super(
      "delivery.loading_stale",
      "La tournée de ce bac vient de changer : rechargez l'écran de chargement, puis refaites votre geste.",
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

/**
 * Une commande retenue au contrôle qualité ne part pas
 * (`a-la-porte.md`, § 10 ter, BQ) : une fois la tournée partie, on ne
 * contrôle plus — le produit n'est plus là (LB-Q1). Le refus nomme l'arrêt.
 */
export class DepartureOrderHeldError extends BusinessError {
  constructor(
    vehicleName: string,
    readonly stops: readonly string[],
  ) {
    super(
      "delivery.departure_order_held",
      `« ${vehicleName} » ne peut pas partir : ${stops.length > 1 ? "les arrêts" : "l'arrêt"} ${stops.join(", ")} ${stops.length > 1 ? "sont retenus" : "est retenu"} au contrôle qualité. Levez la retenue à la Supervision, ou retirez l'arrêt de la tournée, puis partez.`,
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
export class BinCodeCollisionError extends BusinessError {
  constructor() {
    super(
      "delivery.bin_code_collision",
      "Une autre déclaration de bacs vient de prendre le même code : aucun bac n'a été créé, déclarez à nouveau.",
    );
  }
}

/** Aucun code libre après plusieurs tirages : un défaut, pas un geste à refaire. */
export class BinCodeExhaustedError extends TechnicalError {
  constructor(attempts: number) {
    super(
      "delivery.bin_code_exhausted",
      `Aucun code de bac libre après ${String(attempts)} tirages : signalez-le à l'équipe technique.`,
    );
  }
}
