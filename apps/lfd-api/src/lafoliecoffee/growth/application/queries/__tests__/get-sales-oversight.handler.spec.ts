import {
  salesOversightQuerySchema,
  type CompanyContactMode,
  type SalesOversightQuery,
} from "@lfd/contracts";

import {
  MailSubjectDeliveries,
  type SubjectMail,
} from "../../../../../mail/channels/deliveries/mail-subject-deliveries.js";
import type { MailSubjectType } from "../../../../../mail/channels/requests/mail-subject.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  StaffContacts,
  type StaffContact,
} from "../../../../../staff/directory/domain/staff-contacts.js";
import { SalesOversightTooLargeError } from "../../../domain/errors/sales-oversight-errors.js";
import { SalesDayReader, type SalesDayScope } from "../../../domain/ports/sales-day.reader.js";
import {
  SalesSheetReader,
  type SalesSheetScope,
} from "../../../domain/ports/sales-sheet.reader.js";
import type { SalesSheetFacts } from "../../../domain/sales-oversight.js";
import { NO_MILESTONE, type ParisDay } from "../../../domain/sales-today.js";
import { GetSalesOversightHandler } from "../get-sales-oversight.handler.js";
import { GetSalesOversightQuery } from "../get-sales-oversight.query.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2030-01-15T10:00:00.000Z");
const daysBefore = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

class FakeSheets extends SalesSheetReader {
  readonly scopes: SalesSheetScope[] = [];
  constructor(
    private readonly sheets: readonly SalesSheetFacts[],
    private readonly followers: readonly string[] = [],
  ) {
    super();
  }
  read(scope: SalesSheetScope, limit: number): Promise<readonly SalesSheetFacts[]> {
    this.scopes.push(scope);
    if (this.sheets.length > limit) {
      return Promise.reject(new SalesOversightTooLargeError(limit));
    }
    return Promise.resolve(this.sheets);
  }
  followerIds(): Promise<readonly string[]> {
    return Promise.resolve(this.followers);
  }
}

class FakeMails extends MailSubjectDeliveries {
  readonly asked: (readonly string[])[] = [];
  constructor(private readonly mails: ReadonlyMap<string, readonly SubjectMail[]> = new Map()) {
    super();
  }
  forSubjects(
    _type: MailSubjectType,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, readonly SubjectMail[]>> {
    this.asked.push(ids);
    return Promise.resolve(this.mails);
  }
}

class FakeDays extends SalesDayReader {
  readonly scopes: SalesDayScope[] = [];
  readonly days: ParisDay[] = [];
  constructor(
    private readonly opened = 0,
    private readonly contacts: readonly CompanyContactMode[] = [],
  ) {
    super();
  }
  openedOn(scope: SalesDayScope, day: ParisDay): Promise<number> {
    this.scopes.push(scope);
    this.days.push(day);
    return Promise.resolve(this.opened);
  }
  contactsOn(_scope: SalesDayScope, _day: ParisDay): Promise<readonly CompanyContactMode[]> {
    return Promise.resolve(this.contacts);
  }
}

class FakeStaff extends StaffContacts {
  constructor(private readonly people: readonly StaffContact[] = []) {
    super();
  }
  contactsOf(ids: readonly string[]): Promise<ReadonlyMap<string, StaffContact>> {
    return Promise.resolve(
      new Map(
        this.people.filter((p) => ids.includes(p.staffUserId)).map((p) => [p.staffUserId, p]),
      ),
    );
  }
}

function person(id: string, firstName: string, active = true): StaffContact {
  return {
    staffUserId: id,
    firstName,
    lastName: "Commerciale",
    email: `${id}@lfd.test`,
    jobTitle: "",
    active,
  };
}

function sheet(id: string, overrides: Partial<SalesSheetFacts> = {}): SalesSheetFacts {
  return {
    companyId: id,
    reference: `C-${id}`,
    name: `Fiche ${id}`,
    createdAt: daysBefore(2),
    declaredVia: "staff",
    followedByStaffId: "staff_a",
    work: {
      interlocutor: { name: "Jeanne", email: "jeanne@prospect.test", phone: "0102030405" },
      notedContacts: 0,
      hasBillingAddress: false,
      deliveryAddressCount: 0,
      noDeliveryAddressNeeded: false,
      holderLoggedIn: false,
      activated: false,
      hasOrder: false,
    },
    milestones: NO_MILESTONE,
    ...overrides,
  };
}

function accessMail(requestedAt: Date, template = "customer.access-opened"): SubjectMail {
  return {
    requestId: "r",
    template,
    requestedAt,
    state: "accepted",
    delivery: null,
    deliveryAt: null,
  };
}

const query = (raw: Record<string, string> = {}): GetSalesOversightQuery =>
  new GetSalesOversightQuery(salesOversightQuerySchema.parse(raw) satisfies SalesOversightQuery);

function handler(
  sheets: FakeSheets,
  mails = new FakeMails(),
  staff = new FakeStaff(),
  days = new FakeDays(),
) {
  return new GetSalesOversightHandler(sheets, mails, staff, days, new FixedClock(NOW));
}

describe("GetSalesOversightHandler — le filtre de la base", () => {
  it("traduit « non attribuée » en suiveur nul, et le canal commercial en `staff`", async () => {
    const sheets = new FakeSheets([]);
    await handler(sheets).execute(query({ follower: "unassigned", channel: "commercial" }));
    await handler(sheets).execute(query({ follower: "staff_a", channel: "self" }));
    await handler(sheets).execute(query());

    expect(sheets.scopes).toEqual([
      { followedBy: null, channel: "staff" },
      { followedBy: "staff_a", channel: "self" },
      { followedBy: undefined, channel: undefined },
    ]);
  });

  it("laisse passer le refus d'un filtre trop large", async () => {
    const many = Array.from({ length: 1001 }, (_, index) => sheet(`c${index}`));
    await expect(handler(new FakeSheets(many)).execute(query())).rejects.toBeInstanceOf(
      SalesOversightTooLargeError,
    );
  });
});

describe("GetSalesOversightHandler — les envois de l'accès", () => {
  it("lit les envois d'un seul appel pour toutes les fiches, et ne compte que l'accès client", async () => {
    const mails = new FakeMails(
      new Map([
        [
          "c1",
          [
            accessMail(daysBefore(1)),
            accessMail(daysBefore(3)),
            accessMail(daysBefore(0), "customer.company-attached"),
          ],
        ],
      ]),
    );
    const view = await handler(new FakeSheets([sheet("c1"), sheet("c2")]), mails).execute(query());

    expect(mails.asked).toEqual([["c1", "c2"]]);
    expect(view.rows[0]).toMatchObject({
      accessSentCount: 2,
      lastAccessSentAt: daysBefore(1).toISOString(),
      signals: ["access_resent"],
    });
    expect(view.rows[1]).toMatchObject({ accessSentCount: 0, lastAccessSentAt: null, signals: [] });
  });
});

describe("GetSalesOversightHandler — les commerciaux", () => {
  it("nomme le suiveur, dit « archivé » un suspendu ou un inconnu, et ne propose que les actifs", async () => {
    const sheets = new FakeSheets(
      [
        sheet("c1", { followedByStaffId: "staff_a" }),
        sheet("c2", { followedByStaffId: "staff_gone" }),
        sheet("c3", { followedByStaffId: "staff_s" }),
        sheet("c4", { followedByStaffId: null }),
      ],
      ["staff_a", "staff_s", "staff_b"],
    );
    const staff = new FakeStaff([
      person("staff_a", "Anne"),
      person("staff_b", "Béa"),
      person("staff_s", "Sol", false),
    ]);

    const view = await handler(sheets, new FakeMails(), staff).execute(query());

    expect(view.rows.map((row) => row.followedBy)).toEqual([
      { id: "staff_a", name: "Anne Commerciale", archived: false },
      { id: "staff_gone", name: null, archived: true },
      { id: "staff_s", name: "Sol Commerciale", archived: true },
      null,
    ]);
    expect(view.followers).toEqual([
      { id: "staff_a", name: "Anne Commerciale" },
      { id: "staff_b", name: "Béa Commerciale" },
    ]);
  });
});

describe("GetSalesOversightHandler — la réponse", () => {
  it("compte, pagine par 50, et ne sert aucune coordonnée du prospect", async () => {
    const many = Array.from({ length: 51 }, (_, index) => sheet(`c${index}`));
    const view = await handler(new FakeSheets(many)).execute(query({ page: "2" }));

    expect(view).toMatchObject({ page: 2, pageSize: 50, total: 51 });
    expect(view.counts.directory).toBe(51);
    expect(view.rows).toHaveLength(1);
    const served = JSON.stringify(view);
    expect(served).not.toContain("jeanne@prospect.test");
    expect(served).not.toContain("0102030405");
    expect(view.rows[0]?.missing).toEqual(["noted_contact"]);
  });
});

describe("GetSalesOversightHandler — le récap du jour", () => {
  it("lit le jour civil de Paris, et range « non attribuée » sous toute l'équipe", async () => {
    const days = new FakeDays();
    await handler(new FakeSheets([]), new FakeMails(), new FakeStaff(), days).execute(
      query({ follower: "unassigned", channel: "commercial" }),
    );
    await handler(new FakeSheets([]), new FakeMails(), new FakeStaff(), days).execute(
      query({ follower: "staff_a" }),
    );

    expect(days.scopes).toEqual([
      { actor: undefined, unassigned: true, channel: "staff" },
      { actor: "staff_a", unassigned: false, channel: undefined },
    ]);
    expect(days.days[0]?.start.getTime()).toBeLessThanOrEqual(NOW.getTime());
    expect(days.days[0]?.end.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("compte ouvertures, contacts par mode, montées et accès du jour sans relire les e-mails", async () => {
    const mails = new FakeMails(
      new Map([
        ["c1", [accessMail(NOW), accessMail(daysBefore(1))]],
        ["c2", [accessMail(NOW, "customer.company-attached")]],
      ]),
    );
    const sheets = new FakeSheets([
      sheet("c1", {
        work: { ...sheet("c1").work, notedContacts: 1 },
        milestones: { ...NO_MILESTONE, firstContactDay: dayOfNow() },
      }),
      sheet("c2"),
    ]);
    const days = new FakeDays(3, ["phone", "phone", "visit"]);

    const view = await handler(sheets, mails, new FakeStaff(), days).execute(
      query({ level: "directory" }),
    );

    expect(mails.asked).toHaveLength(1);
    expect(view.today).toEqual({
      day: dayOfNow(),
      opened: 3,
      levelUps: 1,
      accessResent: 1,
      contacts: { phone: 2, email: 0, visit: 1, visio: 0, trade_show: 0, other: 0 },
    });
  });
});

/** Le jour de Paris de `NOW` (10 h UTC en janvier : le même jour). */
function dayOfNow(): string {
  return NOW.toISOString().slice(0, 10);
}
