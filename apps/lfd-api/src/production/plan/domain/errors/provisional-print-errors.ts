import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * La journée est arrêtée : son papier est le dossier figé. Un provisoire tiré
 * des commandes en direct dirait autre chose que ce qui part au fournil.
 */
export class ProvisionalPrintOfArrestedDayError extends BusinessError {
  constructor(serviceDay: string) {
    super(
      "production.provisional_print.day_arrested",
      `Le plan du ${serviceDay} est arrêté : il n'y a plus d'impression provisoire. Imprimez le dossier figé (ou les parties choisies) depuis la même fenêtre.`,
    );
  }
}

/** Un numéro d'impression n'est pas un entier ≥ 1. */
export class InvalidProvisionalRunError extends DomainError {
  constructor(run: number) {
    super(
      "production.provisional_print.invalid_run",
      `Le numéro d'impression provisoire ${String(run)} n'est pas valable : il commence à 1 et compte par un.`,
    );
  }
}

/** « Depuis #N » nomme une impression que la journée n'a pas. */
export class ProvisionalRunUnknownError extends ResourceNotFoundError {
  constructor(serviceDay: string, run: number) {
    super(
      "production.provisional_print.run_unknown",
      `La journée du ${serviceDay} n'a pas d'impression provisoire #${String(run)}. Rouvrez la fenêtre d'impression pour relire les impressions du jour.`,
    );
  }
}

/** « Nouvelles ou modifiées depuis #N » ne trouve rien : il n'y a rien à imprimer. */
export class NothingChangedSinceRunError extends BusinessError {
  constructor(serviceDay: string, run: number) {
    super(
      "production.provisional_print.nothing_changed",
      `Aucune commande du ${serviceDay} n'est nouvelle ni modifiée depuis l'impression provisoire #${String(run)} : rien à réimprimer. Choisissez « Toutes » pour tout réimprimer.`,
    );
  }
}

/**
 * Deux impressions de la même journée ont tiré le même numéro au même instant
 * — le rejeu a reculé plusieurs fois sans trouver de numéro libre.
 */
export class ProvisionalRunContendedError extends BusinessError {
  constructor(serviceDay: string) {
    super(
      "production.provisional_print.run_contended",
      `Plusieurs impressions provisoires du ${serviceDay} sont tirées en même temps : aucun numéro n'a pu être réservé. Réessayez dans un instant.`,
    );
  }
}

/** L'impression demandée n'existe pas pour cette journée (ou a été balayée). */
export class ProvisionalPrintNotFoundError extends ResourceNotFoundError {
  constructor(serviceDay: string, id: string) {
    super(
      "production.provisional_print.not_found",
      `L'impression provisoire ${id} n'existe pas pour la journée du ${serviceDay} : elle a pu être balayée une fois la journée passée. Tirez une nouvelle impression.`,
    );
  }
}

/**
 * La ligne existe, son PDF non : le rangement a échoué après que le numéro a
 * été tiré. Le PDF ne se refait pas des commandes en direct, qui ont pu bouger.
 */
export class ProvisionalPrintFileMissingError extends ResourceNotFoundError {
  constructor(serviceDay: string, run: number) {
    super(
      "production.provisional_print.file_missing",
      `Le PDF de l'impression provisoire #${String(run)} du ${serviceDay} n'a pas été rangé (stockage indisponible au tirage). Tirez une nouvelle impression.`,
    );
  }
}
