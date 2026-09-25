import type { OperationSchedulePayload, OperationView } from "@lfd/pim-contracts";

import { UnknownImageError, type ImageCatalogue } from "../../channels/media/image-catalogue.js";
import type { Operation, OperationSnapshot } from "../domain/entities/operation.js";
import { OperationNotFoundError } from "../domain/errors/operation-errors.js";
import type { OperationRepository } from "../domain/ports/operation.repository.js";
import type {
  OperationSchedule,
  OperationScheduleInput,
} from "../domain/value-objects/operation-schedule.js";

/**
 * Ce que plusieurs cas d'usage des opérations partagent : charger ou refuser,
 * traduire les dates du contrat, dire une opération au journal et à l'écran.
 */

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

/**
 * **L'image vient de la médiathèque, ou n'est pas.** La règle de Hugo du
 * 2026-09-23 pour les fiches et les familles — plus aucun visuel par simple
 * URL — vaut pour l'annonce d'une opération : une image qui n'est pas chez
 * nous peut disparaître d'un serveur tiers, et la médiathèque ne saurait pas
 * qu'on l'affiche.
 *
 * @throws {UnknownImageError} l'URL n'est pas une image de la bibliothèque.
 */
export async function ensureImageKnown(
  images: ImageCatalogue,
  image: { readonly url: string } | null,
): Promise<void> {
  if (image !== null && !(await images.has(image.url))) {
    throw new UnknownImageError(image.url);
  }
}

/**
 * Les dates du contrat vers l'agrégat. Le contrat a déjà vérifié que les
 * instants sont des ISO avec décalage ; les jours restent bruts, c'est
 * `CalendarDay` qui les juge.
 */
export function scheduleInputOf(payload: OperationSchedulePayload): OperationScheduleInput {
  return {
    announceFrom: new Date(payload.announceFrom),
    orderFrom: payload.orderFrom === null ? null : new Date(payload.orderFrom),
    orderUntil: new Date(payload.orderUntil),
    pickupFrom: payload.pickupFrom,
    pickupUntil: payload.pickupUntil,
  };
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
 * Les dates en TEXTE — pour le journal comme pour l'écran.
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

/** L'opération telle que l'écran la lit, son état calculé à `now` (D2). */
export function toOperationView(snapshot: OperationSnapshot, now: Date): OperationView {
  return {
    key: snapshot.key,
    name: snapshot.name,
    lede: snapshot.lede,
    image: snapshot.image,
    ...scheduleText(snapshot.schedule),
    audience: snapshot.audience,
    skus: snapshot.skus,
    archivedAt: snapshot.archivedAt === null ? null : snapshot.archivedAt.toISOString(),
    state: snapshot.schedule.stateAt(now),
  };
}
