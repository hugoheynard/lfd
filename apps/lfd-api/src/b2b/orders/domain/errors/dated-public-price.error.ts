import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Un prix public relu à une date passée** — refusé.
 *
 * L'historique canonique (`catalog_price_history`) ne range que le tarif
 * d'entrée PRO (vérifié le 2026-10-30 : une seule colonne `price_millicents`,
 * écrite depuis le tarif reçu du référentiel). Relire un panier public à une
 * date le rescellerait donc au prix pro — un chiffre plausible et faux. Aucun
 * chemin de production ne pose aujourd'hui cette question (vérifié le même
 * jour : `OrderLinePricing.resolve`/`explain` ne reçoivent jamais d'instant) ;
 * le refus garde le jour où l'un d'eux la poserait.
 */
export class DatedPublicPriceUnsupportedError extends DomainError {
  constructor(readonly at: Date) {
    super(
      "orders.pricing.dated_public_unsupported",
      `Le prix public au ${at.toISOString().slice(0, 10)} ne peut pas être reconstitué : ` +
        "l'historique des tarifs ne garde que le prix professionnel. Relisez le prix public du jour, " +
        "ou le prix figé sur la commande.",
    );
  }
}
