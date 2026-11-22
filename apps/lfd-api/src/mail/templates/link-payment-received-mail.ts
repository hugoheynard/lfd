import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

import { DEFAULT_MAIL_LOCALE, fill, mailCopyOf } from "./copy/mail-copy.js";
import type { LinkPaymentReceivedCopy } from "./copy/mail-copy.model.js";
import type { MailBody } from "./mail-logo.js";

/**
 * Les données de l'**avis d'un paiement reçu par un lien** (plan
 * `documentation/payment/liens-de-paiement/plan-le-lien-vers-un-sujet.md`,
 * §2.4). Destinataire : la boîte de l'équipe. Tout y est déjà libellé par le
 * bloc `payment` : le gabarit ne sait ni ce qu'est une commande, ni ce
 * qu'est une application.
 */
export interface LinkPaymentReceivedMailData {
  /** Le montant encaissé, en centimes. */
  readonly amountCents: number;
  /** Le compte qui a encaissé et son prestataire (« lfc-stripe (Stripe) »). */
  readonly channelLabel: string;
  /** Le nom du client, figé à l'ouverture du lien. */
  readonly payerLabel: string;
  /** Le libellé de l'origine du lien au registre (« La Folie Coffee »). */
  readonly applicationLabel: string;
  /** Ce que le paiement règle, tel que le sujet le décrit. */
  readonly settledLabel: string;
  /** Le chemin de l'écran du back-office qui ouvre le sujet (« /comptabilite/… »). */
  readonly screenPath: string;
  /** La création du lien, déjà mise en forme (heure de Paris). */
  readonly linkCreatedOn: string;
  /** Vrai : le lien a été ouvert par le système, sans geste de l'équipe. */
  readonly linkCreatedAutomatically: boolean;
  /** Le nom du membre de l'équipe qui l'a créé ; vide : système, ou nom inconnu. */
  readonly linkAuthorName: string;
  /** Vrai : le sujet a refusé l'encaissement, et le remboursement est demandé. */
  readonly refused: boolean;
}

/** La coquille sans marque des alertes internes. */
type InternalShell = (input: LayoutInput) => MailBody;

/**
 * Le rendu. Sans racine du back-office, pas de bouton : un lien relatif ne
 * mènerait nulle part depuis une boîte de réception.
 */
export function renderLinkPaymentReceivedMail(
  data: LinkPaymentReceivedMailData,
  shell: InternalShell,
  backOfficeUrl: string,
): RenderedMail {
  const copy = mailCopyOf(DEFAULT_MAIL_LOCALE)["staff.link-payment-received"];
  const amount = euros(data.amountCents);
  const names = { amount, payer: data.payerLabel };
  const provenance = provenanceOf(data, copy);
  const lines: readonly (readonly [string, string])[] = [
    [copy.amountLabel, amount],
    [copy.payerLabel, data.payerLabel],
    [copy.settledLabel, data.settledLabel],
    [copy.applicationLabel, data.applicationLabel],
    [copy.channelLabel, data.channelLabel],
    [copy.linkLabel, provenance],
    [copy.outcomeLabel, data.refused ? copy.outcomeRefused : copy.outcomePaid],
  ];
  const body = lines
    .filter(([, value]) => value.trim() !== "")
    .map(([label, value]) => `${label} : ${value}`)
    .join("\n");
  return {
    subject: sanitiseSubject(fill(data.refused ? copy.subjectRefused : copy.subject, names)),
    ...shell({
      kicker: copy.kicker,
      title: data.refused ? copy.titleRefused : copy.title,
      body,
      ...(backOfficeUrl === "" || data.screenPath === ""
        ? {}
        : { cta: { label: copy.cta, url: `${backOfficeUrl}${data.screenPath}` } }),
      footer: copy.footer,
    }),
  };
}

/** Qui a créé le lien : le système, un membre nommé, ou un membre dont le nom manque. */
function provenanceOf(data: LinkPaymentReceivedMailData, copy: LinkPaymentReceivedCopy): string {
  const day = data.linkCreatedOn;
  if (data.linkCreatedAutomatically) {
    return fill(copy.linkBySystem, { day });
  }
  const author = data.linkAuthorName.trim();
  return author === "" ? fill(copy.linkByTeam, { day }) : fill(copy.linkByName, { author, day });
}

function euros(cents: number): string {
  return new Intl.NumberFormat(DEFAULT_MAIL_LOCALE, { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
}
