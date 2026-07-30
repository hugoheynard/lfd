import type { KbisFile } from "../value-objects/kbis-file.js";

/**
 * Port vers le **stockage objet** du KBIS (R2/S3). Le fichier ne vit jamais en
 * base : seuls ses métadonnées et sa clé y sont gardés.
 *
 * Le domaine ne sait rien du bucket, des credentials ni de la convention de clé —
 * l'adaptateur infra les porte. Il ne connaît que « ranger le fichier de cette
 * entreprise » et « relire par la clé ».
 */
export abstract class KbisStore {
  /**
   * Range le fichier de l'entreprise et renvoie sa **clé** de stockage (à garder
   * en base). Un dépôt qui remplace un KBIS existant écrase à la même clé.
   * @throws {KbisStorageUnavailableError} stockage non configuré ou en échec.
   */
  abstract save(companyId: string, file: KbisFile): Promise<string>;

  /**
   * Relit le fichier par sa clé.
   * @throws {KbisStorageUnavailableError} stockage non configuré ou en échec.
   */
  abstract read(storageKey: string): Promise<Buffer>;
}
