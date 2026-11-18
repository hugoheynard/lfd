import type { ChorusRouting } from "../value-objects/chorus-routing.js";

/**
 * Port d'**écriture** de la fiche Chorus Pro d'une société. Elle se lit avec
 * la fiche staff (`AdminCompanyReader`) ; ce port ne sert que le geste qui la
 * pose.
 */
export abstract class ChorusRoutingRepository {
  /** La fiche rangée, ou `null` : jamais relevée. */
  abstract load(companyId: string): Promise<ChorusRouting | null>;

  /** Pose la fiche — la seule par société, réécrite en entier. */
  abstract save(companyId: string, routing: ChorusRouting): Promise<void>;
}
