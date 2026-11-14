import {
  InvalidNotedContactDateError,
  NotedContactInFutureError,
  NotedContactNoteTooLongError,
} from "../../errors/noted-contact-errors.js";
import { NOTED_CONTACT_NOTE_MAX_LENGTH, NotedContact } from "../noted-contact.js";

// Les jours ne sont comparés qu'entre eux : `today` est une donnée du test.
const TODAY = "2026-11-14";

describe("un contact noté", () => {
  it("garde le mode, le jour et la note rognée", () => {
    const contact = NotedContact.note(
      { mode: "phone", date: TODAY, note: "  rappel lundi " },
      TODAY,
    );
    expect(contact).toMatchObject({ mode: "phone", date: TODAY, note: "rappel lundi" });
  });

  it("accepte un jour passé", () => {
    expect(NotedContact.note({ mode: "visit", date: "2026-11-01" }, TODAY).date).toBe("2026-11-01");
  });

  it("ne garde aucune note quand elle est absente ou blanche", () => {
    expect(NotedContact.note({ mode: "email", date: TODAY }, TODAY).note).toBeNull();
    expect(NotedContact.note({ mode: "email", date: TODAY, note: "   " }, TODAY).note).toBeNull();
  });

  it("refuse un jour après aujourd'hui", () => {
    expect(() => NotedContact.note({ mode: "phone", date: "2026-11-15" }, TODAY)).toThrow(
      NotedContactInFutureError,
    );
  });

  it.each(["2026-02-31", "2026-13-01", "14/11/2026", ""])(
    "refuse « %s », qui n'est pas un jour",
    (date) => {
      expect(() => NotedContact.note({ mode: "phone", date }, TODAY)).toThrow(
        InvalidNotedContactDateError,
      );
    },
  );

  it("accepte une note à la borne, refuse au-delà", () => {
    const atLimit = "a".repeat(NOTED_CONTACT_NOTE_MAX_LENGTH);
    expect(NotedContact.note({ mode: "other", date: TODAY, note: atLimit }, TODAY).note).toBe(
      atLimit,
    );
    expect(() =>
      NotedContact.note({ mode: "other", date: TODAY, note: `${atLimit}a` }, TODAY),
    ).toThrow(NotedContactNoteTooLongError);
  });
});
