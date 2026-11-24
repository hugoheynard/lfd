import { createHash } from "node:crypto";

import { simulateInvoiceDossier } from "./invoice-dossier.js";
import type { FrozenInvoiceLine } from "./invoice-dossier.types.js";
import type { InvoiceableOrder } from "./monthly-invoicing.js";

/** Ce que le devis retient du calcul de sa facture. */
export interface PeriodQuoteFigures {
  /** SHA-256 hexadécimal de la sérialisation canonique. */
  readonly fingerprint: string;
  /** Le TTC de la facture calculée, en centimes. */
  readonly totalTtcCents: number;
}

/**
 * **L'empreinte d'un devis de période** (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD5 et v5 B1) : un SHA-256 de
 * ce que la facture de ces commandes imprimerait, calculé par
 * `simulateInvoiceDossier` — jamais par `draftOf`, qui juge les bloqueurs,
 * réserve un numéro et fige des dates.
 *
 * Entrent : chaque commande (identifiant, numéro, jour de réception, BL,
 * livraison offerte, état du solde) et tout ce qu'elle a figé — lignes,
 * quantités, prix, taux de TVA, jour de l'envoi d'un reste, remises, port,
 * surtaxe, parts de TVA, totaux —, puis la facture calculée (lignes, remises,
 * livraison, ventilation de la TVA, total).
 *
 * Canonique : les commandes triées par identifiant, leurs lignes par une clé
 * complète, et les clés de chaque objet par ordre alphabétique. Deux lectures
 * des mêmes commandes, dans n'importe quel ordre, donnent la même empreinte ;
 * une quantité, un prix ou un reste qui change en donne une autre.
 */
export function periodQuoteFigures(orders: readonly InvoiceableOrder[]): PeriodQuoteFigures {
  const sorted = [...orders].sort((left, right) => compare(left.orderId, right.orderId));
  const { invoice } = simulateInvoiceDossier(sorted.map((order) => order.frozen));
  const printed = {
    orders: sorted.map((order) => ({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      receivedOn: order.receivedOn,
      deliveryNoteNumbers: order.deliveryNoteNumbers,
      freeDelivery: order.freeDelivery ?? null,
      settlement: order.settlement ?? "settled",
      frozen: { ...order.frozen, lines: sortedLines(order.frozen.lines) },
    })),
    invoice,
  };
  return {
    fingerprint: createHash("sha256").update(canonicalJson(printed), "utf8").digest("hex"),
    totalTtcCents: invoice.totalCents,
  };
}

/** Les lignes d'une commande dans un ordre qui ne dépend pas de la lecture. */
function sortedLines(lines: readonly FrozenInvoiceLine[]): readonly FrozenInvoiceLine[] {
  const keyed = lines.map((line) => ({ line, key: canonicalJson(line) }));
  return keyed.sort((left, right) => compare(left.key, right.key)).map(({ line }) => line);
}

/** Ordre de code (pas de collation locale) : le même partout, toujours. */
function compare(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/**
 * Un JSON aux clés triées, à toute profondeur ; une date s'écrit en ISO, un
 * champ `undefined` est omis comme `JSON.stringify` le fait.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortedKeys(value));
}

function sortedKeys(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(sortedKeys);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([left], [right]) => compare(left, right));
    return Object.fromEntries(entries.map(([key, field]) => [key, sortedKeys(field)]));
  }
  return value;
}
