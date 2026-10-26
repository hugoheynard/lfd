import { FIRST_SHIPMENT_RANK } from "../../../production/channels/handover/index.js";
import type {
  HandoverSubject,
  HandoverSubjectLine,
} from "../../channels/commerce/handover-subject.reader.js";

/**
 * **Les envois d'une commande au comptoir** (plan E7 reliquat, choix 13, lot
 * L4c) — règles pures, sans port.
 *
 * Un QR par commande ; le comptoir tend des ENVOIS. Le rang 1 est la commande
 * elle-même, toujours candidat (la règle de retrait est permissive sur
 * l'avancement) ; un reste ne l'est que colisé. Ce qui est déjà retiré,
 * c'est le retrait qui le sait — il le passe ici en `attestedRanks`.
 */

/** Un envoi à tendre : son rang, son numéro, ce qu'on recompte. */
export interface ShipmentToHandOver {
  readonly rank: number;
  readonly reference: string;
  readonly lines: readonly HandoverSubjectLine[];
}

/** Le rang 1 se tend sans regarder le colisage ; un reste, seulement colisé. */
export function shipmentPrepared(subject: HandoverSubject, rank: number): boolean {
  if (rank === FIRST_SHIPMENT_RANK) {
    return true;
  }
  return subject.laterShipments.some((shipment) => shipment.rank === rank && shipment.prepared);
}

/** Les lignes de l'envoi — celles de la commande au rang 1, du BL au-delà ; vide s'il n'existe pas. */
export function shipmentLines(
  subject: HandoverSubject,
  rank: number,
): readonly HandoverSubjectLine[] {
  if (rank === FIRST_SHIPMENT_RANK) {
    return subject.lines;
  }
  return subject.laterShipments.find((shipment) => shipment.rank === rank)?.lines ?? [];
}

/** Les rangs qu'un comptoir pourrait tendre, avant de savoir lesquels sont partis. */
export function candidateRanks(subject: HandoverSubject): readonly number[] {
  return [
    FIRST_SHIPMENT_RANK,
    ...subject.laterShipments.filter((shipment) => shipment.prepared).map(({ rank }) => rank),
  ];
}

/** Les envois prêts et pas encore retirés, par rang croissant. */
export function readyShipments(
  subject: HandoverSubject,
  attestedRanks: ReadonlySet<number>,
): readonly ShipmentToHandOver[] {
  return candidateRanks(subject)
    .filter((rank) => !attestedRanks.has(rank))
    .map((rank) => ({
      rank,
      reference: shipmentReference(subject.orderNumber, rank),
      lines: shipmentLines(subject, rank),
    }));
}

/**
 * L'envoi qu'une vue montre, et que « Remettre » sans choix vise : le premier
 * prêt, sinon la commande (rang 1) — qui dit alors « déjà retirée ». Avec un
 * seul envoi, toujours 1, comme avant L4c.
 */
export function focusedRank(ready: readonly ShipmentToHandOver[]): number {
  return ready[0]?.rank ?? FIRST_SHIPMENT_RANK;
}

/**
 * **Le numéro saisi d'un reste** : `ORD-…-2` → la commande `ORD-…`, rang 2.
 * `null` quand le numéro ne finit pas par `-<rang>` avec un rang > 1 — la
 * saisie le cherche alors comme un numéro de commande, ce qu'elle fait
 * d'abord de toute façon (un numéro de commande peut finir par un tiret).
 */
export function remainderReferenceOf(
  reference: string,
): { readonly orderNumber: string; readonly rank: number } | null {
  const match = /^(.+)-([1-9]\d{0,2})$/.exec(reference);
  if (match === null) {
    return null;
  }
  const [, orderNumber, digits] = match;
  const rank = Number(digits);
  return orderNumber === undefined || rank <= FIRST_SHIPMENT_RANK ? null : { orderNumber, rank };
}

/**
 * La référence gravée d'un envoi : le numéro de commande au rang 1, à
 * l'identique (rien de ce qui est déjà en base ne change), suffixé `-<rang>`
 * au-delà (plan E7 reliquat, choix 13). `order_handover.reference` est unique
 * sur toute la table : sans suffixe, le reliquat heurterait le rang 1.
 */
export function shipmentReference(orderNumber: string, rank: number): string {
  return rank === FIRST_SHIPMENT_RANK ? orderNumber : `${orderNumber}-${String(rank)}`;
}
