import type { OrderRevisionQuotePayload, RequestKind } from "@lfd/contracts";

/**
 * Une photo jointe, telle que la demande la garde : sa clé de stockage et ce
 * qu'on en a relu au dépôt. Purgée (`purgedAt` posé) : clé et type vides.
 */
export interface RequestPhotoRef {
  readonly id: string;
  readonly position: number;
  readonly storageKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly createdAt: Date;
  readonly purgedAt: Date | null;
}

/** La commande d'un signalement : son identifiant opaque et son numéro figé. */
export interface ReportedOrderRef {
  readonly id: string;
  readonly number: string;
}

/** « Nous écrire » : rien au-delà de l'enveloppe. */
export interface ContactDetails {
  readonly kind: "contact";
}

/** « Signaler un problème » : la commande (vidée à l'anonymisation) et les photos. */
export interface OrderProblemDetails {
  readonly kind: "order_problem";
  readonly order: ReportedOrderRef | null;
  readonly photos: readonly RequestPhotoRef[];
}

/**
 * La composition demandée — le corps d'une révision de commande, sans la
 * révision portée (plan `documentation/commandes/plan-modifier-une-commande.md`,
 * M4). La demande ne la juge pas : c'est la révision qui la jugera, au moment
 * où le commerce l'applique.
 */
export type RequestedOrderChange = OrderRevisionQuotePayload;

/** La réponse du commerce : appliquée (la révision produite), ou refusée avec un mot. */
export type OrderChangeDecision =
  | { readonly kind: "applied"; readonly revision: number }
  | { readonly kind: "refused"; readonly reason: string };

/**
 * « Demander une modification » (M4) : la commande, la révision sur laquelle
 * le client a composé, la composition demandée — vidées à l'anonymisation —,
 * et la réponse.
 */
export interface OrderChangeDetails {
  readonly kind: "order_change";
  readonly order: ReportedOrderRef | null;
  readonly baseRevision: number;
  readonly change: RequestedOrderChange | null;
  readonly decision: OrderChangeDecision | null;
}

/**
 * **Les détails PROPRES au type d'une demande**, en union discriminée
 * (`demandes-clients.md`, précision du 2026-10-09). L'enveloppe
 * (`CustomerRequest`) ne les lit que par les fonctions ci-dessous : un type
 * neuf (`QuoteDetails`, `AppointmentDetails`) est une variante de plus et une
 * entrée de plus dans {@link DETAIL_RULES} — que le compilateur exige.
 */
export type CustomerRequestDetails = ContactDetails | OrderProblemDetails | OrderChangeDetails;

/** Un détail qui admet des photos : il porte une liste `photos`. */
export type PhotoBearingDetails = Extract<CustomerRequestDetails, { readonly photos: unknown }>;

type DetailsOf<K extends RequestKind> = Extract<CustomerRequestDetails, { readonly kind: K }>;

interface DetailRule<D extends CustomerRequestDetails> {
  /** Les détails vidés de ce qui relie la demande à une personne, et les clés de stockage à purger. */
  readonly anonymize: (details: D, at: Date) => { readonly details: D; readonly purge: string[] };
}

/** Une règle par type : `Record` sur `RequestKind`, un type oublié ne compile pas. */
const DETAIL_RULES: { readonly [K in RequestKind]: DetailRule<DetailsOf<K>> } = {
  contact: { anonymize: (details) => ({ details, purge: [] }) },
  order_problem: {
    anonymize: (details, at) => ({
      details: { ...details, order: null, photos: details.photos.map((p) => purged(p, at)) },
      purge: details.photos.filter((p) => p.purgedAt === null).map((p) => p.storageKey),
    }),
  },
  // La composition porte une adresse et une note ; le mot d'un refus peut
  // nommer quelqu'un. La révision de départ et la NATURE de la réponse restent.
  order_change: {
    anonymize: (details) => ({
      details: {
        ...details,
        order: null,
        change: null,
        decision:
          details.decision?.kind === "refused" ? { kind: "refused", reason: "" } : details.decision,
      },
      purge: [],
    }),
  },
};

/** Applique la règle d'anonymisation du type de ces détails. */
export function anonymizeDetails(details: CustomerRequestDetails, at: Date): Anonymized {
  // L'entrée choisie par `details.kind` est celle de ce type : le compilateur
  // ne sait pas corréler la clé et la variante, d'où l'élargissement.
  const anonymize = DETAIL_RULES[details.kind].anonymize as (
    d: CustomerRequestDetails,
    at: Date,
  ) => Anonymized;
  return anonymize(details, at);
}

interface Anonymized {
  readonly details: CustomerRequestDetails;
  readonly purge: string[];
}

/** Ces détails admettent-ils des photos ? */
export function bearsPhotos(details: CustomerRequestDetails): details is PhotoBearingDetails {
  return "photos" in details;
}

/** La clé d'une photo dans le stockage — dérivée d'identifiants du serveur, jamais du client. */
export function requestPhotoKey(requestId: string, photoId: string): string {
  return `requests/${requestId}/${photoId}`;
}

function purged(photo: RequestPhotoRef, at: Date): RequestPhotoRef {
  if (photo.purgedAt !== null) {
    return photo;
  }
  return { ...photo, storageKey: "", contentType: "", sizeBytes: 0, purgedAt: at };
}
