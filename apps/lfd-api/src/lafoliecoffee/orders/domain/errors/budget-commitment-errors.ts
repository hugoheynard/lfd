import { BUDGET_COMMITMENT_ERRORS } from "@lfd/contracts";

import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Un engagement budgétaire mal formé** (400) : le numéro ou le code service
 * n'a pas la forme qu'un bon de commande public lui donne. Le message nomme
 * le champ et la règle.
 */
export class InvalidBudgetCommitmentError extends DomainError {
  constructor(field: "numéro d'engagement" | "code service", rule: string) {
    super(BUDGET_COMMITMENT_ERRORS.invalid, `Le ${field} n'est pas valable : ${rule}.`);
  }
}

/** **Le payeur exige un numéro d'engagement**, et la commande n'en porte pas (409). */
export class BudgetCommitmentNumberRequiredError extends BusinessError {
  constructor() {
    super(
      BUDGET_COMMITMENT_ERRORS.numberRequired,
      "Cette structure exige un numéro d'engagement : il figure sur son bon de commande. " +
        "Saisissez-le dans le champ « N° d'engagement », puis validez de nouveau.",
    );
  }
}

/** **Le payeur exige un code service**, aucun n'est saisi ni proposé par sa fiche (409). */
export class BudgetCommitmentServiceCodeRequiredError extends BusinessError {
  constructor() {
    super(
      BUDGET_COMMITMENT_ERRORS.serviceCodeRequired,
      "Cette structure exige un code service Chorus Pro, et sa fiche n'en propose aucun : " +
        "saisissez celui de son bon de commande dans le champ « Code service ».",
    );
  }
}

/**
 * **Le numéro d'engagement de ce payeur arrive sur le devis de période**
 * (400) : un numéro saisi à la commande serait un second numéro, que le
 * devis contredirait.
 */
export class BudgetCommitmentOnQuoteError extends DomainError {
  constructor() {
    super(
      BUDGET_COMMITMENT_ERRORS.onQuote,
      "Le numéro d'engagement de ce client arrive sur le devis de période : videz le champ " +
        "« N° d'engagement », puis validez de nouveau.",
    );
  }
}

/**
 * **Un payeur privé n'a pas d'engagement budgétaire** (409) : un numéro
 * envoyé pour lui se perdrait en silence — il est refusé.
 */
export class PrivatePayerBudgetCommitmentError extends BusinessError {
  constructor() {
    super(
      BUDGET_COMMITMENT_ERRORS.privatePayer,
      "Ce client n'est pas un organisme public : sa commande ne porte pas de numéro " +
        "d'engagement ni de code service. Videz ces deux champs, puis validez de nouveau.",
    );
  }
}

/**
 * **L'engagement d'une commande facturée ne change plus** (409) : la facture
 * l'a figé. Le message ne promet pas « un avoir puis une nouvelle facture » :
 * une commande sortie d'une facture par un avoir ne se refacture pas
 * (`invoice_order_invoiced_once`, vérifié le 2026-11-18). Il renvoie donc à
 * la comptabilité.
 */
export class BudgetCommitmentAlreadyInvoicedError extends BusinessError {
  constructor(orderNumber: string, invoiceNumber: string | null) {
    super(
      BUDGET_COMMITMENT_ERRORS.alreadyInvoiced,
      invoiceNumber === null
        ? `La commande ${orderNumber} est déjà engagée en comptabilité : son numéro ` +
            "d'engagement ne change plus. Voyez avec la comptabilité."
        : `La commande ${orderNumber} est déjà facturée (${invoiceNumber}) : son numéro ` +
            "d'engagement ne change plus. Voyez avec la comptabilité.",
    );
  }
}
