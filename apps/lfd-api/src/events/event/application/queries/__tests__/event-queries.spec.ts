import type { EventDetailView } from "@lfd/contracts";
import { instantToLocal } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { EventNotFoundError } from "../../../domain/errors/event-errors.js";
import { RecordingEventReader } from "../../commands/__tests__/event-doubles.js";
import { GetEventHandler } from "../get-event.handler.js";
import { GetEventQuery } from "../get-event.query.js";
import { ListEventsHandler } from "../list-events.handler.js";
import { ListEventsQuery } from "../list-events.query.js";

/** Tard le soir en UTC : à Paris, c'est déjà le lendemain. */
const LATE_UTC = new Date(Date.UTC(2026, 11, 31, 23, 30));

describe("ListEventsHandler", () => {
  it("demande la table au jour de Paris, pas au jour UTC", async () => {
    const reader = new RecordingEventReader();
    await new ListEventsHandler(reader, new FixedClock(LATE_UTC)).execute(
      new ListEventsQuery("2026-12-01", null),
    );
    expect(reader.asked).toEqual([
      { window: { from: "2026-12-01", to: null }, today: instantToLocal(LATE_UTC).day },
    ]);
    expect(reader.asked[0]?.today).not.toBe(LATE_UTC.toISOString().slice(0, 10));
  });
});

describe("GetEventHandler", () => {
  const detail: EventDetailView = {
    id: "evt_1",
    name: "Salon",
    date: "2026-12-05",
    applications: ["lafoliecoffee"],
    archivedAt: null,
    functionSheets: [],
  };

  it("rend le détail", async () => {
    const reader = new RecordingEventReader([], new Map([["evt_1", detail]]));
    await expect(new GetEventHandler(reader).execute(new GetEventQuery("evt_1"))).resolves.toBe(
      detail,
    );
  });

  it("404 sur un événement inconnu", async () => {
    await expect(
      new GetEventHandler(new RecordingEventReader()).execute(new GetEventQuery("absent")),
    ).rejects.toThrow(EventNotFoundError);
  });
});
