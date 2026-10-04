import type {
  DeliverySlot,
  DeliverySlots,
  DeliverySpecs,
  PreferredSlots,
  Weekday,
} from "./address.js";

/**
 * Les **créneaux préférés d'un jour** — le seul point de lecture (plan
 * composition automatique §14.1). La liste `slotList` si l'adresse en porte
 * une ; sinon l'ancien `slots`, lu comme une liste d'un élément (ou vide).
 *
 * `day` à `null` (jour pas encore choisi) : seuls les créneaux « tous les
 * jours » s'appliquent.
 */
export function slotsFor(
  specs: Pick<DeliverySpecs, "slots" | "slotList">,
  day: Weekday | null,
): readonly DeliverySlot[] {
  const list = specs.slotList;
  if (list !== null && list !== undefined) {
    if (list.mode === "everyday") {
      return list.slots;
    }
    return day === null ? [] : (list.byDay[day] ?? []);
  }
  const single = singleSlotOf(specs.slots, day);
  return single === null ? [] : [single];
}

/** L'ancien créneau unique d'un jour. */
function singleSlotOf(slots: DeliverySlots, day: Weekday | null): DeliverySlot | null {
  if (slots.mode === "everyday") {
    return slots.slot;
  }
  return day === null ? null : slots.byDay[day];
}

/**
 * L'ancien `slots` **dérivé** d'une liste : le premier créneau de chaque jour.
 * Le serveur l'écrit à côté de `slotList` pour qu'un front qui ne connaît que
 * `slots` lise encore quelque chose de juste (§14.1, BLOQUANT 1).
 */
export function legacySlotsOf(list: PreferredSlots): DeliverySlots {
  if (list.mode === "everyday") {
    return { mode: "everyday", slot: list.slots[0] ?? null };
  }
  const first = (day: Weekday): DeliverySlot | null => list.byDay[day]?.[0] ?? null;
  return {
    mode: "perDay",
    byDay: {
      mon: first("mon"),
      tue: first("tue"),
      wed: first("wed"),
      thu: first("thu"),
      fri: first("fri"),
      sat: first("sat"),
      sun: first("sun"),
    },
  };
}
