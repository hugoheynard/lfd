import type { ShopCopyDraft, ShopCopyEntryState } from "../domain/shop-copy-entry.js";
import { SHOP_COPY_LOCALES, type ShopCopyLocale } from "../domain/shop-copy-locale.js";

/** La clé de l'unique ligne de publication. */
export const SHOP_COPY_PUBLICATION_KEY = "shop";

/** Une ligne de `shop_copy_entries`, telle que Prisma la rend. */
export interface ShopCopyEntryRow {
  readonly key: string;
  readonly locale: string;
  readonly revision: number;
  readonly draftState: "unchanged" | "set" | "reset";
  readonly draftText: string | null;
  readonly draftAt: Date | null;
  readonly draftBy: string | null;
  readonly publishedText: string | null;
  readonly publishedAt: Date | null;
  readonly publishedBy: string | null;
}

/** La langue d'une ligne. La base la tient (CHECK) ; on la relit quand même. */
export function localeOf(raw: string): ShopCopyLocale | null {
  return SHOP_COPY_LOCALES.find((locale) => locale === raw) ?? null;
}

function draftOf(row: ShopCopyEntryRow): ShopCopyDraft {
  if (row.draftState === "set" && row.draftText !== null) {
    return { state: "set", text: row.draftText };
  }
  return row.draftState === "reset" ? { state: "reset" } : { state: "unchanged" };
}

/** Ligne → état de l'agrégat. `null` pour une langue que le code ne connaît pas. */
export function toState(row: ShopCopyEntryRow): ShopCopyEntryState | null {
  const locale = localeOf(row.locale);
  if (locale === null) {
    return null;
  }
  return {
    key: row.key,
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
  };
}

/** État de l'agrégat → colonnes (hors clé). */
export function toColumns(state: ShopCopyEntryState): Omit<ShopCopyEntryRow, "key" | "locale"> {
  return {
    revision: state.revision,
    draftState: state.draft.state,
    draftText: state.draft.state === "set" ? state.draft.text : null,
    draftAt: state.drafted?.at ?? null,
    draftBy: state.drafted?.staffId ?? null,
    publishedText: state.publishedText,
    publishedAt: state.published?.at ?? null,
    publishedBy: state.published?.staffId ?? null,
  };
}
