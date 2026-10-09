import type {
  CustomerAudience,
  CustomerRequestDetailsView,
  CustomerRequestView,
  RequestKind,
} from "@lfd/contracts";

import { CustomerRequest } from "../domain/customer-request.js";
import type {
  CustomerRequestDetails,
  RequestPhotoRef,
} from "../domain/customer-request-details.js";
import { ContactAudienceUnreadableError } from "./contact-audience-unreadable.error.js";

/** Une ligne de photo, telle que Prisma la rend. */
export interface PhotoRow {
  readonly id: string;
  readonly position: number;
  readonly storageKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly createdAt: Date;
  readonly purgedAt: Date | null;
}

/** Une ligne de demande avec ses photos (par rang). */
export interface RequestRow {
  readonly id: string;
  readonly kind: RequestKind;
  readonly reasonId: string;
  readonly reasonLabel: string;
  readonly priority: "low" | "medium" | "urgent";
  readonly audience: "b2b" | "b2c" | "both";
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authorPhone: string;
  readonly body: string;
  readonly userId: string | null;
  readonly companyId: string | null;
  readonly orderId: string | null;
  readonly orderNumber: string | null;
  readonly receivedAt: Date;
  readonly handledAt: Date | null;
  readonly handledByStaffId: string | null;
  readonly handledByName: string | null;
  readonly anonymizedAt: Date | null;
  readonly photos: readonly PhotoRow[];
}

/** Les photos lues par rang, pour toute lecture d'une demande. */
export const PHOTOS_BY_POSITION = { photos: { orderBy: { position: "asc" as const } } };

type DetailsOf<K extends RequestKind> = Extract<CustomerRequestDetails, { readonly kind: K }>;

/**
 * Les colonnes typées → les détails de chaque type (OCP : un type neuf ajoute
 * une entrée, que le `Record` exige).
 */
const DETAILS_FROM_ROW: { readonly [K in RequestKind]: (row: RequestRow) => DetailsOf<K> } = {
  contact: () => ({ kind: "contact" }),
  order_problem: (row) => ({
    kind: "order_problem",
    order:
      row.orderId === null || row.orderNumber === null
        ? null
        : { id: row.orderId, number: row.orderNumber },
    photos: row.photos.map((photo): RequestPhotoRef => ({ ...photo })),
  }),
};

/** Les détails → leur vue, sans clé de stockage (le front passe par la route gardée). */
const DETAILS_VIEW: {
  readonly [K in RequestKind]: (details: DetailsOf<K>) => CustomerRequestDetailsView;
} = {
  contact: () => ({ kind: "contact" }),
  order_problem: (details) => ({
    kind: "order_problem",
    orderId: details.order?.id ?? null,
    orderNumber: details.order?.number ?? null,
    photos: details.photos
      .filter((photo) => photo.purgedAt === null)
      .map((photo) => ({ id: photo.id, position: photo.position })),
  }),
};

/** Une demande est écrite depuis un espace, jamais depuis « les deux » : la base l'a mal gardée. */
function audienceOfRow(row: RequestRow): CustomerAudience {
  if (row.audience === "both") {
    throw new ContactAudienceUnreadableError(row.id);
  }
  return row.audience;
}

export function detailsOfRow(row: RequestRow): CustomerRequestDetails {
  const build = DETAILS_FROM_ROW[row.kind] as (r: RequestRow) => CustomerRequestDetails;
  return build(row);
}

export function detailsView(details: CustomerRequestDetails): CustomerRequestDetailsView {
  const view = DETAILS_VIEW[details.kind] as (
    d: CustomerRequestDetails,
  ) => CustomerRequestDetailsView;
  return view(details);
}

export function toDomain(row: RequestRow): CustomerRequest {
  return CustomerRequest.rehydrate({
    id: row.id,
    reason: { id: row.reasonId, labelFr: row.reasonLabel, priority: row.priority },
    audience: audienceOfRow(row),
    author: { name: row.authorName, email: row.authorEmail, phone: row.authorPhone },
    body: row.body,
    userId: row.userId,
    companyId: row.companyId,
    receivedAt: row.receivedAt,
    handling:
      row.handledAt === null
        ? null
        : {
            at: row.handledAt,
            by: {
              staffUserId: row.handledByStaffId ?? "",
              name: row.handledByName ?? "",
              role: "",
            },
          },
    anonymizedAt: row.anonymizedAt,
    details: detailsOfRow(row),
  });
}

export function toView(row: RequestRow): CustomerRequestView {
  return {
    id: row.id,
    kind: row.kind,
    reasonId: row.reasonId,
    reasonLabel: row.reasonLabel,
    priority: row.priority,
    audience: audienceOfRow(row),
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    authorPhone: row.authorPhone,
    message: row.body,
    userId: row.userId,
    companyId: row.companyId,
    receivedAt: row.receivedAt.toISOString(),
    handledAt: row.handledAt?.toISOString() ?? null,
    // Un agent que l'annuaire ne connaissait pas a été figé sans nom : on ne l'invente pas.
    handledBy: row.handledByName === null || row.handledByName === "" ? null : row.handledByName,
    anonymizedAt: row.anonymizedAt?.toISOString() ?? null,
    details: detailsView(detailsOfRow(row)),
  };
}

/** Les colonnes typées des détails : `order_*` pour qui en porte, `NULL` sinon. */
export function orderColumnsOf(details: CustomerRequestDetails): {
  readonly orderId: string | null;
  readonly orderNumber: string | null;
} {
  const order = "order" in details ? details.order : null;
  return { orderId: order?.id ?? null, orderNumber: order?.number ?? null };
}

/** Les photos des détails, `[]` pour un type qui n'en porte pas. */
export function photosOf(details: CustomerRequestDetails): readonly RequestPhotoRef[] {
  return "photos" in details ? details.photos : [];
}
