import {
  StaffAuthorDirectory,
  StaffAuthors,
  type StaffAuthor,
} from "../../../../../staff/directory/domain/staff-author-directory.js";
import {
  CustomerNudgeTraceReader,
  type SentCustomerNudges,
} from "../../../domain/ports/customer-nudge-trace.reader.js";
import {
  FixedNudgeDelays,
  minutesAfterEnd,
} from "../../commands/__tests__/customer-nudge-doubles.js";
import { GetCustomerNudgesHandler } from "../get-customer-nudges.handler.js";
import { GetCustomerNudgesQuery } from "../get-customer-nudges.query.js";

/** Les traces d'un jour, et le jour demandé. */
class DayTraces extends CustomerNudgeTraceReader {
  readonly days: string[] = [];

  constructor(private readonly sent: readonly SentCustomerNudges[]) {
    super();
  }

  override sentOn(day: string): Promise<readonly SentCustomerNudges[]> {
    this.days.push(day);
    return Promise.resolve(this.sent);
  }
}

/** Un annuaire qui ne connaît que Léa ; retient les références demandées. */
class Directory extends StaffAuthorDirectory {
  readonly asked: (string | null)[][] = [];

  override identify(references: readonly (string | null)[]): Promise<StaffAuthors> {
    this.asked.push([...references]);
    const lea: StaffAuthor = {
      staffUserId: "staff_lea",
      firstName: "Léa",
      lastName: "Martin",
      role: "manager",
      roleLabel: "Responsable",
      jobTitle: "",
    };
    return Promise.resolve(new StaffAuthors(new Map([["staff_lea", lea]])));
  }
}

describe("GetCustomerNudgesHandler", () => {
  it("rend les délais du réglage et, par commande relancée, qui l'a fait et quand", async () => {
    const traces = new DayTraces([
      {
        orderId: "order_1",
        pickupReminder: { at: minutesAfterEnd(5), byStaffId: "staff_lea" },
        delayWarning: null,
      },
      {
        orderId: "order_2",
        pickupReminder: null,
        delayWarning: { at: minutesAfterEnd(1), byStaffId: "staff_parti" },
      },
    ]);
    const directory = new Directory();

    const view = await new GetCustomerNudgesHandler(
      traces,
      new FixedNudgeDelays({ pickupReminderMinutes: 15, delayWarningMinutes: 5 }),
      directory,
    ).execute(new GetCustomerNudgesQuery("2026-09-11"));

    expect(traces.days).toEqual(["2026-09-11"]);
    expect(directory.asked).toHaveLength(1);
    expect(view).toEqual({
      date: "2026-09-11",
      pickupReminderDelayMinutes: 15,
      delayWarningDelayMinutes: 5,
      orders: [
        {
          orderId: "order_1",
          pickupReminder: { at: minutesAfterEnd(5).toISOString(), byName: "Léa Martin" },
          delayWarning: null,
        },
        {
          orderId: "order_2",
          pickupReminder: null,
          // Sortie de l'annuaire : on ne lui invente pas de nom.
          delayWarning: { at: minutesAfterEnd(1).toISOString(), byName: null },
        },
      ],
    });
  });
});
