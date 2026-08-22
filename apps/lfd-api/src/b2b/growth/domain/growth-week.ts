/**
 * Le **découpage hebdomadaire** des statistiques, et l'événement qu'elles
 * lisent — la feuille partagée par `growth-stats` et `growth-stats-advanced`.
 *
 * Extraite parce qu'elle bouclait un cycle : `growth-stats` importe quatre
 * calculs avancés, et `growth-stats-advanced` importait en retour `weekStart`
 * et le type de l'événement. Un cycle ne se voit ni au compilateur ni aux
 * tests ; il se paie à l'initialisation, quand l'un des deux lit l'autre encore
 * vide.
 *
 * Bucketing au **lundi UTC** (raffinement Europe/Paris = plus tard) : le même
 * pour les deux, ce qui est justement la raison de le poser une seule fois.
 */

/** Un événement du journal, réduit à ce que les statistiques en lisent. */
export interface GrowthStatsEvent {
  readonly type: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly occurredAt: Date;
  readonly actorType: string;
  readonly payload: Record<string, unknown>;
}

/** Le lundi (UTC) de la semaine d'une date, en `YYYY-MM-DD`. */
export function weekStart(d: Date): string {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const diff = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt.toISOString().slice(0, 10);
}
