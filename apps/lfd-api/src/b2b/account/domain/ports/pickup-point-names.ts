import { pickupPointRef, type PickupPointRef } from "../events/journal-names.js";

/**
 * **Le nom d'un point de retrait, au moment d'un geste** — ce que le journal
 * des comptes et des paniers fige à côté de l'id (décision de Hugo du
 * 2026-10-30, §7 de `documentation/journalisation/plan-phrases-du-journal.md`).
 *
 * Déclaré ici, par ceux qui le lisent ; implémenté par les points de retrait
 * (`b2b/pickup-addresses/`), qui possèdent les sites. Une seule question, et le
 * droit de répondre « je ne sais pas » : un point que l'annuaire ne connaît
 * plus se cite par son id, il ne s'invente pas de nom.
 */
export abstract class PickupPointNames {
  /** Le nom du point, archivé compris ; `null` s'il est inconnu. */
  abstract nameOf(pickupAddressId: string): Promise<string | null>;
}

/**
 * Le point désigné, cité pour le journal : `null` sans point, `{ id, name }`
 * quand il a un nom, l'id seul sinon.
 */
export async function citedPickupPoint(
  names: PickupPointNames,
  pickupAddressId: string | null,
): Promise<PickupPointRef> {
  if (pickupAddressId === null) {
    return null;
  }
  return pickupPointRef(pickupAddressId, await names.nameOf(pickupAddressId));
}
