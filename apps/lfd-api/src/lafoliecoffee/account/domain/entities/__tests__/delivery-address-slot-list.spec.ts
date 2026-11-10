import type { DeliveryAddressPayload, DeliverySpecs, PreferredSlots } from "@lfd/contracts";

import { DeliveryAddressBook } from "../delivery-address-book.js";

/**
 * **Plusieurs créneaux par adresse, à travers le carnet** (CA3b, plan
 * composition automatique §14.1). La date de création n'est comparée à rien.
 */

const CREATED_AT = new Date("2026-01-01T08:00:00Z");
const MORNING = { start: "06:00", end: "08:00" };
const EVENING = { start: "18:00", end: "20:00" };
const TWO_SLOTS: PreferredSlots = { mode: "everyday", slots: [MORNING, EVENING] };

/** Une charge dont seuls les créneaux varient ; `slotList` absent = l'ancien front. */
function payload(slotList?: PreferredSlots): DeliveryAddressPayload {
  return {
    label: "Boutique",
    ligne1: "18 rue des Archives",
    ligne2: "",
    codePostal: "75004",
    ville: "Paris",
    pays: "France",
    isDefault: false,
    specs: {
      note: "",
      deliveryContact: null,
      gps: null,
      signatureRequired: null,
      ...(slotList === undefined ? {} : { slotList }),
    },
  };
}

function bookWith(slotList?: PreferredSlots): DeliveryAddressBook {
  const book = DeliveryAddressBook.reconstitute({
    companyId: "co_1",
    entries: [],
    defaultId: null,
  });
  book.add("addr_1", payload(slotList), CREATED_AT);
  return book;
}

function specsOf(book: DeliveryAddressBook): DeliverySpecs | undefined {
  return book.deliveries()[0]?.specs;
}

describe("plusieurs créneaux par adresse — le carnet", () => {
  it("range la liste de la charge, sans l'ancien créneau unique", () => {
    const specs = specsOf(bookWith(TWO_SLOTS));
    expect(specs?.slotList).toEqual(TWO_SLOTS);
    expect(specs).not.toHaveProperty("slots");
  });

  /** Non-régression (plan-retrait-slots, S2) : l'ancien front n'envoie pas de liste. */
  it("une charge SANS liste conserve celle déjà rangée (onglet resté sur l'ancien front)", () => {
    const book = bookWith(TWO_SLOTS);
    book.edit("addr_1", payload());
    expect(specsOf(book)?.slotList).toEqual(TWO_SLOTS);
  });

  /** Non-régression (plan-retrait-slots, S2) : la lecture exige une liste. */
  it("une adresse neuve sans liste reçoit la liste vide", () => {
    expect(specsOf(bookWith())?.slotList).toEqual({ mode: "everyday", slots: [] });
  });

  it("« aucun créneau » s'écrit par la liste vide, et remplace la liste rangée", () => {
    const book = bookWith(TWO_SLOTS);
    book.edit("addr_1", payload({ mode: "everyday", slots: [] }));
    expect(specsOf(book)?.slotList).toEqual({ mode: "everyday", slots: [] });
  });
});
