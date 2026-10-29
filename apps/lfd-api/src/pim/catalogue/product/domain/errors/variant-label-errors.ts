import { DomainError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * Un libellé interne vide : l'onglet de la déclinaison n'aurait plus de nom
 * (`plan-identite-de-declinaison.md`, I5). Un 400 — la demande est mal formée,
 * pas refusée par l'état de la fiche.
 */
export class BlankVariantInternalLabelError extends DomainError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.blank_internal_label",
      `Le libellé interne de la déclinaison « ${variantSku} » ne peut pas être vide : ` +
        "saisissez le nom sous lequel l'équipe la reconnaît dans le référentiel.",
    );
  }
}
