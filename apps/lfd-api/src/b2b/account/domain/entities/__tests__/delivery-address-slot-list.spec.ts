import type { DeliveryAddressPayload, PreferredSlots } from "@lfd/contracts";

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
function payload(slotList?: PreferredSlots | null): DeliveryAddressPayload {
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
      slots: { mode: "everyday", slot: { start: "10:00", end: "11:00" } },
      deliveryContact: null,
      gps: null,
      signatureRequired: null,
      ...(slotList === undefined ? {} : { slotList }),
    },
  };
}

function bookWith(slotList?: PreferredSlots | null): DeliveryAddressBook {
  const book = DeliveryAddressBook.reconstitute({
    companyId: "co_1",
    entries: [],
    defaultId: null,
  });
  book.add("addr_1", payload(slotList), CREATED_AT);
  return book;
}

function specsOf(book: DeliveryAddressBook): DeliveryAddressPayload["specs"] | undefined {
  return book.deliveries()[0]?.specs;
}

describe("plusieurs créneaux par adresse — le carnet", () => {
  it("dérive l'ancien créneau du premier de la liste, pour l'ancien front", () => {
    const specs = specsOf(bookWith(TWO_SLOTS));
    expect(specs?.slotList).toEqual(TWO_SLOTS);
    expect(specs?.slots).toEqual({ mode: "everyday", slot: MORNING });
  });

  it("une charge SANS liste conserve celle déjà rangée (onglet resté sur l'ancien front)", () => {
    const book = bookWith(TWO_SLOTS);
    book.edit("addr_1", payload());
    expect(specsOf(book)?.slotList).toEqual(TWO_SLOTS);
    expect(specsOf(book)?.slots).toEqual({ mode: "everyday", slot: MORNING });
  });

  it("un `null` explicite retire la liste, et l'ancien créneau saisi fait foi", () => {
    const book = bookWith(TWO_SLOTS);
    book.edit("addr_1", payload(null));
    expect(specsOf(book)?.slotList).toBeNull();
    expect(specsOf(book)?.slots).toEqual({
      mode: "everyday",
      slot: { start: "10:00", end: "11:00" },
    });
  });

  it("une adresse sans liste n'en gagne pas — le jsonb garde sa forme", () => {
    expect(specsOf(bookWith())).not.toHaveProperty("slotList");
  });
});
