import type { StaffNoticeAudiencesView } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { UnknownNoticeRoleError } from "../../domain/notice-audience/staff-notice-audience.errors.js";
import {
  type NoticeTargets,
  StaffNoticeAudience,
} from "../../domain/notice-audience/staff-notice-audience.js";
import {
  type NoticeAudienceStamp,
  StaffNoticeAudienceReader,
  StaffNoticeAudienceRepository,
  StaffNoticeTargetsReader,
} from "../../domain/notice-audience/staff-notice-audience.ports.js";
import { SetStaffNoticeAudienceCommand } from "../commands/set-staff-notice-audience.command.js";
import { SetStaffNoticeAudienceHandler } from "../commands/set-staff-notice-audience.handler.js";
import { ListStaffNoticeAudiencesHandler } from "../queries/list-staff-notice-audiences.handler.js";

const NOTICE = "staff.link-payment-received";

class InMemoryAudiences extends StaffNoticeAudienceRepository {
  readonly saved: {
    roleKeys: readonly string[];
    staffUserIds: readonly string[];
    stamp: NoticeAudienceStamp;
  }[] = [];
  private roleKeys: readonly string[] = [];
  private staffUserIds: readonly string[] = [];

  load(template: string): Promise<StaffNoticeAudience> {
    return Promise.resolve(StaffNoticeAudience.of(template, this.roleKeys, this.staffUserIds));
  }

  save(audience: StaffNoticeAudience, stamp: NoticeAudienceStamp): Promise<void> {
    ({ roleKeys: this.roleKeys, staffUserIds: this.staffUserIds } = audience.snapshot());
    this.saved.push({ roleKeys: this.roleKeys, staffUserIds: this.staffUserIds, stamp });
    return Promise.resolve();
  }
}

class FixedTargets extends StaffNoticeTargetsReader {
  readonly asked: string[][] = [];

  targetsOf(roleKeys: readonly string[], staffUserIds: readonly string[]): Promise<NoticeTargets> {
    this.asked.push([...roleKeys, ...staffUserIds]);
    return Promise.resolve({
      roles: new Map([["compta", { label: "Comptabilité", archived: false }]]),
      members: new Map([["s_1", "Anne Martin"]]),
    });
  }
}

const AT = new Date(0);

function scene() {
  const audiences = new InMemoryAudiences();
  const targets = new FixedTargets();
  const journal = new RecordingJournal();
  const handler = new SetStaffNoticeAudienceHandler(
    audiences,
    targets,
    journal,
    new DirectUnitOfWork(),
    new FixedClock(AT),
  );
  return { audiences, targets, journal, handler };
}

describe("SetStaffNoticeAudienceHandler — régler les destinataires d'un avis", () => {
  it("écrit le réglage avec son auteur, puis journalise le changement", async () => {
    const { audiences, journal, handler } = scene();

    await handler.execute(
      new SetStaffNoticeAudienceCommand(NOTICE, ["compta"], ["s_1"], "staff_9"),
    );

    expect(audiences.saved).toEqual([
      { roleKeys: ["compta"], staffUserIds: ["s_1"], stamp: { by: "staff_9", at: AT } },
    ]);
    expect(journal.types()).toEqual(["staff.notice_audience_changed"]);
  });

  it("lit les cibles d'avant ET d'après, pour nommer ce qui part", async () => {
    const { targets, handler } = scene();
    await handler.execute(new SetStaffNoticeAudienceCommand(NOTICE, ["compta"], [], "staff_9"));

    await handler.execute(new SetStaffNoticeAudienceCommand(NOTICE, [], ["s_1"], "staff_9"));

    expect(targets.asked[1]).toEqual(["compta", "s_1"]);
  });

  it("un réglage identique n'écrit rien, ni ligne ni fait", async () => {
    const { audiences, journal, handler } = scene();
    await handler.execute(new SetStaffNoticeAudienceCommand(NOTICE, ["compta"], [], "staff_9"));

    await handler.execute(new SetStaffNoticeAudienceCommand(NOTICE, ["compta"], [], "staff_9"));

    expect(audiences.saved).toHaveLength(1);
    expect(journal.types()).toEqual(["staff.notice_audience_changed"]);
  });

  it("une ligne invalide est refusée avant toute écriture", async () => {
    const { audiences, journal, handler } = scene();

    await expect(
      handler.execute(new SetStaffNoticeAudienceCommand(NOTICE, ["inconnu"], [], "staff_9")),
    ).rejects.toThrow(UnknownNoticeRoleError);
    expect(audiences.saved).toEqual([]);
    expect(journal.facts).toEqual([]);
  });
});

describe("ListStaffNoticeAudiencesHandler", () => {
  it("rend la lecture de l'écran telle quelle", async () => {
    const view: StaffNoticeAudiencesView = { notices: [], candidates: { roles: [], members: [] } };
    class Fixed extends StaffNoticeAudienceReader {
      all(): Promise<StaffNoticeAudiencesView> {
        return Promise.resolve(view);
      }
    }

    await expect(new ListStaffNoticeAudiencesHandler(new Fixed()).execute()).resolves.toBe(view);
  });
});
