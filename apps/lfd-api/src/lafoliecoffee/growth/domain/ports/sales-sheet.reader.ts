import type { SalesChannel, SalesSheetFacts } from "../sales-oversight.js";

/** Le filtre que la base applique : qui suit, et par quel canal la fiche est venue. */
export interface SalesSheetScope {
  /** `undefined` : toute l'équipe ; `null` : les fiches qu'aucun commercial ne suit. */
  readonly followedBy?: string | null | undefined;
  readonly channel?: SalesChannel | undefined;
}

/**
 * **Les fiches principales du suivi commercial**, et ce qu'elles contiennent —
 * jamais un site (`parent_company_id` non nul) : un site est de la structure,
 * pas de l'acquisition.
 *
 * Lu par lots sur l'ensemble du filtre, jamais une lecture par fiche. Le port
 * borne ce qu'il rend : au-delà de `limit` fiches, il refuse.
 */
export abstract class SalesSheetReader {
  /**
   * Les plus récentes d'abord.
   *
   * @throws {SalesOversightTooLargeError} le filtre retient plus de `limit` fiches.
   */
  abstract read(scope: SalesSheetScope, limit: number): Promise<readonly SalesSheetFacts[]>;

  /** Les commerciaux qui suivent au moins une fiche principale, sans filtre. */
  abstract followerIds(): Promise<readonly string[]>;
}
