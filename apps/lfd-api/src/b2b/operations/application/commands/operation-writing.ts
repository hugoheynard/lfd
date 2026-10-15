import type { Operation, OperationSnapshot } from "../../domain/entities/operation.js";
import {
  OperationNotFoundError,
  OperationWritingClosedError,
} from "../../domain/errors/operation-errors.js";
import type { OperationRepository } from "../../domain/ports/operation.repository.js";
import type { OperationWritingSwitch } from "../../domain/ports/operation-writing-switch.js";
import type { OperationSchedule } from "../../domain/value-objects/operation-schedule.js";

/**
 * Ce que les gestes d'écriture des opérations partagent : la porte fermée,
 * charger ou refuser, dire les dates au journal.
 */

/**
 * **Fermé tant que la bascule n'a pas eu lieu** — le premier geste de chaque
 * cas d'usage, avant toute lecture : un refus qui dépend du déploiement ne
 * doit rien coûter, ni rien laisser entendre de l'état d'une opération.
 *
 * @throws {OperationWritingClosedError} `OPERATIONS_AT_COMMERCE` est fermé.
 */
export function ensureWritingOpen(writing: OperationWritingSwitch): void {
  if (!writing.isOpen()) {
    throw new OperationWritingClosedError();
  }
}

/** @throws {OperationNotFoundError} aucune opération ne porte cette clé. */
export async function requireOperation(
  operations: OperationRepository,
  key: string,
): Promise<Operation> {
  const operation = await operations.load(key);
  if (operation === null) {
    throw new OperationNotFoundError(key);
  }
  return operation;
}

/** Le sujet d'un fait : la clé, et le nom français du moment. */
export function subjectOf(snapshot: OperationSnapshot): {
  readonly key: string;
  readonly name: string;
} {
  return { key: snapshot.key, name: snapshot.name.fr };
}

/** Les cinq dates en texte : ISO pour les instants, `AAAA-MM-JJ` pour les jours. */
export interface ScheduleText {
  readonly announceFrom: string;
  readonly orderFrom: string | null;
  readonly orderUntil: string;
  readonly pickupFrom: string;
  readonly pickupUntil: string;
}

/**
 * Les dates en TEXTE, pour le journal.
 *
 * 🔴 Jamais des `Date` dans un diff : `changesBetween` compare les objets par
 * leurs clés, et une `Date` n'en a aucune — deux dates différentes s'y
 * vaudraient, et un redatage passerait pour « rien n'a changé ».
 */
export function scheduleText(schedule: OperationSchedule): ScheduleText {
  return {
    announceFrom: schedule.announceFrom.toISOString(),
    orderFrom: schedule.orderFrom === null ? null : schedule.orderFrom.toISOString(),
    orderUntil: schedule.orderUntil.toISOString(),
    pickupFrom: schedule.pickupFrom.value,
    pickupUntil: schedule.pickupUntil.value,
  };
}
