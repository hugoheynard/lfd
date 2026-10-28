import type { ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";
import { weightLabel } from "@lfd/money";

import { fill, mailCopyOf } from "./copy/mail-copy.js";

/**
 * **« Écrire au client » après un départ incomplet** (plan
 * plan E6d (`documentation/commandes/bon-de-livraison.md`), § 1). Destinataire :
 * le client qui a passé la commande, à l'adresse de son compte.
 *
 * Le corps est le texte que l'équipe a relu et corrigé — une DONNÉE, pas un
 * gabarit : le dictionnaire n'en rédige que la proposition
 * ({@link draftOrderShortfallMessage}). Le cadre (objet, titre, pied) reste au
 * dictionnaire, comme pour tout e-mail.
 */
export interface OrderShortfallMailData {
  /** Le numéro de la commande. */
  readonly reference: string;
  /** Le texte relu par l'équipe, tel qu'il part. */
  readonly message: string;
  readonly locale: ContentLocale;
}

/** Un article de la proposition, nommé comme sur la commande. */
export interface OrderShortfallDraftLine {
  readonly product: string;
  /** Des pièces, ou des grammes si `saleUnit = "weight"` — dits alors « 250 g ». */
  readonly quantity: number;
  readonly saleUnit?: "weight";
}

/** Ce que la proposition dit : ce qui part, ce qui manque. */
export interface OrderShortfallDraftData {
  readonly reference: string;
  readonly departed: readonly OrderShortfallDraftLine[];
  readonly missing: readonly OrderShortfallDraftLine[];
  readonly locale: ContentLocale;
}

/** La coquille client, prêtée par le registre. */
export type OrderShortfallShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => string;

/** « Votre commande part incomplète », avec le texte relu. */
export function renderOrderShortfallMail(
  data: OrderShortfallMailData,
  shell: OrderShortfallShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale)["customer.order-shortfall"];
  return {
    subject: sanitiseSubject(fill(copy.subject, { ref: data.reference })),
    html: shell({
      kicker: copy.kicker,
      title: copy.title,
      body: data.message,
      footer: copy.footer,
    }),
  };
}

/**
 * **La proposition** que l'équipe relit avant d'envoyer : ce qui part, ce qui
 * manque, la suite (« contactez le service commercial », Hugo, 2026-10-28).
 * Textes EFFECTIFS du dictionnaire : un texte publié à l'écran des textes s'y
 * applique quand l'appelant a ouvert son périmètre.
 */
export function draftOrderShortfallMessage(data: OrderShortfallDraftData): string {
  const copy = mailCopyOf(data.locale)["customer.order-shortfall"];
  const listOf = (lines: readonly OrderShortfallDraftLine[]): string =>
    lines
      .map((line) => fill(copy.line, { quantity: quantityOf(line), product: line.product }))
      .join("\n");
  return [
    fill(copy.intro, { ref: data.reference }),
    `${copy.departedHeading}\n${listOf(data.departed)}`,
    `${copy.missingHeading}\n${listOf(data.missing)}`,
    copy.contactSales,
    copy.closing,
  ].join("\n\n");
}

/** « 3 », ou « 250 g » pour un article au poids (`plan-vente-au-poids.md`, P6). */
function quantityOf(line: OrderShortfallDraftLine): string {
  return line.saleUnit === "weight" ? weightLabel(line.quantity) : String(line.quantity);
}
