import type { AccountEngagement } from "../ports/account-order-engagement.js";

/**
 * **Les refus d'annuler une commande au compte** (plan
 * `documentation/order/plan-annulation-de-commande.md`, lot C5 : C5.2, C5.6),
 * purs. Sortis de `order-cancellation.ts` pour qu'il garde la règle commune.
 *
 * Défauts métier appliqués (C5.9 bis, non tranchés par Hugo au 2026-10-12) :
 * un lot non déposé, une commande facturée et une commande re-présentée
 * après un rejet sont REFUSÉS.
 */

/** Ce qui empêche, côté comptabilité, d'annuler une commande au compte. */
export type EngagementBlock =
  | Exclude<AccountEngagement, { readonly kind: "free" }>
  /** L'engagement n'a pas pu être lu : on refuse plutôt que d'annuler à l'aveugle (S6). */
  | { readonly kind: "engagement_unknown" };

/** Le refus comptable, ou `null` quand rien n'est engagé. Ordre du plan : 3, 4, 5. */
export function engagementBlockOf(engagement: AccountEngagement | null): EngagementBlock | null {
  if (engagement === null) {
    return { kind: "engagement_unknown" };
  }
  return engagement.kind === "free" ? null : engagement;
}

const SEE_ACCOUNTING = "voyez avec la comptabilité.";

/**
 * La phrase du refus (C5.6), lue par l'équipe sans le code sous les yeux.
 * Une date absente s'écrit sans date, jamais inventée.
 */
export function engagementRefusalOf(block: EngagementBlock): string {
  switch (block.kind) {
    case "invoiced":
      return (
        `Cette commande a été facturée le ${fullDay(block.issuedOn)} (facture n° ${block.invoiceNumber}). ` +
        "Une facture émise ne s'efface pas : il faut un avoir, que l'équipe ne peut pas encore " +
        "émettre ici. Voyez avec la comptabilité."
      );
    case "collecting":
      return (
        `Cette commande est dans le lot de prélèvement${onDay(block.collectionDay)}` +
        `${block.statementNumber === null ? "" : ` (relevé n° ${block.statementNumber})`}. ` +
        "Annulez d'abord ce lot depuis la comptabilité s'il n'est pas déposé, puis revenez ici."
      );
    case "collected":
      return (
        `Cette commande a déjà été prélevée${block.collectionDay === null ? "" : ` (lot du ${fullDay(block.collectionDay)})`}. ` +
        `L'annulation avec remboursement n'existe pas encore : ${SEE_ACCOUNTING}`
      );
    case "written_off":
      return (
        "Cette commande a été passée en perte après un rejet de prélèvement. " +
        `Elle ne s'annule pas : ${SEE_ACCOUNTING}`
      );
    case "returned_before":
      return (
        "Le prélèvement de cette commande a déjà été rejeté par la banque puis représenté. " +
        `L'annulation d'une commande représentée n'existe pas encore : ${SEE_ACCOUNTING}`
      );
    case "settled_otherwise":
      return (
        "Cette commande a été réglée hors prélèvement. " +
        `L'annulation avec remboursement n'existe pas encore : ${SEE_ACCOUNTING}`
      );
    case "engagement_unknown":
      return (
        "L'état de facturation de cette commande n'a pas pu être lu : rien n'a été annulé. " +
        "Signalez-le à l'équipe technique."
      );
  }
}

function onDay(day: string | null): string {
  return day === null ? "" : ` du ${fullDay(day)}`;
}

/** `AAAA-MM-JJ` → `JJ/MM/AAAA`, sans fuseau : un jour n'en a pas. */
function fullDay(day: string): string {
  const [year = "", month = "", dayOfMonth = ""] = day.split("-");
  return `${dayOfMonth}/${month}/${year}`;
}
