import {
  CUSTOMER_REQUEST_RETENTION_MONTHS,
  customerRequestKeptSince,
} from "../contact-retention.js";

describe("customerRequestKeptSince — douze mois de conservation", () => {
  it("recule de douze mois calendaires", () => {
    // Dates comparées entre elles seulement : la fonction est pure.
    expect(customerRequestKeptSince(new Date("2027-03-15T10:00:00.000Z"))).toEqual(
      new Date("2026-03-15T10:00:00.000Z"),
    );
    expect(CUSTOMER_REQUEST_RETENTION_MONTHS).toBe(12);
  });
});
