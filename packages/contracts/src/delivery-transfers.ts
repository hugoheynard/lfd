import { z } from "zod";

import { closeStopWithoutHandoverPayloadSchema } from "./delivery-doorstep.js";

/**
 * **Le manifeste d'un transfert interne** (2026-10-13, plan du transfert
 * interne, lot T1 ; décision de Hugo : « on doit savoir ce qu'on
 * transporte »).
 *
 * Un même transfert porte EN MÊME TEMPS des commandes (retraits au site) et
 * du réapprovisionnement de la boutique du site (non bâti) : deux sections, chacune
 * détaillée par élément et totalisée par SKU, et un total tous genres
 * confondus. Les deux genres ont le MÊME format de ligne — le réapprovisionnement s'y
 * branchera sans le changer.
 *
 * Calculé à la lecture tant que le transfert n'est pas parti ; FIGÉ au départ
 * ensuite (`frozen`), la référence de la réception au site.
 */

/** Une ligne : un SKU, son libellé figé à la passation, une quantité. */
export interface TransferManifestLineView {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/** Ce que contient un élément du transfert. */
export interface TransferManifestItemView {
  readonly itemId: string;
  readonly kind: "order" | "resupply";
  /** La commande (ou le réapprovisionnement) — identifiant opaque. */
  readonly subjectId: string;
  readonly lines: readonly TransferManifestLineView[];
}

export interface TransferManifestSectionView {
  readonly items: readonly TransferManifestItemView[];
  /** Par SKU, dans l'ordre de première apparition. */
  readonly totals: readonly TransferManifestLineView[];
}

export interface InternalTransferManifestView {
  readonly transferId: string;
  readonly day: string;
  readonly siteLabel: string;
  /** Parti le (instant ISO), ou `null` : prévu. */
  readonly departedAt: string | null;
  /** `true` : le manifeste est celui figé au départ ; `false` : calculé à l'instant. */
  readonly frozen: boolean;
  readonly orders: TransferManifestSectionView;
  readonly resupplies: TransferManifestSectionView;
  /** Tous genres confondus, par SKU. */
  readonly totals: readonly TransferManifestLineView[];
}

/**
 * **« Remis au site »** (lot T2) — `POST /admin/delivery/my-round/:roundId/
 * stops/:stopId/site-drop`, sous `delivery_doorstep` → 204, idempotente. La
 * même forme que la clôture sans remise : la version lue, la position facultative.
 */
export const dropTransferAtSitePayloadSchema = closeStopWithoutHandoverPayloadSchema;
export type DropTransferAtSitePayload = z.infer<typeof dropTransferAtSitePayloadSchema>;

/** Un motif de réception manuelle : au plus (le domaine le revérifie). */
export const TRANSFER_RECEPTION_REASON_MAX = 500;

/**
 * **« Réceptionner »** au comptoir (lot T2) — `POST /admin/handover/orders/
 * :orderId/transfer-reception`, sous `handover_counter` → 204. Le motif est
 * obligatoire quand le transfert n'est parti dans aucune tournée ; le domaine
 * le dit, le contrat n'en vérifie que la forme.
 */
export const receiveTransferPayloadSchema = z.object({
  reason: z.string().max(TRANSFER_RECEPTION_REASON_MAX).nullable(),
});
export type ReceiveTransferPayload = z.infer<typeof receiveTransferPayloadSchema>;

/** Où en est le transfert d'une commande, vu du comptoir (lot T2). */
export type OrderTransferStateView = "planned" | "departed" | "received";

/** Le transfert qui porte une commande du site, dans la file du comptoir. */
export interface OrderTransferView {
  readonly transferId: string;
  readonly siteLabel: string;
  readonly state: OrderTransferStateView;
  /** Instant ISO de l'état. */
  readonly at: string;
}

/**
 * **L'arrêt de transfert dans « Ma tournée »** (lot T2) — le site, l'heure
 * d'arrivée requise si on la sait, et ce que l'arrêt transporte, totalisé par
 * SKU. Aucun client, aucune adresse de client.
 */
export interface DriverTransferStopView {
  readonly stopId: string;
  readonly transferId: string;
  readonly position: number;
  /** Instant ISO de la clôture (« Remis au site »), ou `null`. */
  readonly closedAt: string | null;
  readonly siteLabel: string;
  /** Les commandes portées. */
  readonly orderCount: number;
  /** Reçu au site (instant ISO) — par le livreur ou au comptoir — ou `null`. */
  readonly receivedAt: string | null;
  /** Le manifeste, tous genres confondus, par SKU. */
  readonly totals: readonly TransferManifestLineView[];
}
