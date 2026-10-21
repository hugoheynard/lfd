import { BusinessError } from "../../platform/shared/errors/app-error.js";

/**
 * Les refus du semis des factures (`pnpm --filter lfd-api seed:invoices`).
 * Lus dans un terminal, sans le code sous les yeux : chacun nomme le cas et
 * le geste de sortie.
 */

/** Trop peu de clôtures hebdomadaires passées pour tous les statuts. */
export class InvoiceSeedTooEarlyError extends BusinessError {
  constructor(found: number, needed: number) {
    super(
      "dev.invoice_seed.too_early",
      `Seulement ${String(found)} clôture(s) hebdomadaire(s) passée(s) depuis la bascule du ` +
        `groupe des Cimes, il en faut ${String(needed)} : relancer le semis dans quelques jours.`,
    );
  }
}

/** Un préalable du semis n'est pas posé sur ce poste. */
export class InvoiceSeedPrerequisiteError extends BusinessError {
  constructor(missing: string, gesture: string) {
    super(
      "dev.invoice_seed.prerequisite",
      `${missing} : ${gesture}, puis relancer \`seed:invoices\`.`,
    );
  }
}

/** Un geste du scénario n'a pas produit ce que la suite attend. */
export class InvoiceSeedStepError extends BusinessError {
  constructor(step: string) {
    super("dev.invoice_seed.step", `Semis des factures interrompu : ${step}.`);
  }
}
