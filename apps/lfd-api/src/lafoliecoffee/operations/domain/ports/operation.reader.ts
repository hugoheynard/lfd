import type { OperationSnapshot } from "../entities/operation.js";

/**
 * Port de **lecture** des opérations du commerce, pour l'écran « Opérations »
 * — distinct du dépôt (ISP) : lister n'a pas à pouvoir écrire, et écrire n'a
 * pas à lister.
 *
 * Il rend des instantanés, jamais des agrégats : une lecture ne mute rien.
 */
export abstract class OperationReader {
  /** Toutes, archivées comprises, l'annonce la plus récente d'abord. */
  abstract list(): Promise<readonly OperationSnapshot[]>;

  /** Une opération par sa clé, archivée comprise, ou `null`. */
  abstract find(key: string): Promise<OperationSnapshot | null>;
}
