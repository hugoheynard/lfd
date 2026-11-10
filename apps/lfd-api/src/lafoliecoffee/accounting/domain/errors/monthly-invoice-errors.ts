import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de **la facture de la période** (plans
 * `documentation/comptabilite/facturation/facture-emise.md` et
 * `plan-rythme-de-facturation.md`, R3). 409 : l'état du calendrier ou de la
 * fiche, que le bureau peut attendre ou corriger ; 400 seulement pour une
 * clôture demandée qui n'en est pas une.
 */

const LONG_MOMENT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

const LONG_DAY = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

/** Avant la veille de la clôture à 23h55 : la période court encore. */
export class PeriodNotYetInvoiceableError extends BusinessError {
  constructor(
    readonly periodLabel: string,
    readonly opensAt: Date,
  ) {
    super(
      "accounting.monthly_invoice.not_yet",
      `Les factures de la période ${periodLabel} s'émettent à partir du ${LONG_MOMENT.format(opensAt)} ` +
        "(heure de Paris), la veille de la clôture : avant, la période court encore. Revenir à cette heure-là.",
    );
  }
}

/** La période se clôt avant la mise en service : ses bons gardent l'arrêté du lot. */
export class InvoicingNotYetOpenError extends BusinessError {
  constructor(
    readonly periodLabel: string,
    readonly floorAt: Date,
  ) {
    super(
      "accounting.monthly_invoice.not_yet_open",
      `Aucune facture pour la période ${periodLabel} : la facture par période est en service à partir du ` +
        `${LONG_DAY.format(floorAt)}. Les bons passés avant gardent l'arrêté de facturation du lot.`,
    );
  }
}

/** L'instant demandé ne ferme la période d'aucun client de l'entité. */
export class NotABillingClosureError extends DomainError {
  constructor(readonly closesAt: Date) {
    super(
      "accounting.monthly_invoice.not_a_closure",
      `Le ${LONG_MOMENT.format(closesAt)} (heure de Paris) ne clôt la période d'aucun client de ` +
        "l'entité (ni le mensuel, ni un mode choisi) : choisir la clôture proposée par l'écran " +
        "« Prélèvement du mois ».",
    );
  }
}

/** La clôture demandée n'est pas un instant lisible. */
export class InvalidPeriodClosureError extends DomainError {
  constructor(readonly raw: string) {
    super(
      "accounting.monthly_invoice.invalid_closure",
      `« ${raw} » n'est pas un instant de clôture lisible : attendu une date ISO 8601 ` +
        "(celle que l'écran « Prélèvement du mois » envoie).",
    );
  }
}

/** La mise en service a disparu : on ne devine pas quels bons facturer. */
export class InvoicingFloorMissingError extends BusinessError {
  constructor() {
    super(
      "accounting.monthly_invoice.floor_missing",
      "La date de mise en service de la facture par période (invoicing_floor) est absente de la base : " +
        "aucune facture n'est émise sans elle. Prévenir la technique.",
    );
  }
}

/** L'entité demandée n'est pas celle qui facture aujourd'hui. */
export class NotTheInvoicingEntityError extends BusinessError {
  constructor(readonly legalEntityId: string) {
    super(
      "accounting.monthly_invoice.not_the_issuer",
      `L'entité ${legalEntityId} n'est pas la seule entité émettrice en service : la facture par ` +
        "période ne sait facturer que sous l'entité unique (comme le mandat). Archiver l'autre entité, " +
        "ou attendre la décision sur la numérotation à plusieurs entités (plan, § 8.3).",
    );
  }
}
