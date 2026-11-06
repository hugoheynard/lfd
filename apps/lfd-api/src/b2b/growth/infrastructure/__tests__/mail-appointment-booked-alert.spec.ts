import {
  OpenableUnitOfWork,
  RecordingMailRequests,
} from "../../../../mail/channels/requests/__tests__/recording-mail-requests.js";
import { AppConfig, type MailerConfig } from "../../../../platform/config/app-config.js";
import { Appointment } from "../../domain/entities/appointment.js";
import { MailAppointmentBookedAlert, parisDateTime } from "../mail-appointment-booked-alert.js";

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

/** L'adaptateur devant la porte doublée, qui refuse `request` hors transaction. */
function setup(inbox: string | null, base: string | null) {
  const uow = new OpenableUnitOfWork();
  const mails = new RecordingMailRequests(uow);
  const alert = new MailAppointmentBookedAlert(mails, uow, new Settings(inbox, base));
  return { mails, alert };
}

describe("MailAppointmentBookedAlert", () => {
  it("sans boîte d'équipe, rien n'est demandé", async () => {
    const { mails, alert } = setup(null, "https://bo.lfc.fr");
    await alert.notify("appt_1", appointment());
    expect(mails.requested).toEqual([]);
  });

  it("demande au bloc, dans une unité de travail : heure de Paris, libellés, lien et clé", async () => {
    const { mails, alert } = setup("equipe@lfc.fr", "https://bo.lfc.fr");
    await alert.notify("appt_1", appointment());

    expect(mails.sentNow).toEqual([]);
    expect(mails.requested).toEqual([
      {
        brand: "lfc",
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
    const { mails, alert } = setup("equipe@lfc.fr", null);
    await alert.notify("appt_1", appointment());
    expect(mails.requested[0]?.data).toMatchObject({ appointmentUrl: "" });
  });

  it("une demande refusée est avalée : le rendez-vous est déjà pris", async () => {
    const { mails, alert } = setup("equipe@lfc.fr", null);
    mails.failWith = new Error("base indisponible");
    await expect(alert.notify("appt_1", appointment())).resolves.toBeUndefined();
    expect(mails.requested).toEqual([]);
  });

  it("l'heure d'hiver est aussi celle de Paris (UTC+1)", () => {
    expect(parisDateTime(new Date("2026-12-02T08:30:00.000Z"))).toBe(
      "mercredi 2 décembre 2026 à 09:30",
    );
  });
});
