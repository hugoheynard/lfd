import type { SepaScheme } from "../../domain/value-objects/sepa-scheme.js";

/**
 * Change le schéma des mandats que l'entité frappera — CORE ou interentreprises.
 *
 * Une commande à part, et pas un champ de `SetMandateDefaultsCommand` : ce
 * payload-là a des défauts, et un écran ancien qui l'enverrait sans le schéma
 * rebasculerait le régime de prélèvement sans que personne l'ait décidé (plan
 * `documentation/b2b/plan-mandat-deux-schemas.md` §3.3).
 */
export class SetMandateSchemeCommand {
  constructor(
    readonly legalEntityId: string,
    readonly scheme: SepaScheme,
  ) {}
}
