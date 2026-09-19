import { SupportHandledEvent } from "../../../../account/domain/events/support-handled.event.js";
import { SupportRequestedEvent } from "../../../../account/domain/events/support-requested.event.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { OnSupportHandled } from "../on-support-handled.handler.js";
import { OnSupportRequested } from "../on-support-requested.handler.js";

/**
 * Les demandes de contact au journal : le sujet suit la demande (la société,
 * sinon la personne), et il y est nommé comme l'émetteur l'a lu au moment du
 * geste — sans libellé plutôt qu'avec une adresse quand la personne n'a pas de
 * nom (lot B du plan des phrases, 2026-09-19).
 */
const AT = new Date("2026-06-01T08:00:00.000Z");

describe("OnSupportRequested / OnSupportHandled", () => {
  const work = new BackgroundWork();

  it("nomme la société sujet de la demande, au dépôt comme à la clôture", async () => {
    const recorder = new RecordingActivityRecorder();
    new OnSupportRequested(recorder, work).handle(
      new SupportRequestedEvent("sr_1", "c1", "u1", "Le Pain Quotidien", "email", AT),
    );
    new OnSupportHandled(recorder, work).handle(
      new SupportHandledEvent("sr_1", "c1", "u1", "Le Pain Quotidien", AT),
    );
    await work.whenIdle();

    expect(recorder.records.map((record) => [record.subjectType, record.payload])).toEqual([
      [
        "company",
        { subjectLabel: "Le Pain Quotidien", supportRequestId: "sr_1", channel: "email" },
      ],
      ["company", { subjectLabel: "Le Pain Quotidien", supportRequestId: "sr_1" }],
    ]);
  });

  it("une personne sans nom : la demande part sans libellé, jamais avec une adresse", async () => {
    const recorder = new RecordingActivityRecorder();
    new OnSupportRequested(recorder, work).handle(
      new SupportRequestedEvent("sr_2", null, "u9", null, "phone", AT),
    );
    await work.whenIdle();

    expect(recorder.records[0]).toMatchObject({
      subjectType: "user",
      subjectId: "u9",
      payload: { supportRequestId: "sr_2", channel: "phone" },
    });
    expect(recorder.records[0]?.payload).not.toHaveProperty("subjectLabel");
  });
});
