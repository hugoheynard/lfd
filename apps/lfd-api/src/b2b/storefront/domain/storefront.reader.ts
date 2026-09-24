import type { StorefrontView } from "@lfd/contracts";

/**
 * Port de **lecture** de la vitrine pour l'éditeur : tout ce qu'il charge,
 * révision comprise — il la renverra pour enregistrer (D6).
 */
export abstract class StorefrontReader {
  /** Objets archivés exclus. Une vitrine jamais enregistrée : `{ revision: 0 }`, vide. */
  abstract read(): Promise<StorefrontView>;
}
