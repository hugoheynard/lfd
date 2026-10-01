import { z } from "zod";

/**
 * **À la porte** — ce que le livreur déclare sur un arrêt de SA tournée, et ce
 * que l'admin en relit (`documentation/livraisons/plan-a-la-porte.md`, § 3,
 * AP-D2, AP-D6, AP-D7, AP-D9).
 *
 * Routes du livreur (`admin/livraison/ma-tournee/:roundId…`, sous
 * `delivery_doorstep`, le même mur que « Ma tournée ») :
 * - `POST /arrets/:stopId/arrivee` → 204, idempotente ;
 * - `POST /incidents` (multipart : {@link reportDeliveryIncidentFieldsSchema}
 *   + `photo` facultative) → {@link ReportedDeliveryIncidentResponse} ;
 * - `POST /arrets/:stopId/cloture-sans-remise` (corps
 *   {@link closeStopWithoutHandoverPayloadSchema}) → 204, idempotente ;
 * - `GET /incidents/:incidentId/photo` → l'image ;
 * - `POST /retour` → 204, idempotente — « Tournée terminée »
 *   (`parcours-du-livreur.md`, PL2).
 *
 * Et l'admin, depuis Tournées : `POST admin/livraison/tournees/:roundId/retour`
 * → 204, sous `delivery_rounds:write`.
 *
 * Routes de l'admin (`admin/livraison…`, sous `delivery_rounds:read`) :
 * - `GET incidents?date=AAAA-MM-JJ` → {@link DeliveryIncidentsDayView} ;
 * - `GET non-remis` → {@link UndeliveredStopsView} ;
 * - `GET incidents/:incidentId/photo` → l'image.
 *
 * Un signalement **ne clôt rien** et ne touche pas la commande (§ 3, AP-Q4).
 */

/** La famille d'un signalement : à la remise (l'arrêt), technique ou routier (la tournée). */
export const DELIVERY_INCIDENT_FAMILIES = ["doorstep", "technical", "road"] as const;
export type DeliveryIncidentFamily = (typeof DELIVERY_INCIDENT_FAMILIES)[number];

/**
 * Les motifs proposés, par famille (§ 3) — une liste FERMÉE : un motif d'une
 * autre famille est refusé par le serveur. « Autre » existe partout ; la note
 * dit alors ce qui s'est passé.
 */
export const DELIVERY_INCIDENT_REASONS = {
  doorstep: [
    "nobody_present",
    "refused",
    "address_not_found",
    "access_impossible",
    "goods_damaged",
    "other",
  ],
  technical: ["vehicle_breakdown", "cold_failure", "phone_or_app", "bin_damaged", "other"],
  road: ["road_closed", "accident", "weather_conditions", "traffic_jam", "other"],
} as const satisfies Readonly<Record<DeliveryIncidentFamily, readonly string[]>>;

export type DeliveryIncidentReason =
  (typeof DELIVERY_INCIDENT_REASONS)[DeliveryIncidentFamily][number];

/** La note d'un signalement, au plus ce nombre de caractères. */
export const DELIVERY_INCIDENT_NOTE_MAX = 500;

/**
 * Les champs d'un signalement, en multipart (la photo est le champ `photo`).
 * La FORME seulement : la famille et le motif qui vont ensemble, l'arrêt
 * exigé pour un problème à la remise, la longueur de la note — c'est le
 * domaine qui les refuse, avec ses mots.
 */
export const reportDeliveryIncidentFieldsSchema = z.object({
  family: z.enum(DELIVERY_INCIDENT_FAMILIES, { message: "famille de problème inconnue" }),
  reason: z.string().trim().min(1, "motif requis"),
  note: z.string().default(""),
  /** L'arrêt concerné ; absent pour un problème de la tournée seule. */
  stopId: z.string().trim().min(1).optional(),
});
export type ReportDeliveryIncidentFields = z.infer<typeof reportDeliveryIncidentFieldsSchema>;

/** Le signalement créé. */
export interface ReportedDeliveryIncidentResponse {
  readonly id: string;
}

/**
 * Clore un arrêt SANS remise — la commande a déjà été retirée au comptoir, ou
 * annulée (AP-D2, L6-C11). La version de la tournée lue par l'écran.
 */
export const closeStopWithoutHandoverPayloadSchema = z.object({
  version: z.number().int().nonnegative(),
});
export type CloseStopWithoutHandoverPayload = z.infer<typeof closeStopWithoutHandoverPayloadSchema>;

/**
 * Où en est la commande d'un arrêt, vue du commerce :
 * - `open` — à remettre ;
 * - `handed_over` — déjà retirée (au comptoir, le plus souvent) ;
 * - `cancelled` — annulée.
 *
 * ⚠️ « Retenue au contrôle qualité » n'y est PAS au 2026-10-01 : c'est un fait
 * du fournil, que le canal du commerce ne connaît pas (rapport du lot A).
 */
export type DeliveryStopOrderState = "open" | "handed_over" | "cancelled";

/** Un signalement, tel que l'écran le montre. */
export interface DeliveryIncidentView {
  readonly id: string;
  readonly roundId: string;
  /** L'arrêt concerné, ou `null` : la tournée seule. */
  readonly stopId: string | null;
  /** Le numéro de la commande de l'arrêt, figé au départ ; `null` sans arrêt. */
  readonly orderReference: string | null;
  readonly family: DeliveryIncidentFamily;
  readonly reason: string;
  /** `""` sans note. */
  readonly note: string;
  readonly hasPhoto: boolean;
  /** ISO. */
  readonly reportedAt: string;
  readonly reportedBy: DeliveryIncidentAuthorView;
}

/** Le livreur qui a signalé, sous son nom du moment. */
export interface DeliveryIncidentAuthorView {
  readonly staffUserId: string;
  /** `null` : l'annuaire ne lui connaissait pas de nom. */
  readonly name: string | null;
}

/** Les signalements d'une journée, du plus ancien au plus récent. */
export interface DeliveryIncidentsDayView {
  readonly day: string;
  readonly incidents: readonly DeliveryIncidentView[];
}

/**
 * **« Non remis »** (AP-D7, PL2) — les arrêts non clos des tournées RENTRÉES
 * (« Tournée terminée »), et ceux des tournées parties d'une journée
 * antérieure à aujourd'hui (heure de Paris) jamais rentrées. Une VUE : elle ne
 * débloque rien — ces commandes restent dans une tournée vivante, à traiter
 * hors application en attendant les reports.
 */
export interface UndeliveredStopsView {
  /** Aujourd'hui à Paris, `AAAA-MM-JJ` : une tournée non rentrée n'y entre qu'avant ce jour. */
  readonly before: string;
  readonly stops: readonly UndeliveredStopView[];
}

export interface UndeliveredStopView {
  readonly roundId: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly serviceDay: string;
  readonly stopId: string;
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  /** ISO. */
  readonly departedAt: string;
  /** ISO, ou `null` : la tournée n'a pas été déclarée rentrée. */
  readonly returnedAt: string | null;
  /** ISO, ou `null` : aucune arrivée déclarée. */
  readonly arrivedAt: string | null;
  readonly incidents: readonly DeliveryIncidentView[];
}
