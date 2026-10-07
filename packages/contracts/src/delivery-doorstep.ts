import { z } from "zod";

/**
 * **À la porte** — ce que le livreur déclare sur un arrêt de SA tournée, et ce
 * que l'admin en relit (`documentation/livraisons/livreur/a-la-porte.md`, § 3,
 * AP-D2, AP-D6, AP-D7, AP-D9).
 *
 * Routes du livreur (`admin/livraison/ma-tournee/:roundId…`, sous
 * `delivery_doorstep`, le même mur que « Ma tournée ») :
 * - `POST /arrets/:stopId/arrivee` (corps facultatif
 *   {@link declareStopArrivalPayloadSchema}) → 204, idempotente ;
 * - l'arrivée et les trois gestes qui closent un arrêt acceptent la position du téléphone,
 *   facultative ({@link GesturePositionFields}, YA-D4) ;
 * - `POST /incidents` (multipart : {@link reportDeliveryIncidentFieldsSchema}
 *   + `photo` facultative) → {@link ReportedDeliveryIncidentResponse} ;
 * - `POST /arrets/:stopId/cloture-sans-remise` (corps
 *   {@link closeStopWithoutHandoverPayloadSchema}) → 204, idempotente ;
 * - `POST /arrets/:stopId/remise` (multipart : {@link handOverStopFieldsSchema}
 *   + `photo` obligatoire + `signature` quand la signature est exigée) → 204,
 *   idempotente — « Remis au client » (lot B, B1) ;
 * - `POST /arrets/:stopId/depot` (multipart : {@link depositStopFieldsSchema}
 *   + `photo` obligatoire) → 204, idempotente — « Déposé avec preuve » (B2),
 *   refusé si le dépôt n'est pas autorisé ou la signature exigée ;
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
 * **La position du téléphone au geste** (`documentation/livraisons/livreur/gps-y-aller-et-position.md`,
 * YA-D4) — facultative sur les trois gestes qui closent un arrêt : remise,
 * dépôt, clôture sans remise. Absente : refus du navigateur ou pas de signal,
 * et le geste s'enregistre quand même. Présente : les trois champs ensemble.
 *
 * Des champs À PLAT plutôt qu'un objet : la remise et le dépôt sont en
 * multipart, où un champ est une chaîne — d'où `coerce`. Les bornes sont celles
 * de la FORME ; le domaine (`GesturePosition`) les retient de toute façon.
 */
const gesturePositionShape = {
  positionLat: z.coerce.number().min(-90).max(90).optional(),
  positionLng: z.coerce.number().min(-180).max(180).optional(),
  positionAccuracyM: z.coerce.number().nonnegative().optional(),
};

/** Les trois champs de position ensemble, ou aucun. */
function positionAllOrNone(fields: {
  readonly positionLat?: number | undefined;
  readonly positionLng?: number | undefined;
  readonly positionAccuracyM?: number | undefined;
}): boolean {
  const given = [fields.positionLat, fields.positionLng, fields.positionAccuracyM].filter(
    (value) => value !== undefined,
  ).length;
  return given === 0 || given === 3;
}

const POSITION_ALL_OR_NONE = {
  message: "position incomplète : latitude, longitude et précision vont ensemble",
  path: ["positionLat"],
};

/** Les champs de position d'un geste, tels que le serveur les lit. */
export interface GesturePositionFields {
  readonly positionLat?: number | undefined;
  readonly positionLng?: number | undefined;
  readonly positionAccuracyM?: number | undefined;
}

/**
 * « Je suis arrivé » — le corps est FACULTATIF : la position du téléphone, ou
 * rien (YA-D4). Un appel sans corps reste valide.
 */
export const declareStopArrivalPayloadSchema = z.preprocess(
  // Sans corps (l'écran d'avant, un rejeu) : Nest passe `undefined`.
  (body) => body ?? {},
  z.object({ ...gesturePositionShape }).refine(positionAllOrNone, POSITION_ALL_OR_NONE),
);
export type DeclareStopArrivalPayload = z.infer<typeof declareStopArrivalPayloadSchema>;

/**
 * Clore un arrêt SANS remise — la commande a déjà été retirée au comptoir, ou
 * annulée (AP-D2, L6-C11). La version de la tournée lue par l'écran.
 */
export const closeStopWithoutHandoverPayloadSchema = z
  .object({
    version: z.number().int().nonnegative(),
    ...gesturePositionShape,
  })
  .refine(positionAllOrNone, POSITION_ALL_OR_NONE);
export type CloseStopWithoutHandoverPayload = z.infer<typeof closeStopWithoutHandoverPayloadSchema>;

/** Le nom tapé de qui réceptionne : au moins, au plus (`a-la-porte.md`, Mineurs). */
export const HANDOVER_RECEIVER_NAME_MIN = 2;
export const HANDOVER_RECEIVER_NAME_MAX = 80;

/**
 * **« Remis au client »** (`a-la-porte.md`, B1, § 9) — les champs du
 * multipart ; la photo (champ `photo`, toujours) et la signature au doigt
 * (champ `signature`, une image, quand l'arrêt l'exige au départ) sont des
 * fichiers. La FORME seulement : la longueur du nom, la photo et la signature
 * exigées, c'est le domaine qui les refuse, avec ses mots. `version` : celle
 * de la tournée lue par l'écran — un champ de formulaire est une chaîne.
 */
export const handOverStopFieldsSchema = z
  .object({
    version: z.coerce.number().int().nonnegative(),
    receiverName: z.string().default(""),
    ...gesturePositionShape,
  })
  .refine(positionAllOrNone, POSITION_ALL_OR_NONE);
export type HandOverStopFields = z.infer<typeof handOverStopFieldsSchema>;

/**
 * **« Déposé avec preuve »** (`a-la-porte.md`, B2) — les champs du
 * multipart ; la photo (champ `photo`, toujours) est un fichier. Ni nom ni
 * signature : personne n'a réceptionné. La permission du dépôt et la photo
 * exigée, c'est le domaine qui les refuse, avec ses mots.
 */
export const depositStopFieldsSchema = z
  .object({
    version: z.coerce.number().int().nonnegative(),
    ...gesturePositionShape,
  })
  .refine(positionAllOrNone, POSITION_ALL_OR_NONE);
export type DepositStopFields = z.infer<typeof depositStopFieldsSchema>;

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
