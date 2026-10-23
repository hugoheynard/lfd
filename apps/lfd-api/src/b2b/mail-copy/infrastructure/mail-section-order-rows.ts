import type { MailSectionOrderDraft, MailSectionOrderState } from "../domain/mail-section-order.js";

/** Une ligne de `mail_section_orders`, telle que Prisma la rend. */
export interface MailSectionOrderRow {
  readonly mail: string;
  readonly revision: number;
  readonly draftState: "unchanged" | "set" | "reset";
  readonly draftOrder: readonly string[];
  readonly draftAt: Date | null;
  readonly draftBy: string | null;
  readonly publishedOrder: readonly string[];
  readonly publishedAt: Date | null;
  readonly publishedBy: string | null;
}

function draftOf(row: MailSectionOrderRow): MailSectionOrderDraft {
  if (row.draftState === "set" && row.draftOrder.length > 0) {
    return { state: "set", order: [...row.draftOrder] };
  }
  return row.draftState === "reset" ? { state: "reset" } : { state: "unchanged" };
}

/** Ligne → état de l'agrégat. Un ordre publié vide est l'ordre du code. */
export function toOrderState(row: MailSectionOrderRow): MailSectionOrderState {
  return {
    mail: row.mail,
    revision: row.revision,
    draft: draftOf(row),
    drafted:
      row.draftAt === null || row.draftBy === null
        ? null
        : { at: row.draftAt, staffId: row.draftBy },
    publishedOrder: row.publishedOrder.length === 0 ? null : [...row.publishedOrder],
    published:
      row.publishedAt === null || row.publishedBy === null
        ? null
        : { at: row.publishedAt, staffId: row.publishedBy },
  };
}

/** État de l'agrégat → colonnes (hors clé). */
export function toOrderColumns(state: MailSectionOrderState): {
  readonly revision: number;
  readonly draftState: "unchanged" | "set" | "reset";
  readonly draftOrder: string[];
  readonly draftAt: Date | null;
  readonly draftBy: string | null;
  readonly publishedOrder: string[];
  readonly publishedAt: Date | null;
  readonly publishedBy: string | null;
} {
  return {
    revision: state.revision,
    draftState: state.draft.state,
    draftOrder: state.draft.state === "set" ? [...state.draft.order] : [],
    draftAt: state.drafted?.at ?? null,
    draftBy: state.drafted?.staffId ?? null,
    publishedOrder: state.publishedOrder === null ? [] : [...state.publishedOrder],
    publishedAt: state.published?.at ?? null,
    publishedBy: state.published?.staffId ?? null,
  };
}
