import {
  CLIENT_NOTE_EDITED_BY_STAFF,
  ClientNoteEditedByStaffEvent,
} from "../client-note-edited-by-staff.event.js";

/**
 * **Le fait d'un geste sur le carnet ne porte AUCUN contenu** (plan D6) : le
 * journal ne s'efface pas, et une note supprimée définitivement ne doit pas y
 * rester lisible.
 */
describe("ClientNoteEditedByStaffEvent", () => {
  it("nomme la société, la note et le geste — rien d'autre", () => {
    expect(ClientNoteEditedByStaffEvent.onNote("c1", "n1", "note_removed").journalFact()).toEqual({
      type: "company.client_note_edited_by_staff",
      subjectType: "company",
      subjectId: "c1",
      payload: { companyId: "c1", noteId: "n1", action: "note_removed" },
    });
  });

  it("n'invente pas de note pour un réordonnancement : le geste range tout le carnet", () => {
    expect(ClientNoteEditedByStaffEvent.reordered("c1").journalFact()).toEqual({
      type: CLIENT_NOTE_EDITED_BY_STAFF,
      subjectType: "company",
      subjectId: "c1",
      payload: { companyId: "c1", action: "notes_reordered" },
    });
  });
});
