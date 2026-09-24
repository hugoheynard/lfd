import { instantToLocal } from "@lfd/contracts";

import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Les refus d'une opération datée** (D6 de
 * `documentation/order/architecture-operations-datees.md`).
 *
 * Tous en 409 (`BusinessError`), comme `PastOrderCutoffError` : la demande est
 * bien formée, c'est le calendrier qui la refuse. Chaque message nomme le cas
 * réel et le geste de sortie — il est lu par un client ou par l'équipe au
 * téléphone, sans le code sous les yeux (§0 de `CLAUDE.md`).
 *
 * Les dates sont portées BRUTES sur l'erreur, en plus du message : un écran les
 * reformate à sa façon.
 */

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

/** `2026-12-20` → « 20 décembre ». À la main, pour ne pas dépendre des locales de l'hôte. */
function frenchDay(day: string): string {
  const [, month, dayOfMonth] = day.split("-").map(Number);
  return `${String(dayOfMonth ?? 0)} ${MONTHS[(month ?? 1) - 1] ?? ""}`;
}

/** Un instant → « 21 décembre à 12 h » (heure de Paris), ou « 15 novembre » à minuit. */
function frenchMoment(instant: Date): string {
  const local = instantToLocal(instant);
  if (local.time === "00:00") {
    return frenchDay(local.day);
  }
  const [hours, minutes] = local.time.split(":");
  const clock =
    minutes === "00" ? `${String(Number(hours))} h` : `${String(Number(hours))} h ${minutes ?? ""}`;
  return `${frenchDay(local.day)} à ${clock}`;
}

/**
 * Les deux bornes, le mois dit une fois quand il est le même : « 20 », « 24
 * décembre » — sinon « 28 décembre », « 3 janvier ».
 */
function frenchBounds(from: string, until: string): readonly [string, string] {
  const sameMonth = from.slice(0, 7) === until.slice(0, 7);
  return [sameMonth ? String(Number(from.slice(8, 10))) : frenchDay(from), frenchDay(until)];
}

/** « du 20 au 24 décembre », ou « le 24 décembre » quand la fenêtre tient en un jour. */
function frenchSpan(from: string, until: string): string {
  if (from === until) {
    return `le ${frenchDay(from)}`;
  }
  const [start, end] = frenchBounds(from, until);
  return `du ${start} au ${end}`;
}

/** « entre le 20 et le 24 décembre ». */
function frenchBetween(from: string, until: string): string {
  const [start, end] = frenchBounds(from, until);
  return `entre le ${start} et le ${end}`;
}

/** L'article n'est vendu que pendant une opération, et aucune ne le montre à ce client. */
export class OperationArticleUnavailableError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly productName: string,
  ) {
    super(
      "orders.operation.absent",
      `« ${productName} » n’est vendu que pendant une opération, et aucune ne le propose en ce moment. Retirez-le du panier pour commander le reste.`,
    );
  }
}

/** La commande de l'opération n'est pas encore ouverte. */
export class OperationNotYetOpenError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly operationKey: string,
    readonly opensAt: Date,
    operationName: string,
  ) {
    super(
      "orders.operation.not_yet_open",
      `Les commandes de « ${operationName} » ouvrent le ${frenchMoment(opensAt)}. Revenez à cette date, ou retirez l’article du panier.`,
    );
  }
}

/** La commande de l'opération est close — la dérogation de l'équipe ne la rouvre pas (D6). */
export class OperationClosedError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly operationKey: string,
    readonly closedAt: Date,
    operationName: string,
  ) {
    super(
      "orders.operation.closed",
      `Les commandes de « ${operationName} » sont closes depuis le ${frenchMoment(closedAt)}. Retirez l’article du panier pour commander le reste.`,
    );
  }
}

/** Le jour demandé tombe hors des jours de retrait de l'opération. */
export class OperationDayOutsideError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly pickupFrom: string,
    readonly pickupUntil: string,
    productName: string,
  ) {
    super(
      "orders.operation.day_outside",
      `« ${productName} » se retire ${frenchSpan(pickupFrom, pickupUntil)}. Choisissez un jour dans cette période.`,
    );
  }
}

/** Aucun jour demandé, et l'opération en exige un. */
export class OperationDayRequiredError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly pickupFrom: string,
    readonly pickupUntil: string,
    productName: string,
  ) {
    super(
      "orders.operation.no_day",
      pickupFrom === pickupUntil
        ? `« ${productName} » se retire le ${frenchDay(pickupFrom)} : choisissez ce jour de retrait.`
        : `Choisissez un jour de retrait ${frenchBetween(pickupFrom, pickupUntil)} pour « ${productName} ».`,
    );
  }
}
