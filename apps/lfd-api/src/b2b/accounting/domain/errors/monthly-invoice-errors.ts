import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de **la facture du mois** (plan
 * `documentation/comptabilite/facturation/plan-emission-de-la-facture.md`, lot E4). Tous
 * 409 : l'état du calendrier ou de la fiche, que le bureau peut attendre ou
 * corriger — jamais une faute de saisie.
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

/** Avant le dernier jour du mois à 22h : le mois court encore. */
export class MonthNotYetInvoiceableError extends BusinessError {
  constructor(
    readonly month: string,
    readonly opensAt: Date,
  ) {
    super(
      "accounting.monthly_invoice.not_yet",
      `Les factures de ${month} s'émettent à partir du ${LONG_MOMENT.format(opensAt)} (heure de Paris), ` +
        "le dernier jour du mois : avant, le mois court encore. Revenir à cette heure-là.",
    );
  }
}

/** Le mois se clôt avant la mise en service : ses bons gardent l'arrêté du lot. */
export class InvoicingNotYetOpenError extends BusinessError {
  constructor(
    readonly month: string,
    readonly floorAt: Date,
  ) {
    super(
      "accounting.monthly_invoice.not_yet_open",
      `Aucune facture du mois pour ${month} : la facture du mois est en service à partir du ` +
        `${LONG_DAY.format(floorAt)}. Les bons passés avant gardent l'arrêté de facturation du lot.`,
    );
  }
}

/** La mise en service a disparu : on ne devine pas quels bons facturer. */
export class InvoicingFloorMissingError extends BusinessError {
  constructor() {
    super(
      "accounting.monthly_invoice.floor_missing",
      "La date de mise en service de la facture du mois (invoicing_floor) est absente de la base : " +
        "aucune facture n'est émise sans elle. Prévenir la technique.",
    );
  }
}

/** L'entité demandée n'est pas celle qui facture aujourd'hui. */
export class NotTheInvoicingEntityError extends BusinessError {
  constructor(readonly legalEntityId: string) {
    super(
      "accounting.monthly_invoice.not_the_issuer",
      `L'entité ${legalEntityId} n'est pas la seule entité émettrice en service : la facture du ` +
        "mois ne sait facturer que sous l'entité unique (comme le mandat). Archiver l'autre entité, " +
        "ou attendre la décision sur la numérotation à plusieurs entités (plan, § 8.3).",
    );
  }
}
