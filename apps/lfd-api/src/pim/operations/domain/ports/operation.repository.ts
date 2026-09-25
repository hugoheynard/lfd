import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";

import type { Operation } from "../entities/operation.js";

/**
 * Port d'**écriture** des opérations — il prend et rend l'agrégat.
 *
 * `add` et `save` sont deux gestes, et ce n'est pas de la cérémonie : `add`
 * **crée**, donc une clé déjà prise y échoue en base même si deux onglets ont
 * passé la vérification en même temps. Un `upsert` unique aurait écrasé
 * l'opération de l'autre onglet sous la même clé — exactement le réemploi que
 * D9 interdit.
 *
 * Le `WriteTicket` ne se frappe qu'en journalisant : une écriture non tracée
 * est inexprimable.
 */
export abstract class OperationRepository {
  /** L'opération, archivée comprise, ou `null`. */
  abstract load(key: string): Promise<Operation | null>;

  /** @throws {OperationKeyTakenError} la clé est déjà prise, archivée comprise. */
  abstract add(operation: Operation, ticket: WriteTicket): Promise<void>;

  /** Écrit l'état entier — la sélection comprise, dans son ordre. */
  abstract save(operation: Operation, ticket: WriteTicket): Promise<void>;
}
