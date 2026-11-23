import type { ChorusService } from "../value-objects/chorus-service.js";

/**
 * Port d'**écriture** de la fiche du service Chorus d'une société. Elle se lit
 * avec la fiche staff (`AdminCompanyReader`) et, pour la commande, par
 * `OrderingChorusServiceReader` ; ce port ne sert que le geste qui la pose.
 */
export abstract class ChorusServiceRepository {
  /** La fiche rangée, ou `null` : jamais posée. */
  abstract load(companyId: string): Promise<ChorusService | null>;

  /** Pose la fiche — la seule par société, réécrite en entier. */
  abstract save(companyId: string, service: ChorusService): Promise<void>;
}
