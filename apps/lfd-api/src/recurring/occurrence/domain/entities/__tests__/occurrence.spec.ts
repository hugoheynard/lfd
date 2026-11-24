import { BasketLine } from "../../../../basket/domain/value-objects/basket-line.js";
import { IsoDate } from "../../../../basket/domain/value-objects/iso-date.js";
import { OccurrenceTransitionRefusedError } from "../../errors/occurrence-errors.js";
import { Occurrence } from "../occurrence.js";

const AT = new Date(0);
const LATER = new Date(1);

function planned(): Occurrence {
  return Occurrence.plan({
    id: "occ_1",
    basketId: "basket_1",
    serviceDay: IsoDate.fromString("2026-11-16"),
    at: AT,
  });
}

describe("Occurrence.plan", () => {
  it("se passe sept jours avant son jour, prévue, sans dérogation ni issue", () => {
    const { snapshot } = planned();
    expect(snapshot.placeOn.toString()).toBe("2026-11-09");
    expect(snapshot).toMatchObject({ state: "planned", lines: null, orderId: null, cause: null });
    expect(snapshot.settledAt).toBeNull();
    expect(planned().loadedState).toBeNull();
  });
});

describe("Occurrence — le cycle du § 5", () => {
  it("prévue → passée : elle porte sa commande et son heure, sans cause", () => {
    const occurrence = planned();
    occurrence.place("order_1", LATER);
    expect(occurrence.snapshot).toMatchObject({
      state: "placed",
      orderId: "order_1",
      cause: null,
      reason: null,
      settledAt: LATER,
    });
  });

  it("refusée puis passée : la cause corrigée, la cause s'efface", () => {
    const occurrence = planned();
    occurrence.refuse("unavailable_sku", "Article indisponible.", false, AT);
    occurrence.place("order_1", LATER);
    expect(occurrence.snapshot).toMatchObject({ state: "placed", cause: null, reason: null });
  });

  it("un refus rend vrai la première fois, faux pour la même cause, vrai pour une autre", () => {
    const occurrence = planned();
    expect(occurrence.refuse("plan_closed", "Plan arrêté.", false, AT)).toBe(true);
    expect(occurrence.refuse("plan_closed", "Plan arrêté.", false, LATER)).toBe(false);
    expect(occurrence.refuse("unavailable_sku", "Indisponible.", false, LATER)).toBe(true);
    expect(occurrence.snapshot.settledAt).toBe(LATER);
  });

  it("un refus définitif la rend manquée, et elle ne se passe plus", () => {
    const occurrence = planned();
    occurrence.refuse("deadline_closed", "Heure limite passée.", true, AT);
    expect(occurrence.state).toBe("missed");
    expect(() => occurrence.place("order_1", LATER)).toThrow(OccurrenceTransitionRefusedError);
    expect(() => occurrence.cancel(LATER)).toThrow(OccurrenceTransitionRefusedError);
  });

  it("sautée puis rétablie par de nouvelles lignes ; une échéance sautée n'a pas de lignes", () => {
    const occurrence = planned();
    occurrence.skip("vacances", AT);
    expect(occurrence.snapshot).toMatchObject({ state: "skipped", lines: null, note: "vacances" });
    occurrence.override([BasketLine.create("PAN-001", 2)], "", LATER);
    expect(occurrence.state).toBe("planned");
    expect(occurrence.snapshot.lines?.map((line) => line.quantity)).toEqual([2]);
  });

  it("une échéance refusée se saute : sans issue, sa cause s'efface, et un refus rétabli alerte à nouveau", () => {
    const occurrence = planned();
    occurrence.refuse("unavailable_sku", "Article indisponible.", false, AT);
    occurrence.skip("on s'en passe", LATER);
    expect(occurrence.snapshot).toMatchObject({
      state: "skipped",
      cause: null,
      reason: null,
      settledAt: null,
      lines: null,
    });
    occurrence.override(null, "", LATER);
    expect(occurrence.refuse("unavailable_sku", "Article indisponible.", false, LATER)).toBe(true);
  });

  it("une échéance manquée ou annulée ne se saute pas", () => {
    const missed = planned();
    missed.refuse("deadline_closed", "Heure limite passée.", true, AT);
    expect(() => missed.skip("", LATER)).toThrow(OccurrenceTransitionRefusedError);
    const cancelled = planned();
    cancelled.cancel(AT);
    expect(() => cancelled.skip("", LATER)).toThrow(OccurrenceTransitionRefusedError);
  });

  it("une échéance passée ne se saute, ne se modifie ni ne s'annule", () => {
    const occurrence = planned();
    occurrence.place("order_1", AT);
    expect(() => occurrence.skip("", LATER)).toThrow(OccurrenceTransitionRefusedError);
    expect(() => occurrence.override(null, "", LATER)).toThrow(OccurrenceTransitionRefusedError);
    expect(() => occurrence.cancel(LATER)).toThrow(OccurrenceTransitionRefusedError);
  });

  it("une échéance refusée puis annulée garde sa cause et sa phrase", () => {
    const occurrence = planned();
    occurrence.refuse("buyer_left", "Plus membre.", false, AT);
    occurrence.cancel(LATER);
    expect(occurrence.snapshot).toMatchObject({
      state: "cancelled",
      cause: "buyer_left",
      reason: "Plus membre.",
    });
  });

  it("le refus n'est admis que depuis un état dû", () => {
    const occurrence = planned();
    occurrence.skip("", AT);
    expect(() => occurrence.refuse("plan_closed", "x", false, LATER)).toThrow(
      OccurrenceTransitionRefusedError,
    );
  });
});

describe("Occurrence.restore", () => {
  it("une échéance sautée redevient prévue, au gabarit et sans note", () => {
    const occurrence = planned();
    occurrence.skip("En vacances", AT);
    expect(occurrence.restore(LATER)).toBe(true);
    expect(occurrence.snapshot).toMatchObject({ state: "planned", lines: null, note: "" });
  });

  it("une échéance refusée et modifiée revient au gabarit et reste refusée", () => {
    const occurrence = planned();
    occurrence.override([BasketLine.create("PAN-001", 2)], "", AT);
    occurrence.refuse("unavailable_sku", "Indisponible.", false, AT);
    expect(occurrence.restore(LATER)).toBe(true);
    expect(occurrence.snapshot).toMatchObject({ state: "refused", lines: null });
  });

  it("rend faux quand il n'y a rien à rétablir", () => {
    expect(planned().restore(LATER)).toBe(false);
  });

  it.each(["placed", "missed", "cancelled"])("refuse depuis %s", (state) => {
    const occurrence = planned();
    if (state === "placed") occurrence.place("order_1", AT);
    if (state === "missed") occurrence.refuse("deadline_closed", "Trop tard.", true, AT);
    if (state === "cancelled") occurrence.cancel(AT);
    expect(() => occurrence.restore(LATER)).toThrow(OccurrenceTransitionRefusedError);
  });
});
