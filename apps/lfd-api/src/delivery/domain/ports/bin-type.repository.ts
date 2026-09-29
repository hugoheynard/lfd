import type { BinType } from "../entities/bin-type.js";

/**
 * Port d'**écriture** du catalogue des bacs : on charge l'agrégat, il se mute
 * par ses méthodes métier, on le rend.
 */
export abstract class BinTypeRepository {
  abstract load(id: string): Promise<BinType | null>;

  /**
   * Écrit l'agrégat (création ou mise à jour).
   * @throws {BinTypeNameTakenError} l'index partiel a refusé le nom — une
   * course que la lecture préalable n'a pas vue.
   */
  abstract save(binType: BinType): Promise<void>;

  /**
   * Un type NON archivé porte-t-il déjà ce nom, hors `exceptId` ? Lu avant
   * d'écrire, pour que le refus soit nommé sans perdre la transaction.
   */
  abstract activeNameTaken(name: string, exceptId: string | null): Promise<boolean>;
}
