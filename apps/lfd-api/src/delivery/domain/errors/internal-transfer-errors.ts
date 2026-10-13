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
 * Un transfert parti ne reçoit plus rien : la marchandise a quitté le
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
