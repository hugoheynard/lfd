import type { OperationSnapshot } from "../entities/operation.js";

/**
 * Port de **lecture** des opérations — distinct du dépôt (ISP) : l'écran qui
 * liste n'a pas à pouvoir écrire, et le cas d'usage qui écrit n'a pas à lister.
 *
 * Il rend des instantanés et non des agrégats : une lecture ne mute rien, et
 * lui tendre des entités l'inviterait à le faire.
 */
export abstract class OperationReader {
  /** Toutes les opérations, archivées comprises, l'annonce la plus récente d'abord. */
  abstract list(): Promise<readonly OperationSnapshot[]>;

  /** Une opération par sa clé, ou `null`. */
  abstract find(key: string): Promise<OperationSnapshot | null>;
}
