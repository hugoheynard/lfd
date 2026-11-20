import { StaffAuthors } from "../../../../../staff/directory/domain/staff-author-directory.js";
import { noShowAuthorsOf, noShowViewOf } from "../admin-order-no-show-view.js";

/*
 * La fiche d'une commande non retirée : qui l'a déclarée, et si l'e-mail a été
 * DEMANDÉ — par qui et quand. Des instants rendus tels quels, jamais comparés
 * à l'horloge.
 */

const DECLARED_AT = new Date("2026-09-11T08:30:00.000Z");
const REQUESTED_AT = new Date("2026-09-11T09:00:00.000Z");

const STAFF = new StaffAuthors(
  new Map([
    [
      "staff_lea",
      {
        staffUserId: "staff_lea",
        firstName: "Léa",
        lastName: "Martin",
        role: "counter",
        roleLabel: "Comptoir",
        jobTitle: "",
      },
    ],
  ]),
);

describe("la commande non retirée, sur la fiche", () => {
  it("ne dit rien d'une commande qui n'est pas déclarée non retirée", () => {
    expect(noShowViewOf(null, STAFF)).toBeNull();
    expect(noShowAuthorsOf(null)).toEqual([]);
  });

  it("nomme qui l'a déclarée ; l'e-mail n'est pas encore demandé", () => {
    const traces = { declared: { at: DECLARED_AT, byStaffId: "staff_lea" }, noticeRequested: null };

    expect(noShowViewOf(traces, STAFF)).toEqual({
      declaredAt: DECLARED_AT.toISOString(),
      declaredByName: "Léa Martin",
      noticeRequest: null,
    });
    expect(noShowAuthorsOf(traces)).toEqual(["staff_lea"]);
  });

  it("dit qui a demandé l'e-mail et quand ; une fiche absente de l'annuaire se tait", () => {
    const traces = {
      declared: { at: DECLARED_AT, byStaffId: "staff_lea" },
      noticeRequested: { at: REQUESTED_AT, byStaffId: "staff_gone" },
    };

    expect(noShowViewOf(traces, STAFF)?.noticeRequest).toEqual({
      requestedAt: REQUESTED_AT.toISOString(),
      requestedByName: null,
    });
    expect(noShowAuthorsOf(traces)).toEqual(["staff_lea", "staff_gone"]);
  });
});
