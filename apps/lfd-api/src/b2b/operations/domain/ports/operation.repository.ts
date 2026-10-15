import type { Operation } from "../entities/operation.js";

/**
 * Port d'**écriture** des opérations du commerce — il prend et rend l'agrégat.
 *
 * `add` et `save` sont deux gestes, et ce n'est pas de la cérémonie : `add`
 * **crée**, donc une clé déjà prise y échoue en base même si deux onglets ont
 * passé la vérification en même temps. Un `upsert` unique aurait écrasé
 * l'opération de l'autre onglet sous la même clé — le réemploi que D9 interdit.
 *
 * Il voit les opérations RETIRÉES (archivées, ou absentes d'un envoi du
 * référentiel) : une clé prise l'est pour toujours.
 */
export abstract class OperationRepository {
  /** L'opération, archivée comprise, ou `null`. */
  abstract load(key: string): Promise<Operation | null>;

  /**
   * Les opérations NON ARCHIVÉES qui montrent cette image — celles qu'un
   * remplacement ou un nouveau point focal de la médiathèque doit suivre. Une
   * opération archivée ne change plus : l'agrégat la refuserait.
   */
  abstract loadShowingImage(url: string): Promise<readonly Operation[]>;

  /** @throws {OperationKeyTakenError} la clé est déjà prise, archivée comprise. */
  abstract add(operation: Operation): Promise<void>;

  /** Écrit l'état entier — la sélection comprise, dans son ordre. */
  abstract save(operation: Operation): Promise<void>;
}
