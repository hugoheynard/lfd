import { totalRows } from "../../../../orders/domain/services/order-sheet-pdf-totals.js";
import { money } from "../../../../orders/domain/services/order-sheet-pdf-format.js";
import { clientNoteOf, DISCOUNT_FALLBACK_LABEL, staffNoteOf } from "../delivery-note-sheet.js";
import { handedOverNote, HEAD, PRO_BILLING } from "./delivery-note-sheet.fixture.js";

/** Le papier du bon, une ligne par remise (plan des promotions, § 18.6, lot M4). */

describe("le papier du bon et ses remises", () => {
  const state = handedOverNote();
  const discount = state.terms?.discountCents ?? 0;

  /**
   * La condition du lot : avec UNE remise (tout ce que la production porte
   * avant M7), le bon est celui d'aujourd'hui au caractère près — même
   * feuille, même pavé de totaux, libellé de point et d'assiette compris.
   */
  it("une seule remise : la feuille et le pavé sont ceux d'aujourd'hui", () => {
    const today = clientNoteOf(state, HEAD, PRO_BILLING);
    const withPart = clientNoteOf(state, HEAD, PRO_BILLING, [
      { label: "Remise du Labo", amountCents: discount, amountTtcCents: null },
    ]);

    expect(withPart).toEqual(today);
    expect(totalRows(withPart)).toEqual(totalRows(today));
    expect(staffNoteOf(state, HEAD, PRO_BILLING, [])).toEqual(
      staffNoteOf(state, HEAD, PRO_BILLING),
    );
  });

  it("plusieurs remises : une ligne chacune, libellé figé ou « Remise », dans leur ordre", () => {
    const note = clientNoteOf(state, HEAD, PRO_BILLING, [
      { label: "Remise du Labo", amountCents: discount - 759, amountTtcCents: null },
      { label: null, amountCents: 759, amountTtcCents: null },
    ]);

    expect(note.money.discountLines).toEqual([
      { label: "Remise du Labo", cents: discount - 759, ttcCents: null },
      { label: DISCOUNT_FALLBACK_LABEL, cents: 759, ttcCents: null },
    ]);
    const rows = totalRows(note);
    const at = rows.findIndex((row) => row.label === "Remise du Labo");
    expect(rows.slice(at, at + 2)).toEqual([
      { label: "Remise du Labo", value: money(-(discount - 759)) },
      { label: "Remise", value: money(-759) },
    ]);
  });
});
