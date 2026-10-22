import type { SepaScheme } from "../../domain/value-objects/sepa-scheme.js";

/**
 * **Le mandat SEPA d'EXEMPLE**, sous l'un des deux schémas — la planche des
 * documents de la Comptabilité
 * (`documentation/comptabilite/planche-des-documents.md`).
 *
 * Une lecture : aucun mandat n'est frappé, aucune RUM tirée, rien n'est rangé.
 */
export class GetSepaMandateSpecimenQuery {
  constructor(readonly scheme: SepaScheme) {}
}
