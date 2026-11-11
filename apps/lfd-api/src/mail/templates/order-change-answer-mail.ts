import type { ContentLocale, SheetVariant } from "@lfd/contracts";
import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

import { fill, mailCopyOf } from "./copy/mail-copy.js";
import type { MailBody } from "./mail-logo.js";
import { orderTotalFormFor, type OrderTotalForm } from "./order-total-form.js";

/**
 * Les données des deux e-mails qui RÉPONDENT à une demande de modification
 * (voir `documentation/commandes/modification/modifier-une-commande.md`, § 2.5 « La demande après l'heure limite » (M4)) :
 * appliquée, ou refusée avec le mot de l'équipe. Destinataire : l'auteur de
 * la demande, à l'adresse de son compte.
 *
 * Pas de lignes : la commande à jour se relit dans l'espace du client. Le
 * courriel « appliquée » porte en revanche le nouveau total et l'écart avec
 * l'ancien (décision de Hugo, 2026-10-23, `modifier-une-commande.md` § 2.5) — lus sur la révision
 * appliquée, jamais recalculés ici : c'est ce que la boutique promet au
 * moment d'envoyer la demande (« le nouveau total vous est confirmé par
 * e-mail »).
 */
export interface OrderChangeAppliedMailData {
  /** Le numéro de la commande. */
  readonly reference: string;
  /** Total TTC après la révision, en centimes. */
  readonly totalCents: number;
  /** Total TTC avant la révision, en centimes. */
  readonly previousTotalCents: number;
  /** Les HT après et avant la révision, en centimes — dits à un pro. */
  readonly pretaxCents: number;
  readonly previousPretaxCents: number;
  /** La commande se règle au compte : son total se dit hors taxe. */
  readonly onAccount: boolean;
  /** Pro (une société) ou public. */
  readonly variant: SheetVariant;
  readonly locale: ContentLocale;
}

export interface OrderChangeRefusedMailData {
  readonly reference: string;
  /** Le mot de l'équipe, tel qu'il a été écrit. */
  readonly reason: string;
  readonly locale: ContentLocale;
}

/** La coquille client, prêtée par le registre. */
export type OrderChangeAnswerShell = (
  input: Omit<LayoutInput, "brand" | "supportEmail">,
) => MailBody;

/**
 * « Votre modification est faite. » Le total s'écrit comme dans
 * `customer.order-revised` ({@link orderTotalFormFor}) : HT seul pour un pro
 * au compte, TTC puis HT pour un pro par carte, TTC seul pour un particulier.
 */
export function renderOrderChangeAppliedMail(
  data: OrderChangeAppliedMailData,
  shell: OrderChangeAnswerShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale)["customer.order-change-applied"];
  const ref = data.reference;
  const form = orderTotalFormFor(data.onAccount, data.variant);
  return {
    subject: sanitiseSubject(fill(copy.subject, { ref })),
    ...shell({
      kicker: copy.kicker,
      title: copy.title,
      body: `${fill(copy.intro, { ref })}\n\n${totalShift(data, form)}\n\n${copy.where}`,
      rows: [
        {
          label: totalLabelOf(data, form),
          value: amountOf(data, form, data.totalCents, data.pretaxCents),
          strong: true,
        },
      ],
      footer: copy.footer,
    }),
  };
}

/**
 * L'écart entre les deux totaux, dit dans le sens où il va : en HT pour un pro
 * au compte, qui ne lit que du HT ; en TTC sinon, le montant payé ou rendu.
 */
function totalShift(data: OrderChangeAppliedMailData, form: OrderTotalForm): string {
  const copy = mailCopyOf(data.locale)["customer.order-change-applied"];
  const shift =
    form === "pretax"
      ? data.pretaxCents - data.previousPretaxCents
      : data.totalCents - data.previousTotalCents;
  if (shift === 0) {
    return copy.sameTotal;
  }
  const previous = amountOf(data, form, data.previousTotalCents, data.previousPretaxCents);
  const amount = euros(Math.abs(shift), data.locale);
  return fill(shift > 0 ? copy.moreToPay : copy.lessToPay, { amount, previous });
}

function totalLabelOf(data: OrderChangeAppliedMailData, form: OrderTotalForm): string {
  const copy = mailCopyOf(data.locale)["customer.order-change-applied"];
  if (form === "pretax") {
    return copy.totalLabelPretax;
  }
  return form === "both" ? copy.totalLabelBoth : copy.totalLabel;
}

/** Un total sous la forme de la clientèle. */
function amountOf(
  data: OrderChangeAppliedMailData,
  form: OrderTotalForm,
  withTaxCents: number,
  pretaxCents: number,
): string {
  const copy = mailCopyOf(data.locale)["customer.order-change-applied"];
  const withTax = euros(withTaxCents, data.locale);
  const pretax = euros(pretaxCents, data.locale);
  if (form === "pretax") {
    return fill(copy.pretaxAmount, { pretax });
  }
  return form === "both" ? fill(copy.bothAmounts, { withTax, pretax }) : withTax;
}

/** Un montant en centimes, dans la langue du destinataire — comme les autres courriels de commande. */
function euros(cents: number, locale: ContentLocale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** « Nous n'avons pas pu modifier votre commande », avec le mot de l'équipe. */
export function renderOrderChangeRefusedMail(
  data: OrderChangeRefusedMailData,
  shell: OrderChangeAnswerShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale)["customer.order-change-refused"];
  const ref = data.reference;
  return {
    subject: sanitiseSubject(fill(copy.subject, { ref })),
    ...shell({
      kicker: copy.kicker,
      title: copy.title,
      body: `${fill(copy.intro, { ref })}\n\n${copy.contactSales}`,
      rows: [{ label: copy.reasonLabel, value: data.reason }],
    }),
  };
}
