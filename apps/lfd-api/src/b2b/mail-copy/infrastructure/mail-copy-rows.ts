import type { MailCopyDraft, MailCopyEntryState } from "../domain/mail-copy-entry.js";
import { MAIL_COPY_LOCALES, type MailCopyLocale } from "../domain/mail-copy-locale.js";

/** La clé de l'unique ligne de publication. */
export const MAIL_COPY_PUBLICATION_KEY = "mail";

/** Une ligne de `mail_copy_entries`, telle que Prisma la rend. */
export interface MailCopyEntryRow {
  readonly mail: string;
  readonly path: string;
  readonly locale: string;
  readonly revision: number;
  readonly draftState: "unchanged" | "set" | "reset";
  readonly draftText: string | null;
  readonly draftAt: Date | null;
  readonly draftBy: string | null;
  readonly publishedText: string | null;
  readonly publishedAt: Date | null;
  readonly publishedBy: string | null;
  readonly draftDefaultText: string | null;
  readonly publishedDefaultText: string | null;
}

/** La langue d'une ligne. La base la tient (CHECK) ; on la relit quand même. */
function localeOf(raw: string): MailCopyLocale | null {
  return MAIL_COPY_LOCALES.find((locale) => locale === raw) ?? null;
}

function draftOf(row: MailCopyEntryRow): MailCopyDraft {
  if (row.draftState === "set" && row.draftText !== null) {
    return { state: "set", text: row.draftText };
  }
  return row.draftState === "reset" ? { state: "reset" } : { state: "unchanged" };
}

/** Ligne → état de l'agrégat. `null` pour une langue que le code ne connaît pas. */
export function toState(row: MailCopyEntryRow): MailCopyEntryState | null {
  const locale = localeOf(row.locale);
  if (locale === null) {
    return null;
  }
  return {
    mail: row.mail,
    path: row.path,
    locale,
    revision: row.revision,
    draft: draftOf(row),
    drafted:
      row.draftAt === null || row.draftBy === null
        ? null
        : { at: row.draftAt, staffId: row.draftBy },
    publishedText: row.publishedText,
    published:
      row.publishedAt === null || row.publishedBy === null
        ? null
        : { at: row.publishedAt, staffId: row.publishedBy },
    draftDefault: row.draftDefaultText,
    publishedDefault: row.publishedDefaultText,
  };
}

/** Lignes → états, les langues inconnues écartées. */
export function toStates(rows: readonly MailCopyEntryRow[]): readonly MailCopyEntryState[] {
  return rows.flatMap((row) => {
    const state = toState(row);
    return state === null ? [] : [state];
  });
}

/** État de l'agrégat → colonnes (hors clé). */
export function toColumns(
  state: MailCopyEntryState,
): Omit<MailCopyEntryRow, "mail" | "path" | "locale"> {
  return {
    revision: state.revision,
    draftState: state.draft.state,
    draftText: state.draft.state === "set" ? state.draft.text : null,
    draftAt: state.drafted?.at ?? null,
    draftBy: state.drafted?.staffId ?? null,
    publishedText: state.publishedText,
    publishedAt: state.published?.at ?? null,
    publishedBy: state.published?.staffId ?? null,
    draftDefaultText: state.draftDefault,
    publishedDefaultText: state.publishedDefault,
  };
}
