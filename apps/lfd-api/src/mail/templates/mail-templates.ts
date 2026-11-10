import type { ClientSheet, ContentLocale } from "@lfd/contracts";
import {
  sanitiseSubject,
  type LayoutInput,
  type LayoutRow,
  type TemplateRegistry,
} from "@lfd/mailer";

import type { B2bMails } from "../channels/templates/b2b-mails.js";
import { SELF_SERVICE_PASSWORD_TICKET_TTL_SECONDS } from "../../platform/identity/auth0-identity.gateway.js";
import { renderLayoutWithLogo, withMailLogo, type MailBody } from "./mail-logo.js";
import { withRenderedMailKey } from "./sections/mail-layout-scope.js";
import { DEFAULT_MAIL_LOCALE, fill, fillNamed, mailCopyOf } from "./copy/mail-copy.js";
import { contentOf } from "./order-mail-content.js";
import type { MailCopy, OrderSettlementCopy } from "./copy/mail-copy.model.js";
import { renderCollectionNoticeMail } from "./collection-notice-mail.js";
import { renderCustomerRequestMail } from "./customer-request-mail.js";
import { renderCustomerAccessOpenedMail } from "./customer-access-opened-mail.js";
import { renderInvoiceIssuedMail } from "./invoice-issued-mail.js";
import { renderMarketingConfirmMail } from "./marketing-confirm-mail.js";
import { renderOrderCancelledMail } from "./order-cancelled-mail.js";
import { orderPlacedRouteRows } from "./order-placed-route-rows.js";
import {
  renderOrderChangeAppliedMail,
  renderOrderChangeRefusedMail,
} from "./order-change-answer-mail.js";
import { renderOrderDelayedMail } from "./order-delayed-mail.js";
import { renderOrderRevisedMail } from "./order-revised-mail.js";
import { renderDeliveryEnRouteMail } from "./delivery-en-route-mail.js";
import { renderProductionDossierMail } from "./production-dossier-mail.js";
import { renderOrderShortfallMail } from "./order-shortfall-mail.js";
import { withAttachments } from "./order-sheet-mail-document.js";
import { pickupItinerary } from "./pickup-itinerary.js";
import { discountMailRows } from "./pickup-discount-mail-label.js";
import { qrPng } from "./qr-image.js";
import { renderVitrineNoticeMail } from "./vitrine-notice-mail.js";
import { renderSubAccountActivityMail } from "./sub-account-activity-mail.js";
import { renderSubAccountGestureMail } from "./sub-account-gesture-mail.js";

// La carte des e-mails est le contrat du bloc depuis le lot S3b
// (`mail/channels/templates/b2b-mails.ts`) : les blocs métier la lisent par le
// canal, le registre ci-dessous la rend.
export type { B2bMails };

/** Le corps d'un e-mail interne : des lignes « Libellé : valeur », puis le message. */
function detailsBody(details: readonly (readonly [string, string])[], message: string): string {
  const lines = details
    .filter(([, value]) => value.trim() !== "")
    .map(([label, value]) => `${label} : ${value}`);
  const trimmed = message.trim();
  return trimmed === "" ? lines.join("\n") : `${lines.join("\n")}\n\n« ${trimmed} »`;
}

/** Ce dont les gabarits ont besoin et qu'ils ne peuvent pas déduire. */
export interface MailBranding {
  /** L'adresse de recours — l'admin racine, la seule qui ne peut pas disparaître. */
  readonly supportEmail: string;
  /** Racine du back-office, pour les liens de retour. */
  readonly backOfficeUrl: string;
  /** L'URL publique de la face de l'enseigne. Absente ⇒ le repli système. */
  readonly brandFontUrl?: string;
}

/**
 * Les gabarits, **construits** avec la marque plutôt que déclarés à plat.
 *
 * Un `const` obligeait chaque gabarit à se souvenir du bandeau et de l'adresse
 * de recours ; le premier ajout les aurait oubliés, et personne ne l'aurait vu —
 * un e-mail sans recours ne produit aucune erreur, juste quelqu'un qui reste
 * bloqué. Ici, `person()` les pose pour tout le monde.
 */
/**
 * Un montant en centimes, dans la langue du destinataire.
 *
 * `Intl` et non un formateur français : « 1 234,56 € » et « €1,234.56 » ne
 * s'écrivent pas de la même façon, et un e-mail italien qui affiche des
 * séparateurs français a l'air d'un e-mail mal traduit — c'est-à-dire d'un
 * e-mail dont on se méfie.
 */
function money(cents: number, locale: ContentLocale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}

/**
 * Le récapitulatif, **dans l'ordre exact de l'écran de confirmation**.
 *
 * Un courriel qui recompose l'information fait douter qu'il parle de la même
 * commande — c'est pour ça que l'ordre est copié et non repensé.
 */
function recapRows(
  sheet: ClientSheet,
  locale: ContentLocale,
  settlement: keyof OrderSettlementCopy,
): readonly LayoutRow[] {
  const copy = mailCopyOf(locale)["customer.order-placed"];
  // Une commande de particulier composée en TTC écrit ses gestes tels qu'il
  // les a payés (plan du centime, lot C3) ; sinon, les montants HT figés.
  const ttc = sheet.money.ttcTerms;
  const voucherCents = ttc?.voucherCents ?? sheet.money.voucherDiscountCents;
  return [
    ...orderPlacedRouteRows(sheet, copy, locale),
    {
      label: copy.recapContent,
      value: contentOf(sheet.lines, { pieces: copy.recapPieces, weighed: copy.recapWeighed }),
    },
    ...discountMailRows(sheet, copy, (cents) => money(cents, locale), locale),
    ...(voucherCents === 0
      ? []
      : [{ label: copy.recapVoucher, value: `−${money(voucherCents, locale)}` }]),
    ...(sheet.money.settlement === "account"
      ? pretaxTotalRows(sheet, locale)
      : sheet.money.ttcByRate === undefined
        ? [
            { label: copy.recapVat, value: money(sheet.money.vatCents, locale) },
            {
              label: copy.totalLabel[settlement],
              value: money(sheet.money.totalCents, locale),
              strong: true,
            },
          ]
        : ticketTotalRows(sheet.money.totalCents, sheet.money.ttcByRate, locale, settlement)),
  ];
}

/**
 * **Le pied d'une commande composée en TTC** (`exact_ht`, plan
 * `documentation/pricing/obsolete/plan-centime-particuliers.md`, § 9 quinquies) : le total,
 * puis « dont TVA » par taux — le format du ticket. Chaque montant est LU sur
 * la part figée (`ttc_by_rate`), jamais reconstitué : un e-mail qui
 * recalculerait pourrait différer d'un centime du bon et de la facture.
 */
function ticketTotalRows(
  totalCents: number,
  parts: NonNullable<ClientSheet["money"]["ttcByRate"]>,
  locale: ContentLocale,
  settlement: keyof OrderSettlementCopy,
): readonly LayoutRow[] {
  const copy = mailCopyOf(locale)["customer.order-placed"];
  const rate = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return [
    { label: copy.totalLabel[settlement], value: money(totalCents, locale), strong: true },
    ...parts.map((part) => ({
      label: fill(copy.recapVatRate, { rate: rate.format(part.rate) }),
      value: money(part.vatCents, locale),
    })),
  ];
}

/**
 * **Le pied d'un pro au compte : le HT seul**, et où trouver le reste (F5,
 * plan `bons-et-facture-concordants`). Le HT est celui que le serveur a
 * calculé sur la feuille (`SheetMoney.pretaxCents`, plan L6) : lu, pas refait. Aucun chiffre de TVA ni
 * de TTC : la facture du mois les calcule une fois, sur tous les bons.
 */
function pretaxTotalRows(sheet: ClientSheet, locale: ContentLocale): readonly LayoutRow[] {
  const copy = mailCopyOf(locale)["customer.order-placed"];
  return [
    {
      label: copy.totalPretax,
      value: money(sheet.money.pretaxCents, locale),
      strong: true,
    },
    { label: copy.recapTaxLater, value: copy.recapTaxLaterValue },
  ];
}

/**
 * Le régime de la feuille, ramené aux trois libellés du courriel.
 *
 * `free` (total nul) garde le libellé qu'il avait avant que la feuille porte
 * le régime : celui du compte (décision du 2026-10-08, lot F5-0). Le régime,
 * lui, n'est plus deviné — la feuille le porte, calculé une fois côté commande.
 */
function settlementCopyKeyOf(sheet: ClientSheet): keyof OrderSettlementCopy {
  return sheet.money.settlement === "free" ? "account" : sheet.money.settlement;
}

/**
 * L'identifiant que le corps référence par `cid:`. Constant : il n'y a qu'une
 * image par message, et un identifiant tiré au sort rendrait le rendu
 * non-déterministe pour rien.
 */
const QR_CONTENT_ID = "qr-retrait";

/**
 * « 1 heure », dérivé du TTL réellement demandé au fournisseur plutôt qu'écrit
 * à la main : une durée annoncée qui ne serait plus celle du ticket ferait
 * chercher un lien encore valable qui ne l'est plus, ou l'inverse. Les mots
 * viennent du dictionnaire ; le compte et l'accord, d'ici.
 */
function selfServiceLinkValidity(locale: ContentLocale): string {
  const copy = mailCopyOf(locale)["customer.password-reset"];
  const hours = String(Math.round(SELF_SERVICE_PASSWORD_TICKET_TTL_SECONDS / 3600));
  const form =
    SELF_SERVICE_PASSWORD_TICKET_TTL_SECONDS >= 2 * 3600
      ? copy.validityHours
      : copy.validityOneHour;
  return fill(form, { count: hours });
}

/**
 * **Deux marques, deux publics** (Hugo, 2026-09-22 : « remplacer La Folie Douce
 * par La Folie Coffee dans ce contexte-là »).
 *
 * `La Folie Coffee` est l'enseigne que le CLIENT connaît — le nom de la
 * boutique, du domaine, et de ce qu'il a commandé. `La Folie Douce` est la
 * maison, celle que l'ÉQUIPE voit dans son back-office. Un courriel qui se
 * présente sous l'autre nom se lit comme une tentative d'hameçonnage : le
 * destinataire ne reconnaît pas l'expéditeur.
 *
 * 🔴 **Une seule coquille servait les deux jusqu'au 2026-09-22**, et elle posait
 * « La Folie Douce » pour tout le monde. Ce n'était pas une inattention : rien,
 * au point d'appel, ne rappelait à qui on écrivait. D'où deux coquilles dont le
 * NOM dit le public — se tromper demande désormais de l'écrire.
 */
const CUSTOMER_BRAND = "La Folie Coffee";
const STAFF_BRAND = "La Folie Douce";

/** La police de l'enseigne, si la marque en connaît l'URL. */
function fontOf(brand: MailBranding): { readonly brandFontUrl?: string } {
  return brand.brandFontUrl === undefined ? {} : { brandFontUrl: brand.brandFontUrl };
}

/**
 * Le logo d'en-tête joint à chaque e-mail, et chaque rendu qui sait QUEL
 * e-mail il rend : la coquille en lit l'ordre de ses sections (plan
 * `plan-textes-des-e-mails.md`, E4).
 */
/**
 * L'en-tête du courriel « prête » : l'annonce du colisage, l'annonce du RESTE
 * (un envoi de rang > 1, plan E7 reliquat, choix 17), ou le RAPPEL au
 * client qui n'est pas venu — qui ne dit plus « c'est prêt » mais « elle vous
 * attend au point de retrait … ». Le reste du courriel (QR, itinéraire) est
 * le même : c'est maintenant qu'il s'en sert.
 */
function orderReadyHeading(
  copy: MailCopy["customer.order-ready"],
  data: B2bMails["customer.order-ready"],
): { subject: string; kicker: string; title: string; intro: string } {
  const pickup = data.sheet.fulfillment.method === "pickup";
  if (data.reminder === true) {
    const site = data.sheet.fulfillment.pickupLabel;
    return {
      subject: copy.subjectReminder,
      kicker: copy.kickerReminder,
      title: copy.titleReminder,
      intro:
        site === null || site === ""
          ? copy.introReminderWithoutSite
          : fill(copy.introReminder, { site }),
    };
  }
  if (data.remainder !== undefined) {
    return {
      subject: copy.subjectRemainder,
      kicker: copy.kickerRemainder,
      title: pickup ? copy.titleRemainderPickup : copy.titleRemainderDelivery,
      intro: pickup ? copy.introRemainderPickup : copy.introRemainderDelivery,
    };
  }
  return {
    subject: copy.subject,
    kicker: copy.kicker,
    title: copy.title,
    intro: pickup ? copy.introPickup : copy.introDelivery,
  };
}

function framedRegistry(registry: TemplateRegistry<B2bMails>): TemplateRegistry<B2bMails> {
  return withMailLogo(withRenderedMailKey(registry));
}

export function b2bMailTemplates(brand: MailBranding): TemplateRegistry<B2bMails> {
  /**
   * La coquille d'un courriel adressé à un CLIENT — l'enseigne qu'il connaît.
   * Sans le recours « contactez votre administrateur » : il nomme l'adresse
   * de l'administrateur de la plateforme, qui n'est pas celle qu'un client
   * doit écrire (Hugo, 2026-10-28). L'équipe, elle, le garde.
   */
  const customerMail = (input: Omit<LayoutInput, "brand" | "supportEmail">): MailBody =>
    renderLayoutWithLogo({
      ...input,
      ...fontOf(brand),
      brand: CUSTOMER_BRAND,
    });

  /** La coquille d'un courriel adressé à l'ÉQUIPE — la maison. */
  const staffMail = (input: Omit<LayoutInput, "brand" | "supportEmail">): MailBody =>
    renderLayoutWithLogo({
      ...input,
      ...fontOf(brand),
      brand: STAFF_BRAND,
      supportEmail: brand.supportEmail,
    });

  /**
   * Les textes des e-mails qui ne portent pas de langue — l'équipe, et ceux
   * partis d'un geste du back-office : ils s'écrivent dans la langue de repli.
   * Relus À CHAQUE rendu, jamais gardés à la construction du registre : le
   * texte effectif dépend du périmètre de remplacement de l'envoi (C2).
   */
  const local = (): MailCopy => mailCopyOf(DEFAULT_MAIL_LOCALE);

  // Le logo d'en-tête : sa balise vient de \`renderLayoutWithLogo\`, sa pièce
  // jointe de \`withMailLogo\` — posée ICI une fois pour les 30 e-mails. Et
  // chaque rendu sait quel e-mail il rend (E4) : cf. `framedRegistry`.
  return framedRegistry({
    "customer.order-ready": (data) => {
      const copy = mailCopyOf(data.locale)["customer.order-ready"];
      const showQr = data.handoverToken !== null && data.handoverUrl !== "";
      const content =
        data.remainder === undefined
          ? contentOf(data.sheet.lines, { pieces: copy.piecesLabel, weighed: copy.weighedLabel })
          : fill(copy.piecesLabel, { count: String(data.remainder.pieces) });
      const heading = orderReadyHeading(copy, data);
      return {
        subject: sanitiseSubject(fill(heading.subject, { ref: data.sheet.reference })),
        ...customerMail({
          kicker: heading.kicker,
          title: heading.title,
          body: `${heading.intro}\n\n${data.sheet.reference}`,
          // Deux lignes et pas un décompte : où, et combien de pièces. Ce
          // courriel répond à UNE question — venir la chercher.
          rows: [
            {
              label: copy.whereLabel,
              value:
                data.sheet.fulfillment.pickupLabel ?? data.sheet.fulfillment.address?.ville ?? "—",
            },
            { label: copy.contentLabel, value: content },
          ],
          // Le QR, à NOUVEAU. Il était dans la confirmation, et le répéter n'est
          // pas une redite : c'est maintenant qu'on s'en sert, et personne ne
          // remonte un fil de courriels le téléphone à la main devant un
          // comptoir.
          ...(showQr
            ? {
                image: {
                  contentId: QR_CONTENT_ID,
                  alt: fill(copy.qrAlt, { ref: data.sheet.reference }),
                  sizePx: 180,
                  caption: `${copy.qrLine}\n${data.sheet.reference}`,
                },
              }
            : {}),
          ...pickupItinerary(data.sheet, data.pickupPoint, copy.itinerary),
          ...(data.orderUrl === "" ? {} : { cta: { label: copy.cta, url: data.orderUrl } }),
        }),
        ...(showQr
          ? {
              attachments: [
                {
                  filename: `retrait-${data.sheet.reference}.png`,
                  contentBase64: qrPng(data.handoverUrl).toString("base64"),
                  contentId: QR_CONTENT_ID,
                  contentType: "image/png",
                },
              ],
            }
          : {}),
      };
    },
    "customer.delivery-en-route": (data) => renderDeliveryEnRouteMail(data, customerMail),
    "customer.order-delayed": (data) => renderOrderDelayedMail(data, customerMail),
    "customer.collection-notice": (data) => renderCollectionNoticeMail(data, customerMail),
    "customer.invoice-issued": (data) => renderInvoiceIssuedMail(data, customerMail),
    "customer.order-cancelled": (data) => renderOrderCancelledMail(data, customerMail),
    "customer.order-change-applied": (data) => renderOrderChangeAppliedMail(data, customerMail),
    "customer.order-change-refused": (data) => renderOrderChangeRefusedMail(data, customerMail),
    // Le détail à jour : le récapitulatif de la passation, sur la feuille révisée.
    "customer.order-revised": (data) =>
      renderOrderRevisedMail(
        data,
        customerMail,
        recapRows(data.sheet, data.locale, settlementCopyKeyOf(data.sheet)),
      ),
    "customer.order-shortfall": (data) => renderOrderShortfallMail(data, customerMail),
    "customer.sub-account-activity": (data) => renderSubAccountActivityMail(data, customerMail),
    "customer.sub-account-gesture": (data) => renderSubAccountGestureMail(data, customerMail),
    "customer.order-placed": (data) => {
      const copy = mailCopyOf(data.locale)["customer.order-placed"];
      const settlement = settlementCopyKeyOf(data.sheet);
      const showQr = data.handoverToken !== null && data.handoverUrl !== "";
      return {
        subject: sanitiseSubject(fill(copy.subject, { ref: data.sheet.reference })),
        ...customerMail({
          kicker: copy.kicker,
          title: copy.title,
          body: fill(copy.intro, { ref: data.sheet.reference }),
          rows: recapRows(data.sheet, data.locale, settlement),
          // Le QR est DANS le corps, jamais en pièce jointe à ouvrir : c'est la
          // seule chose qu'on vient chercher debout devant un comptoir, et un
          // fichier à ouvrir sur un téléphone, la main sur la porte, ne se
          // scanne pas. La légende porte le NUMÉRO en clair — c'est le repli
          // quand un client bloque les images.
          ...(showQr
            ? {
                image: {
                  contentId: QR_CONTENT_ID,
                  alt: fill(copy.qrAlt, { ref: data.sheet.reference }),
                  sizePx: 180,
                  caption: `${copy.qrLine}\n${data.sheet.reference}`,
                },
              }
            : {}),
          // L'itinéraire vers le point de retrait (E4, S7) — rien pour une livraison.
          ...pickupItinerary(data.sheet, data.pickupPoint, copy.itinerary),
          // Pas de bouton quand l'origine de l'app cliente n'est pas connue :
          // un lien relatif est inerte dans une boîte mail, et un bouton qui ne
          // mène nulle part coûte plus qu'une absence de bouton.
          ...(data.orderUrl === "" ? {} : { cta: { label: copy.cta, url: data.orderUrl } }),
        }),
        ...withAttachments([
          ...(showQr
            ? [
                {
                  filename: `retrait-${data.sheet.reference}.png`,
                  contentBase64: qrPng(data.handoverUrl).toString("base64"),
                  contentId: QR_CONTENT_ID,
                  contentType: "image/png",
                },
              ]
            : []),
          // Le bon, pour pros et particuliers : le même document que l'archive.
          ...(data.document === null
            ? []
            : [
                {
                  filename: data.document.fileName,
                  contentBase64: data.document.pdfBase64,
                  contentType: "application/pdf",
                },
              ]),
        ]),
      };
    },
    "ops.deploy-check": (data) => {
      const copy = local()["ops.deploy-check"];
      return {
        subject: sanitiseSubject(fill(copy.subject, { revision: data.revision })),
        ...renderLayoutWithLogo({
          kicker: copy.kicker,
          title: copy.title,
          body: detailsBody(
            [
              [copy.revisionLabel, data.revision],
              [copy.senderLabel, data.fromAddress],
            ],
            copy.message,
          ),
          footer: copy.footer,
        }),
      };
    },
    "staff.account-alert": (data) => {
      const copy = local()["staff.account-alert"];
      const names = { company: data.companyName, rule: data.ruleLabel };
      return {
        subject: sanitiseSubject(fill(copy.subject, names)),
        ...renderLayoutWithLogo({
          kicker: copy.kicker,
          title: fill(copy.title, names),
          body: detailsBody(
            [
              [copy.accountLabel, data.companyName],
              [copy.orderLabel, data.orderNumber],
            ],
            data.findings.join("\n"),
          ),
          cta: { label: copy.cta, url: data.accountUrl },
        }),
      };
    },
    "customer.payment-failed": (data) => {
      const copy = mailCopyOf(data.locale)["customer.payment-failed"];
      return {
        subject: sanitiseSubject(fill(copy.subject, { ref: data.sheet.reference })),
        ...customerMail({
          kicker: copy.kicker,
          title: copy.title,
          // La conséquence SUIT la cause, dans le corps et pas dans un encadré :
          // c'est la phrase qui dit quoi faire, et un client qui ne lit qu'un
          // paragraphe doit tomber dessus.
          body: `${copy.intro}\n\n${copy.consequence}\n\n${data.sheet.reference}`,
          rows: [
            { label: copy.amountLabel, value: money(data.sheet.money.totalCents, data.locale) },
          ],
          // Pas de bouton quand l'origine cliente est inconnue : un lien relatif
          // est inerte dans une boîte mail, et le recours reste dans le pied.
          ...(data.settleUrl === "" ? {} : { cta: { label: copy.cta, url: data.settleUrl } }),
          footer: copy.footer,
        }),
      };
    },
    "customer.payment-expired": (data) => {
      const copy = mailCopyOf(data.locale)["customer.payment-expired"];
      return {
        subject: sanitiseSubject(fill(copy.subject, { ref: data.sheet.reference })),
        ...customerMail({
          kicker: copy.kicker,
          title: copy.title,
          body: `${copy.intro}\n\n${copy.consequence}\n\n${data.sheet.reference}`,
          rows: [
            { label: copy.amountLabel, value: money(data.sheet.money.totalCents, data.locale) },
          ],
          footer: copy.footer,
        }),
      };
    },
    "customer.order-modification-failed": (data) => {
      const copy = mailCopyOf(data.locale)["customer.order-modification-failed"];
      return {
        subject: sanitiseSubject(fill(copy.subject, { ref: data.sheet.reference })),
        ...customerMail({
          kicker: copy.kicker,
          title: copy.title,
          body: `${copy.intro}\n\n${copy.consequence}\n\n${data.sheet.reference}`,
          rows: [{ label: copy.amountLabel, value: money(data.complementCents, data.locale) }],
          footer: copy.footer,
        }),
      };
    },
    "customer.order-payment-link": (data) => {
      // Pas de locale : la comptabilité écrit en français (cf. `B2bMails`).
      const copy = local()["customer.order-payment-link"];
      return {
        subject: sanitiseSubject(fill(copy.subject, { ref: data.reference })),
        ...customerMail({
          kicker: copy.kicker,
          title: copy.title,
          body: `${fill(copy.intro, { ref: data.reference })}\n\n${copy.howToPay}`,
          rows: [{ label: copy.amountLabel, value: money(data.totalCents, DEFAULT_MAIL_LOCALE) }],
          cta: { label: copy.cta, url: data.settleUrl },
          footer: copy.footer,
        }),
      };
    },
    "customer.access-opened": (data) => renderCustomerAccessOpenedMail(data, customerMail),
    "customer.marketing-confirm": (data) => renderMarketingConfirmMail(data, customerMail),
    "staff.invited": (data) => {
      const copy = local()["staff.invited"];
      return {
        subject: sanitiseSubject(copy.subject),
        ...staffMail({
          kicker: copy.kicker,
          title: fillNamed(copy.title, copy.titleWithoutName, data.firstName),
          body: `${copy.opened}\n\n${copy.choosePassword}`,
          cta: { label: copy.cta, url: data.passwordSetupUrl },
          footer: copy.footer,
        }),
      };
    },
    "customer.order-placed-with-your-email": (data) => {
      const copy = local()["customer.order-placed-with-your-email"];
      return {
        subject: sanitiseSubject(copy.subject),
        ...customerMail({
          kicker: copy.kicker,
          title: fillNamed(copy.title, copy.titleWithoutName, data.firstName),
          body: `${copy.intro}\n\n${copy.ifItIsYou}`,
          footer: copy.footer,
        }),
      };
    },
    "customer.login-method-linked": (data) => {
      const copy = local()["customer.login-method-linked"];
      const method = { method: data.methodLabel };
      return {
        subject: sanitiseSubject(fill(copy.subject, method)),
        ...customerMail({
          kicker: copy.kicker,
          title: fillNamed(copy.title, copy.titleWithoutName, data.firstName),
          body: `${fill(copy.linked, method)}\n\n${copy.sameAccount}`,
          footer: copy.footer,
        }),
      };
    },
    "customer.password-reset": (data) => {
      const copy = local()["customer.password-reset"];
      const validity = selfServiceLinkValidity(DEFAULT_MAIL_LOCALE);
      return {
        subject: sanitiseSubject(copy.subject),
        ...customerMail({
          kicker: copy.kicker,
          title: copy.title,
          // Ce qu'on SAIT, et rien de plus : un lien est parti, il expire, il
          // faut le suivre pour choisir. Ce qu'il advient du mot de passe actuel
          // et des sessions ouvertes n'est vérifié nulle part — cf. le JSDoc du
          // gabarit dans la carte, plus haut.
          body: `${copy.requested}\n\n${fill(copy.linkRules, { validity })}`,
          cta: { label: copy.cta, url: data.passwordSetupUrl },
          footer: copy.footer,
        }),
      };
    },
    "customer.company-attached": (data) => {
      const copy = local()["customer.company-attached"];
      const company = { company: data.companyName };
      return {
        subject: sanitiseSubject(fill(copy.subject, company)),
        ...customerMail({
          kicker: copy.kicker,
          title: fillNamed(copy.title, copy.titleWithoutName, data.firstName),
          body: `${fill(copy.attached, company)}\n\n${copy.nothingToCreate}`,
          footer: copy.footer,
        }),
      };
    },
    "customer.mandate-to-sign": (data) => {
      // Le texte qui dépend du schéma est indexé par lui, au dictionnaire.
      const copy = local()["customer.mandate-to-sign"];
      const wording = copy.scheme[data.scheme];
      const document = { document: wording.documentName };
      return {
        subject: sanitiseSubject(fill(copy.subject, { ...document, ref: data.reference })),
        ...customerMail({
          kicker: copy.kicker,
          title: fill(copy.title, document),
          body: `${copy.greeting}\n\n${fill(copy.intro, { ...document, company: data.companyName })}`,
          rows: [
            { label: copy.mandateReferenceLabel, value: data.reference },
            { label: copy.creditorIdentifierLabel, value: data.creditorIdentifier },
            { label: copy.creditorLabel, value: data.creditorName },
          ],
          footer: wording.footer,
        }),
        attachments: [
          {
            filename: data.fileName,
            contentBase64: data.pdfBase64,
            contentType: "application/pdf",
          },
        ],
      };
    },
    "staff.appointment-booked": (data) => {
      const copy = local()["staff.appointment-booked"];
      return {
        subject: sanitiseSubject(
          fill(copy.subject, { contact: data.contactName, when: data.when }),
        ),
        ...renderLayoutWithLogo({
          kicker: copy.kicker,
          title: copy.title,
          body: detailsBody(
            [
              [copy.contactLabel, data.contactName],
              [copy.whenLabel, data.when],
              [copy.purposeLabel, data.purposeLabel],
              [copy.channelLabel, data.channelLabel],
            ],
            data.message,
          ),
          cta: { label: copy.cta, url: data.appointmentUrl },
          footer: copy.footer,
        }),
      };
    },

    "staff.support-requested": (data) => {
      const copy = local()["staff.support-requested"];
      return {
        subject: sanitiseSubject(
          fill(copy.subject, { contact: data.contactName, purpose: data.purposeLabel }),
        ),
        ...renderLayoutWithLogo({
          kicker: copy.kicker,
          title: copy.title,
          body: detailsBody(
            [
              [copy.contactLabel, data.contactName],
              [copy.purposeLabel, data.purposeLabel],
              [copy.availabilityLabel, data.availability],
              [copy.phoneLabel, data.phoneNumber],
            ],
            data.message,
          ),
          footer: copy.footer,
        }),
      };
    },
    "staff.production-dossier": (data) => renderProductionDossierMail(data, staffMail),
    "agency.vitrine-notice": (data) => renderVitrineNoticeMail(data, staffMail),
    "staff.customer-request": (data) =>
      renderCustomerRequestMail(data, staffMail, brand.backOfficeUrl),
    "staff.password-reset": (data) => {
      const copy = local()["staff.password-reset"];
      return {
        subject: sanitiseSubject(copy.subject),
        ...staffMail({
          kicker: copy.kicker,
          title: fillNamed(copy.title, copy.titleWithoutName, data.firstName),
          body: `${copy.issued}\n\n${copy.linkRules}`,
          cta: { label: copy.cta, url: data.passwordSetupUrl },
        }),
      };
    },
    "staff.access-suspended": (data) => {
      const copy = local()["staff.access-suspended"];
      return {
        subject: sanitiseSubject(copy.subject),
        ...staffMail({
          kicker: copy.kicker,
          title: fillNamed(copy.title, copy.titleWithoutName, data.firstName),
          body: `${copy.suspended}\n\n${copy.whatRemains}`,
          // Pas de bouton : proposer « se connecter » à quelqu'un dont la porte est
          // fermée l'enverrait se heurter à un refus, ce qu'il vient de lire.
          footer: copy.footer,
        }),
      };
    },
    "staff.access-restored": (data) => {
      const copy = local()["staff.access-restored"];
      return {
        subject: sanitiseSubject(copy.subject),
        ...staffMail({
          kicker: copy.kicker,
          title: fillNamed(copy.title, copy.titleWithoutName, data.firstName),
          body: `${copy.restored}\n\n${copy.howToSignIn}`,
          cta: { label: copy.cta, url: data.backOfficeUrl },
        }),
      };
    },
  });
}
