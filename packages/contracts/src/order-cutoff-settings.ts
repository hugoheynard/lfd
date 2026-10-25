import { z } from "zod";

/**
 * **Le jour même** — Réglages › Commandes › Jour même (Hugo, 2026-10-14 pour
 * le réglage, 2026-10-21 pour sa page).
 *
 * Cette vue portait aussi l'interrupteur de l'heure limite générale (lot O3,
 * 2026-10-14). Il est retiré le 2026-10-21 : l'heure limite déclenche l'arrêt
 * du plan, elle est donc toujours en vigueur
 * (`documentation/limites-de-commande/plan-une-seule-heure.md` §5). La colonne
 * `enabled` reste en base, plus personne ne la lit ni ne l'écrit.
 */
export interface OrderCutoffSettingsView {
  /**
   * Une commande peut-elle viser aujourd'hui ? `false` par défaut (§8.3, Hugo
   * 2026-10-14) : le délai minimum est ce réglage, jamais une règle en dur.
   */
  readonly sameDayAllowed: boolean;
  /**
   * **L'heure limite du réassort pour demain**, `HH:MM`, la VEILLE, heure de
   * Paris (lot R3a, `documentation/reassort-boutiques/plan-reapprovisionnement.md`
   * §13.3, Hugo 2026-10-21). Passé cette heure, un réassort « pour demain »
   * est refusé ; le plan du fournil s'arrête à la plus tardive de cette heure
   * et de la fin du rattrapage de l'heure limite générale. `20:00` par défaut.
   * Remplace l'interrupteur `resupplySubjectToCutoff` (oui/non), retiré du
   * contrat le même jour — sa colonne reste en base, morte.
   */
  readonly resupplyCutoffTime: string;
  /**
   * **« Rappel au client »**, en minutes après la FIN DU CRÉNEAU d'un retrait
   * (Hugo, 2026-10-25) : avant, la Supervision ne propose pas le geste et le
   * serveur le refuse. Entier ≥ 0, `0` par défaut.
   */
  readonly pickupReminderDelayMinutes: number;
  /** **« Avertir le client »** (sa commande prend du retard) : même règle, son propre délai. */
  readonly delayWarningDelayMinutes: number;
  /** Instant du dernier geste ; `null` tant que personne n'a rien réglé. */
  readonly updatedAt: string | null;
  /** Le nom de qui l'a posé, figé au geste ; `null` tant que personne n'a rien réglé. */
  readonly updatedBy: string | null;
}

/** L'heure du réassort tant que personne ne l'a posée : la veille, 20 h (Hugo, 2026-10-21). */
export const DEFAULT_RESUPPLY_CUTOFF_TIME = "20:00";

/** Le réglage tant que personne ne l'a posé : jour même fermé — rien ne s'ouvre au déploiement. */
export const DEFAULT_ORDER_CUTOFF_SETTINGS: OrderCutoffSettingsView = {
  sameDayAllowed: false,
  resupplyCutoffTime: DEFAULT_RESUPPLY_CUTOFF_TIME,
  pickupReminderDelayMinutes: 0,
  delayWarningDelayMinutes: 0,
  updatedAt: null,
  updatedBy: null,
};

/**
 * `PATCH /admin/order-cutoff-settings` — le jour même, l'heure limite du
 * réassort (2026-10-21, lot R3a) et les délais des deux relances d'un retrait
 * en retard (2026-10-25). Une vraie rustine : chaque page n'envoie
 * que sa clé, au moins une est exigée. Strict : une charge qui porte encore
 * `enabled` (l'interrupteur retiré le 2026-10-21) est refusée plutôt
 * qu'avalée en silence.
 */
export const orderCutoffSettingsPatchSchema = z
  .object({
    sameDayAllowed: z.boolean().optional(),
    // La FORME seulement : l'heure qui existe est la règle du domaine.
    resupplyCutoffTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/u, "heure attendue au format HH:MM")
      .optional(),
    // La FORME seulement — un entier ; « pas négatif » est la règle du domaine.
    pickupReminderDelayMinutes: z.number().int("nombre entier de minutes attendu").optional(),
    delayWarningDelayMinutes: z.number().int("nombre entier de minutes attendu").optional(),
  })
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: "Indiquez au moins un réglage à poser.",
  });
export type OrderCutoffSettingsPatch = z.infer<typeof orderCutoffSettingsPatchSchema>;
