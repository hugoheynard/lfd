import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Un rythme de facturation mal formé : jour hors bornes, deux clôtures le même
 * jour, ou une forme relue qui ne correspond à aucun rythme connu.
 *
 * Le message est lu par la comptabilité au moment de régler l'entité : il dit
 * ce qui a été reçu et ce qui est attendu.
 */
export class InvalidBillingRhythmError extends DomainError {
  constructor(readonly reason: string) {
    super("accounting.billing_rhythm.invalid", `Rythme de facturation refusé : ${reason}`);
  }
}

const LONG_DAY = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

/**
 * **Un seul changement de rythme à la fois** (plan
 * `plan-rythme-de-facturation.md`, §12) : un changement est déjà programmé, et
 * la clôture où il prend effet n'a pas encore été tentée par la facture.
 *
 * 409 : l'état de l'entité, que la comptabilité peut attendre ou défaire. Le
 * message nomme le jour de prise d'effet (minuit à Paris ouvre ce jour-là) et
 * les deux gestes de sortie.
 */
export class BillingRhythmChangePendingError extends BusinessError {
  constructor(readonly effectiveAt: Date) {
    super(
      "accounting.billing_rhythm.change_pending",
      `Un changement de rythme est déjà programmé : il prend effet le ` +
        `${LONG_DAY.format(effectiveAt)} à 00h00 (heure de Paris). Un seul changement à la fois : ` +
        "le suivant sera possible après la facture de cette clôture. Pour renoncer au changement " +
        "programmé, revenir d'abord au rythme en vigueur.",
    );
  }
}
