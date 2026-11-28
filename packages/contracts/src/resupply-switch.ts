import { z } from "zod";

/**
 * **L'interrupteur du réassort** — Réglages › Production › Fournil, un
 * réglage global (décidé par Hugo le 2026-11-28). Éteint — le défaut, tant
 * que personne ne l'a posé —, le comptoir et le Prod manager ne montrent plus
 * leurs écrans de réassort, et le serveur refuse d'en écrire un (409
 * `resupply.disabled`). Ce qui a déjà été envoyé reste lisible.
 */
export interface ResupplySwitchView {
  /** `false` tant que l'interrupteur n'a jamais été posé. */
  readonly enabled: boolean;
  /** Instant de la dernière modification (ISO 8601) ; `null` si jamais posé. */
  readonly updatedAt: string | null;
  /** Nom figé de qui l'a posé en dernier ; `null` si jamais posé. */
  readonly updatedBy: string | null;
}

/** `PUT /admin/resupply-switch` — allume ou éteint le réassort. */
export const resupplySwitchSchema = z.object({ enabled: z.boolean() }).strict();

export type ResupplySwitchPayload = z.infer<typeof resupplySwitchSchema>;
