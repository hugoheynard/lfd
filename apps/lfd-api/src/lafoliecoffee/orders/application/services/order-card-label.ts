import type {
  CardPaymentLabel,
  CardPaymentPayer,
} from "../../../../payment/channels/requests/index.js";
import type { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import type { OwnedOrder } from "../../domain/ports/order.reader.js";

/**
 * L'application, en valeur de métadonnée (`app`) puis en toutes lettres — 🔴
 * des valeurs lues dans le tableau de bord du prestataire pour pointer (plan
 * `documentation/payment/plan-pointage-stripe.md`, D3, Hugo le 2026-11-26).
 */
const APP_KEY = "la-folie-coffee";
const APP_NAME = "La Folie Coffee";

/** Le canal par lequel la commande se paie : la passation pro, la boutique, la saisie staff. */
export type OrderCardChannel = "pro" | "shop" | "staff";

/**
 * Le canal d'un acheteur connecté : la passation pro pour une société, la
 * boutique pour un particulier qui a un compte.
 */
export function orderCardChannelOf(companyId: string | null): OrderCardChannel {
  return companyId === null ? "shop" : "pro";
}

/**
 * Le canal d'une commande enregistrée : la saisie de l'équipe (`back_office`)
 * d'abord, sinon celui de son acheteur.
 */
export function placedOrderCardChannel(order: OwnedOrder): OrderCardChannel {
  return order.view.origin === "back_office" ? "staff" : orderCardChannelOf(order.companyId);
}

/** Le canal, tel que la description le dit. */
const CHANNEL_WORDS: Readonly<Record<OrderCardChannel, string>> = {
  pro: "pro",
  shop: "boutique",
  staff: "saisie staff",
};

/** Le mouvement : le paiement de la passation, ou le complément d'une hausse. */
export type OrderCardKind = "first" | "complement";

const KIND_WORDS: Readonly<Record<OrderCardKind, string>> = {
  first: "paiement",
  complement: "complément",
};

/** Ce que l'appelant sait de la commande au moment de préparer l'intention. */
export interface OrderCardLabelInput {
  readonly channel: OrderCardChannel;
  readonly kind: OrderCardKind;
  /** `null` à la passation : l'identifiant naît à l'écriture, après l'intention. */
  readonly orderId: string | null;
  /** `null` à la passation : le numéro naît à l'écriture, après l'intention. */
  readonly orderNumber: string | null;
  /** `null` : personne de connu ne paie (aucun client chez le prestataire). */
  readonly payer: CardPaymentPayer | null;
}

/**
 * **Le libellé d'une intention de commande** — `LFD · La Folie Coffee <canal>
 * · Commande n° <numéro> · <mouvement>`, le numéro seulement s'il existe déjà
 * (un complément) ; les métadonnées `app`, `channel`, `kind`, et
 * `subject_id` / `order_number` quand ils sont connus.
 */
export function orderCardLabel(input: OrderCardLabelInput): CardPaymentLabel {
  const parts = [
    "LFD",
    `${APP_NAME} ${CHANNEL_WORDS[input.channel]}`,
    ...(input.orderNumber === null ? [] : [`Commande n° ${input.orderNumber}`]),
    KIND_WORDS[input.kind],
  ];
  return {
    description: parts.join(" · "),
    metadata: {
      app: APP_KEY,
      channel: input.channel,
      kind: input.kind,
      ...(input.orderId === null ? {} : { subject_id: input.orderId }),
      ...(input.orderNumber === null ? {} : { order_number: input.orderNumber }),
    },
    ...(input.payer === null ? {} : { payer: input.payer }),
  };
}

/**
 * **Les clés de pointage d'une commande sur ce qui la touche sans intention
 * neuve** — un remboursement (plan-pointage-stripe.md, lot 3) : le numéro
 * lisible et l'application. Le canal n'y est pas : la lecture du sujet par le
 * bloc des cartes ne le porte pas.
 */
export function orderCardMetadata(orderNumber: string): Readonly<Record<string, string>> {
  return { app: APP_KEY, order_number: orderNumber };
}

/**
 * Le payeur connu de l'annuaire : son nom et son adresse, ou `null` s'il est
 * introuvable — l'intention part alors sans client, le paiement n'en dépend pas.
 */
export async function orderCardPayer(
  recipients: Pick<OrderRecipientReader, "findById">,
  userId: string,
): Promise<CardPaymentPayer | null> {
  const found = await recipients.findById(userId);
  if (found === null) {
    return null;
  }
  const name = [found.firstName, found.lastName ?? ""].join(" ").trim();
  return { userId, name, email: found.email };
}
