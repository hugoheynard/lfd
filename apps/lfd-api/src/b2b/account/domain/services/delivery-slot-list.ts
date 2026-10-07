import type { DeliverySpecs, DeliverySpecsPayload, PreferredSlots } from "@lfd/contracts";

/** « Aucun créneau » — la liste vide, plus `null` (plan `plan-retrait-slots.md`, sérieux 6). */
export const NO_SLOT_LIST: PreferredSlots = { mode: "everyday", slots: [] };

/**
 * Les créneaux à écrire (CA3b ; plan `plan-retrait-slots.md`, S2).
 *
 * - Une charge SANS `slotList` vient d'un onglet resté sur l'ancien front :
 *   la liste déjà rangée est **conservée**, jamais effacée.
 * - Sans liste rangée non plus (adresse neuve), l'adresse reçoit la liste
 *   vide : la lecture exige une liste, et une adresse écrite sans en porter
 *   une mettrait le carnet de sa société en 500.
 *
 * L'ancien `slots` n'est plus dérivé : la charge l'a déjà ignoré, et le code
 * ne le lit plus depuis le 2026-10-07.
 */
export function withSlotList(
  incoming: DeliverySpecsPayload,
  stored: DeliverySpecs | null,
): DeliverySpecs {
  const slotList = incoming.slotList ?? stored?.slotList ?? NO_SLOT_LIST;
  return { ...incoming, slotList };
}
