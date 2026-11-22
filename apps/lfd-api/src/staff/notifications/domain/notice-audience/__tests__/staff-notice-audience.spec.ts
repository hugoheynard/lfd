import {
  ArchivedNoticeRoleError,
  UnknownNoticeMemberError,
  UnknownNoticeRoleError,
  UnknownStaffNoticeError,
} from "../staff-notice-audience.errors.js";
import { type NoticeTargets, StaffNoticeAudience } from "../staff-notice-audience.js";
import { noticeAudienceChangedFact } from "../staff-notice-audience.facts.js";

const NOTICE = "staff.link-payment-received";

const TARGETS: NoticeTargets = {
  roles: new Map([
    ["compta", { label: "Comptabilité", archived: false }],
    ["ancien", { label: "Ancien", archived: true }],
  ]),
  members: new Map([
    ["s_1", "Anne Martin"],
    ["s_2", "Bruno Petit"],
  ]),
};

describe("StaffNoticeAudience — les destinataires d'un avis", () => {
  it("refuse un modèle qui ne se règle pas", () => {
    expect(() => StaffNoticeAudience.of("staff.invited")).toThrow(UnknownStaffNoticeError);
  });

  it("pose l'ensemble, dédoublonné et trié, et dit ce qui a changé en libellés", () => {
    const audience = StaffNoticeAudience.of(NOTICE);

    const change = audience.settle(["compta", "compta"], ["s_2", "s_1"], TARGETS);

    expect(audience.snapshot()).toEqual({
      template: NOTICE,
      roleKeys: ["compta"],
      staffUserIds: ["s_1", "s_2"],
    });
    expect(change).toEqual({
      added: ["Rôle Comptabilité", "Anne Martin", "Bruno Petit"],
      removed: [],
    });
  });

  it("un réglage identique ne change rien, et n'écrit pas de fait", () => {
    const audience = StaffNoticeAudience.of(NOTICE, ["compta"], ["s_1"]);

    const change = audience.settle(["compta"], ["s_1"], TARGETS);

    expect(change).toEqual({ added: [], removed: [] });
    expect(noticeAudienceChangedFact(audience, change)).toBeNull();
  });

  it("retirer nomme ce qui part, et le fait porte le nom de l'avis", () => {
    const audience = StaffNoticeAudience.of(NOTICE, ["compta"], ["s_1"]);

    const change = audience.settle([], ["s_1"], TARGETS);

    expect(noticeAudienceChangedFact(audience, change)).toEqual({
      type: "staff.notice_audience_changed",
      subjectType: "staff_notice",
      subjectId: NOTICE,
      payload: {
        subjectLabel: "Paiement reçu par un lien",
        added: [],
        removed: ["Rôle Comptabilité"],
      },
    });
  });

  it("refuse un rôle ou un membre inconnus, sans rien changer", () => {
    const audience = StaffNoticeAudience.of(NOTICE);

    expect(() => audience.settle(["nope"], [], TARGETS)).toThrow(UnknownNoticeRoleError);
    expect(() => audience.settle([], ["s_9"], TARGETS)).toThrow(UnknownNoticeMemberError);
    expect(audience.snapshot().roleKeys).toEqual([]);
  });

  it("refuse d'AJOUTER un rôle archivé, mais garde celui déjà réglé", () => {
    expect(() => StaffNoticeAudience.of(NOTICE).settle(["ancien"], [], TARGETS)).toThrow(
      ArchivedNoticeRoleError,
    );
    const kept = StaffNoticeAudience.of(NOTICE, ["ancien"]);
    expect(kept.settle(["ancien", "compta"], [], TARGETS).added).toEqual(["Rôle Comptabilité"]);
  });
});
