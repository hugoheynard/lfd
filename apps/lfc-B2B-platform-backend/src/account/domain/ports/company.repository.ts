import type { Company } from "../entities/company.js";

/** Port d'**écriture** des sociétés. */
export abstract class CompanyRepository {
  /** Vrai si une société porte déjà ce SIRET (forme normalisée, 14 chiffres). */
  abstract existsBySiret(siret: string): Promise<boolean>;

  /**
   * Enregistre une société déclarée **et** rattache son créateur comme
   * gestionnaire, en **une seule** opération atomique.
   *
   * Les deux écritures ne sont pas séparables : une société sans aucun membre
   * n'appartiendrait à personne — plus aucun client ne pourrait la voir ni la
   * compléter, et elle resterait invisible dans « Mes entreprises ». C'est
   * pourquoi le port expose cette intention entière plutôt qu'un `insert` et un
   * `attach` que l'appelant pourrait dissocier.
   *
   * @returns l'identifiant de la société créée.
   */
  abstract declareOwnedBy(company: Company, ownerUserId: string): Promise<string>;
}
