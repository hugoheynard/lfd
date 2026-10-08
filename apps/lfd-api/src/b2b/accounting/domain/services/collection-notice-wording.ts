import type { CollectionNoticeState } from "../entities/collection-notice.js";

const LONG_DAY = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/gu;
/** Espace fine insécable — le séparateur de milliers français. */
const THIN_SPACE = "\u202F";
/** Espace insécable — entre le montant et le symbole. */
const NO_BREAK_SPACE = "\u00A0";

/** Centimes → « 1 234,56 € », en entiers de bout en bout. */
export function noticeAmount(cents: number): string {
  const euros = String(Math.trunc(cents / 100)).replace(THOUSANDS, THIN_SPACE);
  return `${euros},${String(cents % 100).padStart(2, "0")}${NO_BREAK_SPACE}€`;
}

/**
 * `AAAA-MM-JJ` → « jeudi 15 octobre 2026 », « vendredi 1er janvier 2027 ». Le jour est un jour CIVIL, lu à
 * minuit UTC et formaté en UTC : aucun fuseau ne peut le décaler.
 */
export function noticeDay(day: string): string {
  return LONG_DAY.formatToParts(new Date(`${day}T00:00:00.000Z`))
    .map((part) => (part.type === "day" && part.value === "1" ? "1er" : part.value))
    .join("");
}

/** Ce que l'avis imprime, mis en forme une fois. */
export interface NoticeMailContent {
  readonly kind: "notice" | "correction" | "cancellation";
  readonly creditorName: string;
  readonly creditorIdentifier: string;
  readonly debtorName: string;
  readonly amount: string;
  readonly collectionDay: string;
  readonly mandateReference: string;
  readonly statementReference: string;
  readonly previous: { readonly amount: string; readonly collectionDay: string } | null;
}

/**
 * Le contenu d'un avis à envoyer. `null` pour une reconduction : elle
 * n'envoie rien, l'avis parti tient.
 */
export function noticeMailContent(state: CollectionNoticeState): NoticeMailContent | null {
  if (state.kind === "unchanged") {
    return null;
  }
  return {
    kind: state.kind,
    creditorName: state.creditor.name,
    creditorIdentifier: state.creditor.ics,
    debtorName: state.debtorName,
    amount: noticeAmount(state.terms.amountCents),
    collectionDay: noticeDay(state.terms.collectionDay),
    mandateReference: state.mandateReference,
    statementReference: state.line?.statementId ?? "",
    previous:
      state.previous === null
        ? null
        : {
            amount: noticeAmount(state.previous.amountCents),
            collectionDay: noticeDay(state.previous.collectionDay),
          },
  };
}
