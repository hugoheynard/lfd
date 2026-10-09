import { CONTACT_MESSAGE_RETENTION_MONTHS, contactMessageKeptSince } from "../contact-retention.js";

describe("contactMessageKeptSince — douze mois après le traitement", () => {
  it("recule de douze mois calendaires", () => {
    // Dates comparées entre elles seulement : la fonction est pure.
    expect(contactMessageKeptSince(new Date("2027-03-15T10:00:00.000Z"))).toEqual(
      new Date("2026-03-15T10:00:00.000Z"),
    );
    expect(CONTACT_MESSAGE_RETENTION_MONTHS).toBe(12);
  });
});
