import { STAFF_NOTICE_LABELS } from "@lfd/contracts";

import type { JournalFact } from "../../../../platform/journal/journal-fact.js";
import type { NoticeAudienceChange, StaffNoticeAudience } from "./staff-notice-audience.js";

/**
 * Le fait d'un réglage, ou `null` s'il n'a rien changé — un réglage identique
 * n'écrit rien au journal. Le sujet est le modèle d'e-mail.
 */
export function noticeAudienceChangedFact(
  audience: StaffNoticeAudience,
  change: NoticeAudienceChange,
): JournalFact | null {
  if (change.added.length + change.removed.length === 0) {
    return null;
  }
  return {
    type: "staff.notice_audience_changed",
    subjectType: "staff_notice",
    subjectId: audience.template,
    payload: {
      subjectLabel: STAFF_NOTICE_LABELS[audience.template],
      added: change.added,
      removed: change.removed,
    },
  };
}
