import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **transfert interne** (plan du transfert interne, §3, lot T1) —
 * lus au dépôt par qui n'a pas le code sous les yeux : chacun nomme le cas
 * réel et le geste de sortie (`CLAUDE.md` §0).
 */

/** Aucun transfert sous cet identifiant. */
export class InternalTransferNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "delivery.internal_transfer_not_found",
      `Aucun transfert interne sous l'identifiant ${id} : rechargez les tournées du jour.`,
    );
  }
}

/**
 * Un transfert parti (ou déjà reçu, lot T2) ne reçoit plus rien : la marchandise a quitté le
 * fournil. L'appelant en ouvre un autre (Q-T3) — ce refus ne remonte à
 * l'écran que si une course l'a fait partir entre la lecture et l'écriture.
 */
export class InternalTransferDepartedError extends BusinessError {
  constructor(siteLabel: string, day: string) {
    super(
      "delivery.internal_transfer_departed",
      `Le transfert vers « ${siteLabel} » du ${day} est déjà parti : il ne reçoit plus rien. ` +
        "Rechargez : la commande rejoindra un autre transfert du même jour.",
    );
  }
}

/** Un transfert d'un autre jour ou d'un autre site ne reçoit pas cet élément. */
export class InternalTransferMismatchError extends DomainError {
  constructor(siteLabel: string, day: string) {
    super(
      "delivery.internal_transfer_mismatch",
      `Le transfert vers « ${siteLabel} » du ${day} ne porte que les éléments de ce site et de ce jour.`,
    );
  }
}

/** Un état relu en base qui ne tient plus ses invariants : on ne le corrige pas en silence. */
export class InternalTransferCorruptedError extends TechnicalError {
  constructor(id: string, reason: string) {
    super(
      "delivery.internal_transfer_corrupted",
      `Le transfert interne ${id} est incohérent en base (${reason}) : signalez-le, rien n'a été écrit.`,
    );
  }
}

/**
 * La version présentée n'est plus celle en base : un autre geste a écrit ce
 * transfert entre-temps (un départ, un ajout). Rien n'est écrit.
 */
export class InternalTransferStaleError extends BusinessError {
  constructor(siteLabel: string) {
    super(
      "delivery.internal_transfer_stale",
      `Le transfert vers « ${siteLabel} » a changé pendant votre geste : rechargez, puis refaites-le.`,
    );
  }
}

/**
 * Une réception, une seule (plan du transfert interne, §3, lot T2) : un autre
 * poste — le livreur ou un autre comptoir — l'a déjà réceptionné. Rien n'est
 * écrit ; la marchandise est au site.
 */
export class TransferAlreadyReceivedError extends BusinessError {
  constructor(siteLabel: string) {
    super(
      "delivery.internal_transfer_already_received",
      `Le transfert vers « ${siteLabel} » a déjà été réceptionné au site : rien à refaire. ` +
        "Rechargez pour voir qui l'a reçu et quand.",
    );
  }
}

/**
 * Une réception MANUELLE — le transfert n'est pas parti dans une tournée —
 * exige son motif, borné : sans lui, personne ne saurait plus comment la
 * marchandise est arrivée (sortie de S3, §6).
 */
export class TransferReceptionReasonRequiredError extends DomainError {
  constructor(siteLabel: string, max: number) {
    super(
      "delivery.internal_transfer_reception_reason_required",
      `Le transfert vers « ${siteLabel} » n'est parti dans aucune tournée : dites comment la ` +
        `marchandise est arrivée (« venue par le personnel », « pas de tournée ce jour »), en ` +
        `${String(max)} caractères au plus, puis réceptionnez.`,
    );
  }
}

/** « Remis au site » sur un arrêt qui n'est pas celui d'un transfert. */
export class StopNotATransferError extends DomainError {
  constructor() {
    super(
      "delivery.stop_not_a_transfer",
      "Cet arrêt livre une commande, pas un transfert : utilisez « Remis au client » ou « Déposé ».",
    );
  }
}

/** Aucune commande de ce numéro n'est portée par un transfert. */
export class OrderNotInTransferError extends ResourceNotFoundError {
  constructor(orderId: string) {
    super(
      "delivery.order_not_in_transfer",
      `La commande ${orderId} n'est portée par aucun transfert interne : elle se remet ` +
        "comme un retrait ordinaire. Rechargez la file du comptoir.",
    );
  }
}
