import { Injectable, signal } from '@angular/core';

interface DaySummary {
  readonly day: string;
  readonly label: string;
}

/**
 * **Le résumé du jour au bandeau** — « 4 tournées · 20 arrêts » (Hugo,
 * 2026-10-26).
 *
 * Fourni par la coquille, comme le jour : l'onglet Tournées, qui lit déjà la
 * composition, y publie son résumé, et le bandeau le montre sans relire le
 * serveur. Il est rangé avec SON jour : un résumé d'un autre jour ne
 * s'affiche pas.
 */
@Injectable()
export class TourManagerSummary {
  private readonly entry = signal<DaySummary | null>(null);

  publish(day: string, label: string): void {
    this.entry.set({ day, label });
  }

  /** Le résumé de `day`, s'il a été publié pour ce jour-là. */
  labelFor(day: string): string | null {
    const entry = this.entry();
    return entry !== null && entry.day === day ? entry.label : null;
  }
}
