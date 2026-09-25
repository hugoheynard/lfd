import { z } from "zod";

import { localizedTextSchema } from "./localized.js";
import type { LocalizedText } from "./shared.js";

/**
 * **L'opération datée** — Noël, Pâques, la galette : une sélection d'articles
 * du catalogue, bornée dans le temps, qu'on annonce avant de la vendre
 * (`documentation/order/architecture-operations-datees.md`).
 *
 * Ce contrat ne valide que la **forme**. Les règles — la clé en minuscules et
 * tirets, l'ordre des cinq dates, un jour qui existe au calendrier, une
 * sélection sans doublon — sont tenues par l'agrégat `Operation` du
 * référentiel : les recopier ici ferait deux endroits à corriger, et le second
 * finirait par dire autre chose que le premier.
 */

/** À qui l'opération s'adresse (D7). Décidé au référentiel ; la réception peut restreindre. */
export const OPERATION_AUDIENCES = ["pro", "public", "both"] as const;
export type OperationAudience = (typeof OPERATION_AUDIENCES)[number];
export const operationAudienceSchema = z.enum(OPERATION_AUDIENCES);

/**
 * L'état d'une opération, **calculé** à l'horloge du serveur — jamais stocké
 * (D2). Dans l'ordre où une opération les traverse.
 *
 * - `preparing` — composée au référentiel, invisible en boutique ;
 * - `announced` — le rayon paraît, on ne commande pas encore ;
 * - `open` — on commande ;
 * - `closed` — plus de commande, le rayon reste visible jusqu'au dernier retrait ;
 * - `ended` — le lendemain du dernier jour de retrait, à minuit (Paris).
 */
export const OPERATION_STATES = ["preparing", "announced", "open", "closed", "ended"] as const;
export type OperationState = (typeof OPERATION_STATES)[number];

/** L'image d'une opération : une URL de la médiathèque et son texte alternatif. */
export const operationImageSchema = z.strictObject({
  url: z.string().trim().min(1),
  alt: z.string().trim(),
});
export type OperationImage = Readonly<z.infer<typeof operationImageSchema>>;

/** Un instant ISO **avec** son décalage : un instant sans fuseau ne dit pas quand. */
const instantSchema = z.iso.datetime({ offset: true });

/**
 * Les cinq dates (D2). Les instants voyagent en ISO ; les jours de retrait en
 * `AAAA-MM-JJ`, parce qu'une commande porte un JOUR de retrait, pas un instant.
 * `orderFrom` à `null` = on commande dès l'annonce.
 */
export const operationScheduleSchema = z.strictObject({
  announceFrom: instantSchema,
  orderFrom: instantSchema.nullable(),
  orderUntil: instantSchema,
  pickupFrom: z.string(),
  pickupUntil: z.string(),
});
export type OperationSchedulePayload = z.infer<typeof operationScheduleSchema>;

/**
 * **Préparer** une opération. La clé est choisie par le staff et ne change
 * plus jamais : elle nomme l'opération dans le fil vers le commerce et dans
 * les rayons de la boutique (`op:<key>`), et une opération archivée la garde
 * pour toujours.
 */
export const prepareOperationPayloadSchema = operationScheduleSchema.extend({
  key: z.string(),
  name: localizedTextSchema,
  lede: localizedTextSchema.nullable(),
  image: operationImageSchema.nullable(),
  audience: operationAudienceSchema,
});
export type PrepareOperationPayload = z.infer<typeof prepareOperationPayloadSchema>;

/** Le nom, l'accroche et l'image — ce que l'annonce affiche. La clé n'en fait pas partie. */
export const editOperationPayloadSchema = z.strictObject({
  name: localizedTextSchema,
  lede: localizedTextSchema.nullable(),
  image: operationImageSchema.nullable(),
});
export type EditOperationPayload = z.infer<typeof editOperationPayloadSchema>;

/** Les cinq dates, réécrites ensemble : leur ordre ne se vérifie qu'à cinq. */
export const rescheduleOperationPayloadSchema = operationScheduleSchema;
export type RescheduleOperationPayload = OperationSchedulePayload;

export const setOperationAudiencePayloadSchema = z.strictObject({
  audience: operationAudienceSchema,
});
export type SetOperationAudiencePayload = z.infer<typeof setOperationAudiencePayloadSchema>;

/** La sélection ENTIÈRE, dans l'ordre d'affichage. Une liste vide vide la sélection. */
export const setOperationSelectionPayloadSchema = z.strictObject({
  skus: z.array(z.string()),
});
export type SetOperationSelectionPayload = z.infer<typeof setOperationSelectionPayloadSchema>;

/** Ce qu'une création rend : la clé, qui est l'identité. */
export interface OperationKeyResponse {
  readonly key: string;
}

/**
 * Une opération telle que l'écran de préparation la lit.
 *
 * `state` est calculé par le serveur à SON horloge : l'écran ne le recalcule
 * pas, sans quoi deux horloges diraient deux états. `archivedAt` est à part :
 * une opération archivée garde les dates qu'elle avait, et donc un état.
 */
export interface OperationView {
  readonly key: string;
  readonly name: LocalizedText;
  readonly lede: LocalizedText | null;
  readonly image: OperationImage | null;
  readonly announceFrom: string;
  readonly orderFrom: string | null;
  readonly orderUntil: string;
  readonly pickupFrom: string;
  readonly pickupUntil: string;
  readonly audience: OperationAudience;
  /** Les SKU de la sélection, dans l'ordre d'affichage. */
  readonly skus: readonly string[];
  readonly archivedAt: string | null;
  readonly state: OperationState;
}
