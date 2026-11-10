import type { BookingPolicy } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { AvailabilityConfig, BookedSlot } from "../../../domain/availability.js";
import type { Appointment } from "../../../domain/entities/appointment.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { AppointmentBookedAlert } from "../../../domain/ports/appointment-booked-alert.js";
import { AppointmentRepository } from "../../../domain/ports/appointment.repository.js";
import { AvailabilityStore } from "../../../domain/ports/availability.store.js";
import { CompanyNamer, type CompanyIdentity } from "../../../domain/ports/company-namer.js";
import { BookAppointmentCommand } from "../book-appointment.command.js";
import { BookAppointmentHandler } from "../book-appointment.handler.js";

/**
 * Les dates ne sont comparées qu'à l'horloge FIXE du test, jamais au mur :
 * l'instant de référence peut rester absolu (CLAUDE.md §5).
 */
const NOW = new Date("2026-06-01T08:00:00.000Z");
/** Mercredi 10 juin 2026, 09:00 à Paris (UTC+2). */
const START = "2026-06-10T07:00:00.000Z";

const POLICY: BookingPolicy = {
  slotMinutes: 30,
  leadTimeHours: 24,
  horizonDays: 30,
  channels: ["phone"],
};
const CONFIG: AvailabilityConfig = {
  rules: [{ id: "rule_wed", weekday: 3, startTime: "09:00", endTime: "12:00" }],
  exceptions: [],
  policy: POLICY,
};

class OpenAgenda extends AvailabilityStore {
  load(): Promise<AvailabilityConfig> {
    return Promise.resolve(CONFIG);
  }
  replace(): Promise<AvailabilityConfig> {
    throw new Error("non utilisé");
  }
  savePolicy(): Promise<AvailabilityConfig> {
    throw new Error("non utilisé");
  }
  saveExceptions(): Promise<AvailabilityConfig> {
    throw new Error("non utilisé");
  }
}

/** Le carnet : il garde ce qu'on y écrit, et l'ordre dans lequel on l'appelle. */
class Book extends AppointmentRepository {
  readonly created: Appointment[] = [];
  constructor(private readonly steps: string[]) {
    super();
  }
  create(appointment: Appointment): Promise<string> {
    this.steps.push("create");
    this.created.push(appointment);
    return Promise.resolve("appt_1");
  }
  load(): Promise<Appointment | null> {
    return Promise.resolve(null);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  bookedBetween(): Promise<readonly BookedSlot[]> {
    return Promise.resolve([]);
  }
}

class NoCompanies extends CompanyNamer {
  nameOf(): Promise<CompanyIdentity | null> {
    return Promise.resolve(null);
  }
  namesOf(): Promise<ReadonlyMap<string, CompanyIdentity>> {
    return Promise.resolve(new Map());
  }
}

class RecordingAlert extends AppointmentBookedAlert {
  readonly calls: { id: string; appointment: Appointment }[] = [];
  failure: Error | null = null;
  constructor(private readonly steps: string[]) {
    super();
  }
  notify(id: string, appointment: Appointment): Promise<void> {
    this.steps.push("alert");
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    this.calls.push({ id, appointment });
    return Promise.resolve();
  }
}

function setup(): { handler: BookAppointmentHandler; alert: RecordingAlert; steps: string[] } {
  const steps: string[] = [];
  const alert = new RecordingAlert(steps);
  const handler = new BookAppointmentHandler(
    new OpenAgenda(),
    new Book(steps),
    new RecordingActivityRecorder(),
    new FixedClock(NOW),
    new NoCompanies(),
    alert,
  );
  return { handler, alert, steps };
}

const COMMAND = new BookAppointmentCommand("user_1", "karim@exemple.fr", [], {
  startAt: START,
  channel: "phone",
  purpose: "quote",
  companyId: null,
  contactName: "Karim Benali",
  contactPhone: "06 12 34 56 78",
  message: "Pour 40 couverts",
});

describe("BookAppointmentHandler — l'équipe est prévenue", () => {
  it("prévient APRÈS l'écriture, avec l'id rendu par la base et le rendez-vous réservé", async () => {
    const { handler, alert, steps } = setup();

    const id = await handler.execute(COMMAND);

    expect(id).toBe("appt_1");
    expect(steps).toEqual(["create", "alert"]);
    expect(alert.calls).toHaveLength(1);
    expect(alert.calls[0]?.id).toBe("appt_1");
    expect(alert.calls[0]?.appointment).toMatchObject({
      contactName: "Karim Benali",
      purpose: "quote",
      channel: "phone",
      message: "Pour 40 couverts",
      startAt: new Date(START),
    });
  });

  it("une panne du port ne fait pas échouer la réservation", async () => {
    const { handler, alert } = setup();
    alert.failure = new Error("fournisseur indisponible");

    await expect(handler.execute(COMMAND)).resolves.toBe("appt_1");
  });
});
