/**
 * **Lire la version d'une journée** dans le journal du commerce
 * (`documentation/caching-usage/plan-version-par-journee.md`, D2 et D3).
 *
 * Le journal (`public.day_change`) est alimenté par les déclencheurs de
 * `orders`, jamais par le code : ce port ne fait que le lire. Séparé du
 * balayage (ISP) — l'écran qui veille ne purge rien.
 *
 * Aucun mur tenant : le journal ne porte que des jours, pas de société, et la
 * route est gardée en amont par `@AdminSurface("b2b_supervision")`.
 */
export abstract class OrderDayVersionReader {
  /**
   * Le plus grand identifiant du journal pour ce jour `AAAA-MM-JJ`, `0` si
   * aucun. Opaque : il se compare par égalité, il ne compte rien.
   */
  abstract versionOf(day: string): Promise<number>;
}
