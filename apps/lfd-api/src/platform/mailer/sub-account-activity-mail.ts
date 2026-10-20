import { sanitiseSubject, type LayoutInput, type LayoutRow, type RenderedMail } from "@lfd/mailer";

/**
 * Ce que le site a fait — un mot par ligne du courriel, pas par clé du
 * tableau : « annulée » et « abandonnée » partagent la clé `order_cancelled`
 * (`plan-notifications-sous-comptes.md`, §1) mais ne se disent pas pareil.
 */
export type SubAccountActivity = "placed" | "cancelled" | "abandoned" | "payment_failed";

/**
 * Les données de l'avis **« un de vos sites a… »** (plan
 * `documentation/comptes-client/plan-notifications-sous-comptes.md`, N2).
 * Destinataire : un membre accepté du PRINCIPAL, au rôle coché.
 *
 * Il ne nomme que le SITE (Q4) : ni le nom, ni l'adresse, ni le rôle de la
 * personne qui a agi. Il ne porte aucun lien : le principal n'entre pas dans
 * l'espace de ses sous-comptes (S6 non bâti).
 */
export interface SubAccountActivityMailData {
  readonly activity: SubAccountActivity;
  /** Le nom d'usage du site — l'enseigne, à défaut la raison sociale. */
  readonly siteName: string;
  readonly orderNumber: string;
  /** Centimes TTC, ou `null` : le site ne suivait ni `billing` ni `pricing` à la passation (Q1). */
  readonly totalCents: number | null;
  /** Le jour demandé (`YYYY-MM-DD`), ou `null`. */
  readonly requestedFor: string | null;
  /** La commande a été saisie par l'équipe au nom du site. */
  readonly enteredByTeam: boolean;
}

/** La coquille client, prêtée par le registre. */
export type SubAccountActivityShell = (
  input: Omit<LayoutInput, "brand" | "supportEmail">,
) => string;

const VERB: Readonly<Record<SubAccountActivity, string>> = {
  placed: "a passé la commande",
  cancelled: "a vu sa commande annulée",
  abandoned: "a abandonné le règlement de la commande",
  payment_failed: "n'a pas pu régler la commande",
};

const TITLE: Readonly<Record<SubAccountActivity, string>> = {
  placed: "Commande passée par un de vos sites",
  cancelled: "Commande annulée sur un de vos sites",
  abandoned: "Règlement abandonné sur un de vos sites",
  payment_failed: "Paiement échoué sur un de vos sites",
};

/**
 * Le rendu. Français seul : aucune langue n'est encore choisie pour un
 * client, et ce courriel n'a pas d'entrée au dictionnaire des autres
 * (`mail-copy.*`), comme `customer.order-payment-link`.
 */
export function renderSubAccountActivityMail(
  data: SubAccountActivityMailData,
  shell: SubAccountActivityShell,
): RenderedMail {
  return {
    subject: sanitiseSubject(`${data.siteName} — ${TITLE[data.activity]} (${data.orderNumber})`),
    html: shell({
      title: TITLE[data.activity],
      body: bodyOf(data),
      rows: rowsOf(data),
      footer:
        "Vous recevez ce message parce que ce site est rattaché à votre compte. " +
        "Pour ne plus le recevoir, écrivez-nous : nous réglons ces avis rôle par rôle.",
    }),
  };
}

function bodyOf(data: SubAccountActivityMailData): string {
  const team = data.enteredByTeam ? " (commande saisie par notre équipe)" : "";
  return `Votre site ${data.siteName} ${VERB[data.activity]} ${data.orderNumber}${team}.`;
}

function rowsOf(data: SubAccountActivityMailData): readonly LayoutRow[] {
  const day = dayInWords(data.requestedFor);
  return [
    { label: "Site", value: data.siteName },
    { label: "Commande", value: data.orderNumber },
    ...(day === null ? [] : [{ label: "Pour le", value: day }]),
    ...(data.totalCents === null
      ? []
      : [{ label: "Montant TTC", value: euros(data.totalCents), strong: true }]),
  ];
}

function euros(cents: number): string {
  return new Intl.NumberFormat("fr", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** « mardi 13 octobre » — lu en UTC : un jour de service n'a pas de fuseau. */
function dayInWords(requestedFor: string | null): string | null {
  if (requestedFor === null) {
    return null;
  }
  const date = new Date(`${requestedFor.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("fr", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}
