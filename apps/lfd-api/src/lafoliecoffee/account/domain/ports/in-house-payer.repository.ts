import type { InHousePayer } from "../entities/in-house-payer.js";

/**
 * Port d'**écriture** de la nature « maison » : il prend et rend l'agrégat.
 * `save` insère la période que le geste a ouverte et clôt celle qu'il a
 * close ; rien ne s'efface (`restaurants-maison.md`).
 */
export abstract class InHousePayerRepository {
  /** Toujours un agrégat, chargé avec sa période vivante ; sans elle, il n'est pas maison. */
  abstract load(companyId: string): Promise<InHousePayer>;
  abstract save(payer: InHousePayer): Promise<void>;
}
