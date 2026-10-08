import type { MandateBankExport } from "../entities/mandate-bank-export.js";

/** Port d'ÉCRITURE de l'export des mandats : il prend et rend l'agrégat. */
export abstract class MandateBankExportRepository {
  /**
   * L'export, s'il appartient à CETTE entité — `null` sinon. Le mur est dans
   * la requête : un export d'une autre entité n'existe pas pour la route.
   */
  abstract load(legalEntityId: string, exportId: string): Promise<MandateBankExport | null>;
  abstract save(bankExport: MandateBankExport): Promise<void>;
}
