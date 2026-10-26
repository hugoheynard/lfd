import { ShipmentRef } from "../../../production/channels/delivery/index.js";

/**
 * Lecture défensive des champs d'un fait durable de la livraison, côté abonné.
 * `null` : le champ manque ou n'a pas sa forme — l'appelant lève son erreur.
 */
export function textOf(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function instantOf(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Les envois d'un fait (plan E7 reliquat, choix 12) : `shipments` s'il est
 * là, sinon l'ancienne forme `orderIds`, lue comme rang 1 — un fait écrit
 * avant le reliquat se relit sans devenir un message mort. `null` : ni l'une
 * ni l'autre lisible.
 */
export function shipmentsOf(
  payload: Readonly<Record<string, unknown>>,
): readonly ShipmentRef[] | null {
  const shipments = payload["shipments"];
  if (shipments !== undefined) {
    if (!Array.isArray(shipments)) {
      return null;
    }
    const refs = shipments.map((entry: unknown) => ShipmentRef.fromPayload(entry));
    const valid = refs.filter((ref): ref is ShipmentRef => ref !== null);
    return valid.length === refs.length ? valid : null;
  }
  const orderIds = textsOf(payload["orderIds"]);
  return orderIds === null ? null : orderIds.map((orderId) => ShipmentRef.firstOf(orderId));
}

export function textsOf(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string")
    ? value
    : null;
}
