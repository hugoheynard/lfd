import {
  AppointmentTransitionError,
  InvalidAppointmentError,
} from "../../errors/appointment-errors.js";
import { Appointment, type BookAppointmentInput } from "../appointment.js";

/**
 * L'agrégat porte ce qui est **intrinsèque** au rendez-vous : pas de réservation
 * dans le passé, états terminaux définitifs, motif exigé à l'annulation, et pas
 * de clôture d'un rendez-vous qui n'a pas encore eu lieu. Le reste (le créneau
 * est-il ouvert ? déjà pris ?) ne le regarde pas — cf. `slotsFor` et l'index
 * unique partiel.
 */
const NOW = new Date("2026-06-01T08:00:00.000Z");
const START = new Date("2026-06-10T07:00:00.000Z");

function input(overrides: Partial<BookAppointmentInput> = {}): BookAppointmentInput {
  return {
    startAt: START,
    durationMinutes: 30,
    channel: "phone",
    purpose: "discover",
    subjectType: "company",
    subjectId: "cmp_1",
    contactName: "  Camille Roy  ",
    contactEmail: "  Camille@Exemple.FR ",
    contactPhone: " 0600000000 ",
    message: "  besoin d'aide sur le KBIS  ",
    rescheduledFromId: null,
    ...overrides,
  };
}

describe("Appointment", () => {
  describe("création", () => {
    it("naît « requested » quand c'est le client qui réserve", () => {
      expect(Appointment.book(input(), NOW).status).toBe("requested");
    });

    it("naît « confirmed » quand c'est le staff qui pose le rendez-vous", () => {
      expect(Appointment.schedule(input(), NOW).status).toBe("confirmed");
    });

    it("calcule la fin depuis la durée", () => {
      expect(Appointment.book(input({ durationMinutes: 45 }), NOW).endAt.toISOString()).toBe(
        "2026-06-10T07:45:00.000Z",
      );
    });

    it("normalise les textes : trim partout, e-mail en minuscules", () => {
      const appointment = Appointment.book(input(), NOW);
      expect(appointment.contactName).toBe("Camille Roy");
      expect(appointment.contactEmail).toBe("camille@exemple.fr");
      expect(appointment.contactPhone).toBe("0600000000");
      expect(appointment.message).toBe("besoin d'aide sur le KBIS");
    });

    it("refuse une réservation dans le passé", () => {
      const past = new Date("2026-05-01T07:00:00.000Z");
      expect(() => Appointment.book(input({ startAt: past }), NOW)).toThrow(
        InvalidAppointmentError,
      );
    });

    it("refuse une réservation à l'instant même (le créneau doit être à venir)", () => {
      expect(() => Appointment.book(input({ startAt: NOW }), NOW)).toThrow(InvalidAppointmentError);
    });

    it("refuse un instant invalide", () => {
      expect(() => Appointment.book(input({ startAt: new Date("n'importe quoi") }), NOW)).toThrow(
        InvalidAppointmentError,
      );
    });

    it("refuse une durée nulle ou non entière", () => {
      expect(() => Appointment.book(input({ durationMinutes: 0 }), NOW)).toThrow(
        InvalidAppointmentError,
      );
      expect(() => Appointment.book(input({ durationMinutes: 12.5 }), NOW)).toThrow(
        InvalidAppointmentError,
      );
    });

    it("refuse un sujet vide", () => {
      expect(() => Appointment.book(input({ subjectId: "   " }), NOW)).toThrow(
        InvalidAppointmentError,
      );
    });

    it("accepte un sujet « lead » — un prospect sans société peut être reçu", () => {
      const appointment = Appointment.book(
        input({ subjectType: "lead", subjectId: "lead_1" }),
        NOW,
      );
      expect(appointment.subjectType).toBe("lead");
    });
  });

  describe("transitions", () => {
    const AFTER = new Date("2026-06-10T09:00:00.000Z");

    it("confirme un rendez-vous demandé", () => {
      const appointment = Appointment.book(input(), NOW);
      appointment.transition("confirmed", "", NOW);
      expect(appointment.status).toBe("confirmed");
    });

    it("clôt en honoré une fois le rendez-vous passé", () => {
      const appointment = Appointment.schedule(input(), NOW);
      appointment.transition("honored", "", AFTER);
      expect(appointment.status).toBe("honored");
      expect(appointment.isClosed).toBe(true);
    });

    it("clôt en absent une fois le rendez-vous passé", () => {
      const appointment = Appointment.schedule(input(), NOW);
      appointment.transition("no_show", "", AFTER);
      expect(appointment.status).toBe("no_show");
    });

    it("refuse de déclarer honoré un rendez-vous qui n'a pas encore eu lieu", () => {
      const appointment = Appointment.schedule(input(), NOW);
      expect(() => appointment.transition("honored", "", NOW)).toThrow(AppointmentTransitionError);
      expect(appointment.status).toBe("confirmed");
    });

    it("annule avec un motif, qu'il conserve", () => {
      const appointment = Appointment.schedule(input(), NOW);
      appointment.transition("cancelled", "  client injoignable  ", NOW);
      expect(appointment.status).toBe("cancelled");
      expect(appointment.cancelReason).toBe("client injoignable");
    });

    it("refuse une annulation sans motif", () => {
      const appointment = Appointment.schedule(input(), NOW);
      expect(() => appointment.transition("cancelled", "   ", NOW)).toThrow(
        InvalidAppointmentError,
      );
      expect(appointment.status).toBe("confirmed");
    });

    it("refuse de reconfirmer un rendez-vous déjà confirmé", () => {
      const appointment = Appointment.schedule(input(), NOW);
      expect(() => appointment.transition("confirmed", "", NOW)).toThrow(
        AppointmentTransitionError,
      );
    });

    it("ne ressuscite pas un rendez-vous clos — les terminaux sont définitifs", () => {
      const appointment = Appointment.schedule(input(), NOW);
      appointment.transition("cancelled", "reporté", NOW);
      expect(() => appointment.transition("confirmed", "", NOW)).toThrow(
        AppointmentTransitionError,
      );
      expect(() => appointment.transition("honored", "", AFTER)).toThrow(
        AppointmentTransitionError,
      );
    });

    it("laisse annuler un rendez-vous encore « requested » (le client se ravise)", () => {
      const appointment = Appointment.book(input(), NOW);
      appointment.transition("cancelled", "le client annule", NOW);
      expect(appointment.status).toBe("cancelled");
    });
  });

  describe("reconstitution", () => {
    it("relit un rendez-vous persisté sans repasser par les invariants de création", () => {
      // Un rendez-vous passé DOIT pouvoir se relire : sinon on ne pourrait plus
      // le clore en honoré/absent, qui est précisément ce qui se fait après coup.
      const appointment = Appointment.reconstitute({
        purpose: "discover",
        id: "appt_1",
        startAt: new Date("2020-01-01T09:00:00.000Z"),
        endAt: new Date("2020-01-01T09:30:00.000Z"),
        status: "confirmed",
        channel: "visio",
        subjectType: "user",
        subjectId: "usr_1",
        contactName: "Dominique",
        contactEmail: "d@exemple.fr",
        contactPhone: "",
        message: "",
        cancelReason: "",
        rescheduledFromId: "appt_0",
        createdAt: new Date("2019-12-01T09:00:00.000Z"),
      });
      expect(appointment.id).toBe("appt_1");
      expect(appointment.rescheduledFromId).toBe("appt_0");
      appointment.transition("honored", "", NOW);
      expect(appointment.status).toBe("honored");
    });
  });
});
