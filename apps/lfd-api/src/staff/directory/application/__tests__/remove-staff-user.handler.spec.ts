import { RecordingJournal } from "../../../../platform/journal/__tests__/recording-journal.js";
import { STAFF_FACTS } from "../../domain/staff-facts.js";
import { RemoveStaffUserHandler } from "../remove-staff-user.handler.js";
import { RemoveStaffUserCommand } from "../staff-user.commands.js";
import { RecordingAccessCache, ScriptedStaffUsers, TrackingUnitOfWork } from "./staff-doubles.js";

function harness(journalDown = false) {
  const uow = new TrackingUnitOfWork();
  const staff = new ScriptedStaffUsers(uow);
  const journal = new RecordingJournal(journalDown ? new Error("journal en panne") : null);
  const cache = new RecordingAccessCache(uow);
  return { handler: new RemoveStaffUserHandler(staff, journal, uow, cache), staff, journal, cache };
}

describe("RemoveStaffUserHandler", () => {
  it("supprime et fige qui la fiche était, dans la même transaction", async () => {
    const h = harness();

    await h.handler.execute(new RemoveStaffUserCommand("s1", "staff_moi"));

    expect(h.staff.writes).toEqual([{ method: "remove", insideTransaction: true }]);
    expect(h.journal.facts).toEqual([
      {
        type: STAFF_FACTS.deleted,
        subjectType: "staff_user",
        subjectId: "s1",
        payload: { person: { firstName: "Cécile", lastName: "Martin" }, roleLabel: "Commercial" },
      },
    ]);
    expect(h.cache.forgotten).toEqual([{ insideTransaction: false }]);
  });

  it("échoue avec le journal, sans oublier le cache", async () => {
    const h = harness(true);

    await expect(h.handler.execute(new RemoveStaffUserCommand("s1", "staff_moi"))).rejects.toThrow(
      "journal en panne",
    );
    expect(h.cache.forgotten).toEqual([]);
  });
});
