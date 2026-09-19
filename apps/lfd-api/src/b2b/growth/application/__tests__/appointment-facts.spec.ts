import type { AppointmentStatus, AppointmentSubjectType } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { Appointment } from "../../domain/entities/appointment.js";
import { Lead } from "../../domain/entities/lead.js";
import { RecordingActivityRecorder } from "../../domain/ports/__tests__/recording-activity-recorder.js";
import type { BookedSlot } from "../../domain/availability.js";
import { AppointmentRepository } from "../../domain/ports/appointment.repository.js";
import { CompanyNamer, type CompanyIdentity } from "../../domain/ports/company-namer.js";
import { LeadRepository } from "../../domain/ports/lead.repository.js";
import { TransitionAppointmentCommand } from "../commands/transition-appointment.command.js";
import { TransitionAppointmentHandler } from "../commands/transition-appointment.handler.js";

/**
 * **Ce que le journal retient d'un rendez-vous** (lot B du plan des phrases,
 * 2026-09-19) : le nom de son sujet au moment du geste, et, par transition,
 * ce que le geste dit — l'instant d'une confirmation, le motif d'une
 * annulation, rien de plus pour honoré ou manqué.
 */
const NOW = new Date("2026-03-10T12:00:00.000Z");
const START = new Date("2026-03-10T09:00:00.000Z");

class Companies extends CompanyNamer {
  nameOf(companyId: string): Promise<CompanyIdentity | null> {
    return Promise.resolve(
      companyId === "c1" ? { enseigne: "Le Pain Quotidien", raisonSociale: "PQ Marais" } : null,
    );
  }
  namesOf(): Promise<ReadonlyMap<string, CompanyIdentity>> {
    return Promise.resolve(new Map());
  }
}

class Leads extends LeadRepository {
  create(): Promise<string> {
    return Promise.resolve("lead_1");
  }
  load(leadId: string): Promise<Lead | null> {
    return Promise.resolve(
      leadId === "lead_1"
        ? Lead.reconstitute({
            id: "lead_1",
            businessName: "Bistrot du Coin",
            contactName: "Marie",
            email: "marie@bistrot.fr",
            phone: "",
            siret: "",
            notes: "",
            status: "contacted",
            linkedUserId: null,
            lastContactedAt: null,
          })
        : null,
    );
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  findOpenByEmail(): Promise<Lead | null> {
    return Promise.resolve(null);
  }
}

class OneAppointment extends AppointmentRepository {
  constructor(private readonly stored: Appointment) {
    super();
  }
  create(): Promise<string> {
    return Promise.resolve("apt_1");
  }
  load(): Promise<Appointment | null> {
    return Promise.resolve(this.stored);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  bookedBetween(): Promise<readonly BookedSlot[]> {
    return Promise.resolve([]);
  }
}

function appointment(
  subjectType: AppointmentSubjectType,
  subjectId: string,
  status: AppointmentStatus = "confirmed",
): Appointment {
  return Appointment.reconstitute({
    id: "apt_1",
    startAt: START,
    endAt: new Date(START.getTime() + 30 * 60_000),
    status,
    channel: "phone",
    purpose: "discover",
    subjectType,
    subjectId,
    contactName: "Karim Benali",
    contactEmail: "karim@exemple.fr",
    contactPhone: "06 12 34 56 78",
    message: "",
    cancelReason: "",
    rescheduledFromId: null,
    createdAt: START,
  });
}

async function transition(
  stored: Appointment,
  payload: TransitionAppointmentCommand["payload"],
): Promise<RecordingActivityRecorder> {
  const recorder = new RecordingActivityRecorder();
  await new TransitionAppointmentHandler(
    new OneAppointment(stored),
    recorder,
    new FixedClock(NOW),
    new Companies(),
    new Leads(),
  ).execute(new TransitionAppointmentCommand("apt_1", payload));
  return recorder;
}

describe("les faits d'un rendez-vous", () => {
  /**
   * Régression : honoré et manqué portaient `reason`, qui recopiait le motif
   * d'ANNULATION du rendez-vous — toujours vide pour ces gestes (relevé au lot A).
   */
  it("honoré : le nom de la société, sans motif d'annulation recopié", async () => {
    const recorder = await transition(appointment("company", "c1"), {
      status: "honored",
      reason: "",
    });

    expect(recorder.records[0]).toMatchObject({
      type: "appointment.honored",
      subjectType: "company",
      subjectId: "c1",
      payload: { subjectLabel: "Le Pain Quotidien", appointmentId: "apt_1", via: "staff" },
    });
  });

  it("annulé : le motif, et le nom du prospect pour un rendez-vous de démarchage", async () => {
    const recorder = await transition(appointment("lead", "lead_1"), {
      status: "cancelled",
      reason: "fermeture annuelle",
    });

    expect(recorder.records[0]?.payload).toEqual({
      subjectLabel: "Bistrot du Coin",
      appointmentId: "apt_1",
      reason: "fermeture annuelle",
      via: "staff",
    });
  });

  it("confirmé : l'instant du rendez-vous, et le nom donné par la personne — jamais son e-mail", async () => {
    const recorder = await transition(appointment("user", "user_1", "requested"), {
      status: "confirmed",
      reason: "",
    });

    expect(recorder.records[0]?.payload).toEqual({
      subjectLabel: "Karim Benali",
      appointmentId: "apt_1",
      startAt: START.toISOString(),
      via: "staff",
    });
    expect(JSON.stringify(recorder.records[0])).not.toContain("karim@exemple.fr");
  });

  it("un sujet que rien ne nomme : le fait part sans libellé plutôt qu'avec un nom inventé", async () => {
    const recorder = await transition(appointment("company", "c_inconnue"), {
      status: "no_show",
      reason: "",
    });

    expect(recorder.records[0]?.payload).toEqual({ appointmentId: "apt_1", via: "staff" });
  });
});
