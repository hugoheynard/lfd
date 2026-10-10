import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { AppConfig, type MailerConfig } from "../../../../platform/config/app-config.js";
import type { B2bMails } from "../../../../platform/mailer/mail-templates.js";
import type { B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { Appointment } from "../../domain/entities/appointment.js";
import { MailAppointmentBookedAlert, parisDateTime } from "../mail-appointment-booked-alert.js";

class RecordingMailer implements B2bMailer {
  readonly enabled = true;
  readonly sent: SendMailArgs<B2bMails>[] = [];
  refusal: Error | null = null;

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.sent.push(args);
    return Promise.resolve({ providerId: "re_1" });
  }
}

/** La vraie configuration, dont seuls les deux réglages lus sont fixés. */
class Settings extends AppConfig {
  constructor(
    private readonly inbox: string | null,
    private readonly base: string | null,
  ) {
    super();
  }
  override mailerConfig(): MailerConfig {
    return { ...super.mailerConfig(), staffInbox: this.inbox };
  }
  override adminBaseUrl(): string | null {
    return this.base;
  }
}

/** Mercredi 10 juin 2026, 09:00 à Paris (UTC+2) — comparé à rien d'autre qu'à sa mise en forme. */
const START = new Date("2026-06-10T07:00:00.000Z");

function appointment(): Appointment {
  return Appointment.reconstitute({
    id: "appt_1",
    startAt: START,
    endAt: new Date(START.getTime() + 30 * 60_000),
    status: "requested",
    channel: "onsite",
    purpose: "recurring",
    subjectType: "user",
    subjectId: "user_1",
    contactName: "Karim Benali",
    contactEmail: "karim@exemple.fr",
    contactPhone: "",
    message: "Livraison du mardi",
    cancelReason: "",
    rescheduledFromId: null,
    createdAt: START,
  });
}

describe("MailAppointmentBookedAlert", () => {
  it("sans boîte d'équipe, rien ne part", async () => {
    const mailer = new RecordingMailer();
    await new MailAppointmentBookedAlert(mailer, new Settings(null, "https://bo.lfc.fr")).notify(
      "appt_1",
      appointment(),
    );
    expect(mailer.sent).toEqual([]);
  });

  it("écrit l'heure de Paris, les libellés français, le lien et la clé d'idempotence", async () => {
    const mailer = new RecordingMailer();
    await new MailAppointmentBookedAlert(
      mailer,
      new Settings("equipe@lfc.fr", "https://bo.lfc.fr"),
    ).notify("appt_1", appointment());

    expect(mailer.sent).toEqual([
      {
        to: "equipe@lfc.fr",
        template: "staff.appointment-booked",
        data: {
          contactName: "Karim Benali",
          when: "mercredi 10 juin 2026 à 09:00",
          purposeLabel: "Récurrence",
          channelLabel: "Sur place",
          message: "Livraison du mardi",
          appointmentUrl: "https://bo.lfc.fr/rendez-vous/appt_1",
        },
        idempotencyKey: "mail:appointment.booked:appt_1",
      },
    ]);
  });

  it("sans racine du back-office, le lien est vide — le gabarit omet le bouton", async () => {
    const mailer = new RecordingMailer();
    await new MailAppointmentBookedAlert(mailer, new Settings("equipe@lfc.fr", null)).notify(
      "appt_1",
      appointment(),
    );
    expect(mailer.sent[0]?.data).toMatchObject({ appointmentUrl: "" });
  });

  it("une panne du fournisseur est avalée", async () => {
    const mailer = new RecordingMailer();
    mailer.refusal = new Error("Resend indisponible");
    await expect(
      new MailAppointmentBookedAlert(mailer, new Settings("equipe@lfc.fr", null)).notify(
        "appt_1",
        appointment(),
      ),
    ).resolves.toBeUndefined();
  });

  it("l'heure d'hiver est aussi celle de Paris (UTC+1)", () => {
    expect(parisDateTime(new Date("2026-12-02T08:30:00.000Z"))).toBe(
      "mercredi 2 décembre 2026 à 09:30",
    );
  });
});
