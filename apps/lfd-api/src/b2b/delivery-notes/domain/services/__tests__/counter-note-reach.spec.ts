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

  // Un BL de reste encore à remettre (plus récent, `planned`) ne doit jamais
  // masquer le BL déjà remis : on n'imprime que ce qui a été tendu.
  it("ignore un BL non remis, même plus récent, quand un autre est remis", () => {
    const handed = handedOverNote();

    const reach = counterNoteReach({
      fulfillmentMethod: "pickup",
      handedOver: true,
      notes: [plannedNote().toState(), handed],
    });

    expect(reach).toEqual({ kind: "note", note: handed });
  });

  it("dit « pas encore » sans aucun BL, quand la remise est attestée", () => {
    expect(counterNoteReach({ fulfillmentMethod: "pickup", handedOver: true, notes: [] })).toEqual({
      kind: "not_yet",
    });
  });

  it("ferme un retrait jamais remis et sans aucun BL", () => {
    expect(counterNoteReach({ fulfillmentMethod: "pickup", handedOver: false, notes: [] })).toEqual(
      { kind: "out_of_reach" },
    );
  });

  it("ne dépend pas de l'ordre dans lequel les BL sont lus", () => {
    const first = handedOverNote();
    const later = {
      ...first,
      id: "dn_2",
      number: "BL-1042-2",
      handedOverAt: new Date((first.handedOverAt?.getTime() ?? 0) + 60_000),
    };
    const subject = { fulfillmentMethod: "pickup", handedOver: true } as const;

    expect(counterNoteReach({ ...subject, notes: [later, first] })).toEqual({
      kind: "note",
      note: later,
    });
  });
});
