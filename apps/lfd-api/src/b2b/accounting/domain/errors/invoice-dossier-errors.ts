import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **simulateur de dossier de facturation** — à part des autres
 * fichiers d'erreurs comptables, pour que chacun garde une seule raison de
 * changer.
 *
 * Tous deux sont des données figées sur un bon qui empêchent le calcul : la
 * demande est juste, l'état du bon ne permet pas d'y répondre — d'où le 409.
 * Le plan (`simulateur-dossier-de-facturation.md`) exige l'arrêt
 * plutôt qu'une hypothèse : une facture calculée sur un taux inventé serait
 * fausse sans que personne le sache.
 */

/** Un bon facture une surtaxe sans en avoir figé le taux. */
export class InvoiceDossierLateFeeRateMissingError extends BusinessError {
  constructor(readonly orderReference: string) {
    super(
      "accounting.invoice_dossier.late_fee_rate_missing",
      `Le bon ${orderReference} porte une surtaxe sans taux de TVA : le dossier de ` +
        `facturation ne peut pas être calculé. Signalez ce bon à l'équipe technique, ` +
        `qui rétablira le taux de sa surtaxe.`,
    );
  }
}

/** Un bon porte un taux de TVA de ligne illisible. */
export class InvoiceDossierUnreadableVatRateError extends BusinessError {
  constructor(
    readonly orderReference: string,
    readonly raw: string,
  ) {
    super(
      "accounting.invoice_dossier.unreadable_vat_rate",
      `Le bon ${orderReference} porte un taux de TVA de ligne illisible (« ${raw} ») : ` +
        `le dossier de facturation ne peut pas être calculé. Signalez ce bon à l'équipe technique.`,
    );
  }
}
