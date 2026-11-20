import type { AcceptedMember } from "../../../../account/domain/ports/accepted-members.reader.js";
import {
  PRINCIPAL_SITES_MENU_SET,
  SiteGestureFact,
  SiteGesturePayloadError,
  SUB_ACCOUNT_MENU_SET,
  type SiteGestureStamp,
} from "../../../../account/domain/events/site-gesture.fact.js";
import type { CompanyStatus } from "../../../../account/domain/value-objects/company-status.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  FixedLifecycle,
  FixedMembers,
  MemoryNoticeJournal,
  RecordingNoticeMails,
} from "../../__tests__/order-notice-doubles.js";
import {
  NotifyPrincipalOnMenuChangedByTeam,
  NotifyPrincipalOnSitesMenuChangedByTeam,
} from "../notify-principal-on-menu-changed-by-team.handler.js";

const member = (userId: string, role: AcceptedMember["role"]): AcceptedMember => ({
  userId,
  email: `${userId}@alpes.test`,
  role,
});

const ALPES = [
  member("owner", "owner"),
  member("admin", "admin"),
  member("buyer", "orders"),
  member("accountant", "billing"),
];

function build(status: CompanyStatus = "active") {
  const mailer = new RecordingNoticeMails();
  const journal = new MemoryNoticeJournal();
  const handler = new NotifyPrincipalOnMenuChangedByTeam(
    new FixedLifecycle(new Map([["alpes", status]])),
    new FixedMembers(new Map([["alpes", ALPES]])),
    journal,
    new FixedClock(new Date(Date.UTC(2030, 0, 1, 10))),
    mailer,
  );
  return { handler, mailer };
}

function menuSet(stamp: Partial<SiteGestureStamp> = {}) {
  const fact = new SiteGestureFact(SUB_ACCOUNT_MENU_SET, "g_1", "chalet", {
    siteCompanyId: "chalet",
    siteName: "Chalet Gentiane",
    principalCompanyId: "alpes",
    authorUserId: null,
    byTeam: true,
    ...stamp,
  });
  return { eventId: "evt_menu", type: SUB_ACCOUNT_MENU_SET, payload: fact.durableFact().payload };
}

const recipients = (mailer: RecordingNoticeMails): string[] => mailer.sent.map((m) => m.to).sort();

describe("NotifyPrincipalOnMenuChangedByTeam — l'équipe change la carte d'un site (Q3)", () => {
  it("prévient le propriétaire et l'administrateur du principal, et dit le site seul", async () => {
    const { handler, mailer } = build();

    await handler.handle(menuSet());

    expect(recipients(mailer)).toEqual(["admin@alpes.test", "owner@alpes.test"]);
    expect(mailer.sent[0]).toMatchObject({
      template: "customer.sub-account-gesture",
      data: { gesture: "menu_changed", siteName: "Chalet Gentiane", reference: null, byTeam: true },
      subjects: [{ type: "company", id: "alpes" }],
      idempotencyKey: "sub-account-menu-notice:evt_menu:owner",
    });
  });

  it("ne prévient personne quand le principal l'a posée lui-même", async () => {
    const { handler, mailer } = build();
    await handler.handle(menuSet({ byTeam: false, authorUserId: "owner" }));
    expect(mailer.sent).toEqual([]);
  });

  it("ne prévient personne quand le site n'avait pas de principal au geste", async () => {
    const { handler, mailer } = build();
    await handler.handle(menuSet({ principalCompanyId: null }));
    expect(mailer.sent).toEqual([]);
  });

  it("n'écrit plus à un principal résilié", async () => {
    const { handler, mailer } = build("terminated");
    await handler.handle(menuSet());
    expect(mailer.sent).toEqual([]);
  });

  it("une relivraison du même fait n'envoie rien de plus", async () => {
    const { handler, mailer } = build();
    await handler.handle(menuSet());
    await handler.handle(menuSet());
    expect(mailer.sent).toHaveLength(2);
  });

  it("refuse une charge hors forme", async () => {
    const { handler } = build();
    await expect(
      handler.handle({ eventId: "evt_x", type: SUB_ACCOUNT_MENU_SET, payload: {} }),
    ).rejects.toThrow(SiteGesturePayloadError);
  });
});

describe("NotifyPrincipalOnSitesMenuChangedByTeam — l'équipe change la carte commune (§ 6.1)", () => {
  function sitesBuild() {
    const mailer = new RecordingNoticeMails();
    const handler = new NotifyPrincipalOnSitesMenuChangedByTeam(
      new FixedLifecycle(new Map([["alpes", "active" as const]])),
      new FixedMembers(new Map([["alpes", ALPES]])),
      new MemoryNoticeJournal(),
      new FixedClock(new Date(Date.UTC(2030, 0, 1, 10))),
      mailer,
    );
    return { handler, mailer };
  }

  function sitesMenuSet(byTeam: boolean) {
    const fact = new SiteGestureFact(PRINCIPAL_SITES_MENU_SET, "g_2", "alpes", {
      siteCompanyId: "alpes",
      siteName: "Alpes",
      principalCompanyId: "alpes",
      authorUserId: byTeam ? null : "owner",
      byTeam,
    });
    return {
      eventId: "evt_common",
      type: PRINCIPAL_SITES_MENU_SET,
      payload: fact.durableFact().payload,
    };
  }

  it("prévient le propriétaire et l'administrateur, par un e-mail qui nomme le principal", async () => {
    const { handler, mailer } = sitesBuild();
    await handler.handle(sitesMenuSet(true));
    expect(recipients(mailer)).toEqual(["admin@alpes.test", "owner@alpes.test"]);
    expect(mailer.sent[0]).toMatchObject({
      data: { gesture: "sites_menu_changed", siteName: "Alpes", reference: null, byTeam: true },
      idempotencyKey: "principal-sites-menu-notice:evt_common:owner",
    });
  });

  it("ne prévient personne quand le principal l'a posée lui-même", async () => {
    const { handler, mailer } = sitesBuild();
    await handler.handle(sitesMenuSet(false));
    expect(mailer.sent).toEqual([]);
  });
});
