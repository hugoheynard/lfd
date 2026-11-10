/**
 * **La tolérance de retard** — minutes après la fin d'un créneau avant qu'une
 * commande soit « créneau dépassé » (Hugo, 2026-11-03), réglée dans
 * Réglages › Commandes. Port étroit (ISP) : la Supervision et le comptoir ne
 * lisent que ce nombre du réglage, pas le réglage entier.
 */
export abstract class LateToleranceReader {
  abstract lateToleranceMinutes(): Promise<number>;
}
