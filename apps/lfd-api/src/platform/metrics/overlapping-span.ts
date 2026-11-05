import type { ServerTimingMark } from "./server-timing.js";

/**
 * Le temps MURAL pendant lequel au moins une lecture d'une même famille était
 * en cours, et le nombre de ces lectures, pour une requête.
 *
 * Plusieurs lectures du catalogue partent parfois en parallèle (`Promise.all`)
 * : additionner leurs durées compterait deux fois le même temps et ferait
 * paraître le catalogue plus lourd que la requête entière. On compte donc
 * l'union des intervalles — un chronomètre qui ne tourne que quand au moins
 * une lecture est ouverte (plan des matériaux du catalogue, « Mesurer avant
 * de bâtir », 2026-11-05).
 *
 * Les instants viennent de `performance.now()` (horloge monotone, une durée,
 * pas un instant métier) et sont passés en paramètre : la classe reste
 * déterministe sous test.
 */
export class OverlappingSpan {
  private open = 0;
  private openedAt = 0;
  private closedMs = 0;
  private reads = 0;

  constructor(private readonly name: string) {}

  /** Une lecture commence à `at`. */
  enter(at: number): void {
    if (this.open === 0) {
      this.openedAt = at;
    }
    this.open += 1;
    this.reads += 1;
  }

  /** Une lecture se termine à `at` (succès ou échec). */
  leave(at: number): void {
    if (this.open === 0) {
      return;
    }
    this.open -= 1;
    if (this.open === 0) {
      this.closedMs += at - this.openedAt;
    }
  }

  /**
   * Deux marques : `<nom>` (la durée murale, y compris une lecture encore
   * ouverte à `at`) et `<nom>-reads`, dont la description porte le nombre.
   */
  marksAt(at: number): readonly ServerTimingMark[] {
    const running = this.open === 0 ? 0 : at - this.openedAt;
    return [
      { name: this.name, durationMs: this.closedMs + running },
      { name: `${this.name}-reads`, durationMs: 0, description: String(this.reads) },
    ];
  }
}
