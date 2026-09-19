import type { PricingJournalEntryView } from "@lfd/contracts";

import type { StaffAuthors } from "../../../staff/directory/domain/staff-author-directory.js";
import type { JournalEntry } from "../domain/ports/pricing-journal.reader.js";

/**
 * Acte de domaine → vue de fil. Les dates traversent en ISO, comme partout.
 *
 * Partagé par les deux lectures du journal plutôt que recopié : elles servent le
 * MÊME fil à l'écran, et deux mappers finiraient par ne plus dire la même chose
 * sur le même acte.
 *
 * `authors` nomme l'acteur — `system` et les marqueurs n'ont pas de nom, et
 * l'écran garde alors `actor` (`architecture-journalisation.md` §12, D3).
 */
export function journalView(entry: JournalEntry, authors: StaffAuthors): PricingJournalEntryView {
  return {
    id: entry.id,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    act: entry.kind,
    actor: entry.actor,
    actorName: authors.nameOf(entry.actor),
    occurredAt: entry.at.toISOString(),
    reason: entry.reason,
    summary: entry.summary,
  };
}
