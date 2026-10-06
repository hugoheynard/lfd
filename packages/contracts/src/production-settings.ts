import { z } from "zod";

/**
 * **Les réglages du fournil** — l'arrêt du plan et les jours fermés (plan
 * `documentation/production/plan-arret-du-plan.md`, §2, Q5, Q6 ; lot A1).
 *
 * Un seul réglage pour la maison : la clôture est par journée, tous lieux
 * confondus. Les heures sont des heures de pendule d'Europe/Paris, `HH:MM`.
 */

/** `auto` : le serveur arrête le plan du lendemain à `closeAt` ; `manual` : on alerte à `alertAt`. */
export const productionCloseModeSchema = z.enum(["auto", "manual"]);
export type ProductionCloseMode = z.infer<typeof productionCloseModeSchema>;

/**
 * Charge d'écriture du réglage d'arrêt.
 *
 * La FORME seulement : une heure manquante pour son mode, mal formée ou hors
 * bornes, et une heure d'arrêt antérieure à l'heure limite de commande, sont
 * refusées par le domaine (400 / 409), avec un message qui nomme le cas.
 *
 * Les deux heures voyagent toujours : celle de l'autre mode est gardée, pour
 * qu'un aller-retour entre les modes ne la perde pas.
 */
export const productionCloseSettingsPayloadSchema = z.object({
  mode: productionCloseModeSchema,
  closeAt: z.string().trim().nullable(),
  alertAt: z.string().trim().nullable(),
});
export type ProductionCloseSettingsPayload = z.infer<typeof productionCloseSettingsPayloadSchema>;

/** Le réglage d'arrêt tel qu'il est en vigueur. */
export interface ProductionCloseSettingsView {
  readonly mode: ProductionCloseMode;
  /** L'heure d'arrêt automatique ; requise en `auto`. */
  readonly closeAt: string | null;
  /** L'heure d'alerte ; requise en `manual`. */
  readonly alertAt: string | null;
}

/**
 * **L'heure limite de commande la plus tardive**, rattrapage compris, toutes
 * règles confondues (points de retrait, jours de la semaine).
 *
 * Exprimée comme une règle d'heure limite : `daysBefore` jours avant la journée
 * servie, à `time`. `1` = la veille — le jour où le plan s'arrête. Une heure
 * d'arrêt automatique ne peut pas la précéder (Q5).
 */
export interface ProductionLatestOrderCutoffView {
  readonly daysBefore: number;
  readonly time: string;
}

/** `GET /admin/production/settings`. */
export interface ProductionSettingsView {
  readonly close: ProductionCloseSettingsView;
  /** `null` : aucune heure limite n'est réglée au commerce. */
  readonly latestOrderCutoff: ProductionLatestOrderCutoffView | null;
  /** Les jours fermés d'aujourd'hui (compris) à plus tard, `AAAA-MM-JJ`, dans l'ordre. */
  readonly closedDays: readonly string[];
}

/** `POST /admin/production/settings/closed-days` — la forme ; la date est jugée par le domaine. */
export const productionClosedDayPayloadSchema = z.object({
  date: z.string().trim().min(1),
});
export type ProductionClosedDayPayload = z.infer<typeof productionClosedDayPayloadSchema>;
