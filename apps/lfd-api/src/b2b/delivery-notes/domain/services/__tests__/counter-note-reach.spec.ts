import { counterNoteReach } from "../counter-note-reach.js";
import { handedOverNote, plannedNote } from "./delivery-note-sheet.fixture.js";

describe("counterNoteReach — le comptoir n'imprime que ce qu'il a remis (lot L6)", () => {
  it("sert le BL remis d'un retrait", () => {
    const note = handedOverNote();

    expect(
      counterNoteReach({ fulfillmentMethod: "pickup", handedOver: true, notes: [note] }),
    ).toEqual({ kind: "note", note });
  });

  it("sert le plus récent des BL remis (un reste remis après la commande)", () => {
    const first = handedOverNote();
    const later = {
      ...handedOverNote(),
      id: "dn_2",
      number: "BL-1042-2",
      handedOverAt: new Date((first.handedOverAt?.getTime() ?? 0) + 60_000),
    };

    const reach = counterNoteReach({
      fulfillmentMethod: "pickup",
      handedOver: true,
      notes: [first, later],
    });

    expect(reach).toEqual({ kind: "note", note: later });
  });

  it("dit « pas encore » quand la remise est attestée mais son BL pas écrit", () => {
    expect(
      counterNoteReach({
        fulfillmentMethod: "pickup",
        handedOver: true,
        notes: [plannedNote().toState()],
      }),
    ).toEqual({ kind: "not_yet" });
  });

  it("ferme un retrait jamais remis", () => {
    expect(
      counterNoteReach({
        fulfillmentMethod: "pickup",
        handedOver: false,
        notes: [plannedNote().toState()],
      }),
    ).toEqual({ kind: "out_of_reach" });
  });

  it("ferme le BL remis d'une livraison : remis à la porte, pas au comptoir", () => {
    expect(
      counterNoteReach({
        fulfillmentMethod: "delivery",
        handedOver: true,
        notes: [handedOverNote()],
      }),
    ).toEqual({ kind: "out_of_reach" });
  });
});
