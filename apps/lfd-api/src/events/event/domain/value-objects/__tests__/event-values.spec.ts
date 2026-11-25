import {
  InvalidEventApplicationsError,
  InvalidEventDateError,
  InvalidEventNameError,
} from "../../errors/event-errors.js";
import { EventApplications } from "../event-applications.js";
import { EventDate } from "../event-date.js";
import { EVENT_NAME_MAX_LENGTH, EventName } from "../event-name.js";

describe("EventDate", () => {
  it("garde la date calendaire et fait l'aller-retour avec minuit UTC", () => {
    const date = EventDate.fromString("2026-02-28");
    expect(EventDate.fromUtcDate(date.toUtcDate()).value).toBe("2026-02-28");
  });

  it.each(["2026-02-30", "2026-13-01", "05/12/2026", ""])("refuse « %s »", (raw) => {
    expect(() => EventDate.fromString(raw)).toThrow(InvalidEventDateError);
  });
});

describe("EventName", () => {
  it("retire les espaces de bord", () => {
    expect(EventName.of("  Salon  ").value).toBe("Salon");
  });

  it("refuse un nom vide ou blanc", () => {
    expect(() => EventName.of("   ")).toThrow(InvalidEventNameError);
  });

  it("refuse un nom trop long", () => {
    expect(() => EventName.of("x".repeat(EVENT_NAME_MAX_LENGTH + 1))).toThrow(
      InvalidEventNameError,
    );
  });
});

describe("EventApplications", () => {
  it("dédoublonne les valeurs connues", () => {
    expect(EventApplications.of(["lafoliecoffee", "lafoliecoffee"]).values).toEqual([
      "lafoliecoffee",
    ]);
  });

  it("refuse une liste vide", () => {
    expect(() => EventApplications.of([])).toThrow(InvalidEventApplicationsError);
  });

  it("refuse une application inconnue", () => {
    expect(() => EventApplications.of(["vitrine"])).toThrow(InvalidEventApplicationsError);
  });
});
