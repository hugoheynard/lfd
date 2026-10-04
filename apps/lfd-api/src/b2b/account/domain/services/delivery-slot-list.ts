import { type DeliverySpecs, legacySlotsOf } from "@lfd/contracts";

/**
 * Les créneaux à écrire (CA3b, plan composition automatique §14.1, BLOQUANT 1).
 *
 * - Une charge SANS `slotList` vient d'un front qui ne connaît pas le champ :
 *   la liste déjà rangée est **conservée**, jamais effacée. Seul un `null`
 *   explicite la retire.
 * - Dès qu'une liste est retenue, l'ancien `slots` en est **dérivé** (le
 *   premier créneau de chaque jour) : un onglet resté sur l'ancien front lit
 *   encore un créneau juste. La liste fait foi, `slots` la suit.
 */
export function withSlotList(incoming: DeliverySpecs, stored: DeliverySpecs | null): DeliverySpecs {
  const slotList = incoming.slotList === undefined ? stored?.slotList : incoming.slotList;
  if (slotList === undefined) {
    return incoming;
  }
  if (slotList === null) {
    return { ...incoming, slotList };
  }
  return { ...incoming, slotList, slots: legacySlotsOf(slotList) };
}
