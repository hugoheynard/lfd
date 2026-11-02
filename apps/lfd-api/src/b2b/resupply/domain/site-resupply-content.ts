import { resupplyNameOf } from "./resupply-name.js";
import type { SiteResupplyLine } from "./site-resupply-line.js";
import { withLineAdded, withLineCorrected, withLineWithdrawn } from "./site-resupply-lines.js";

/**
 * **Le contenu d'une demande en cours** — son nom et ses lignes, et le fait
 * qu'elles ont bougé depuis la lecture. Une part de `SiteResupply`, sortie de
 * l'agrégat pour qu'il tienne en un fichier (dette du réassort, 2026-11-02) :
 * seul l'agrégat la construit et l'appelle, APRÈS avoir vérifié que la
 * demande n'est pas encore envoyée — elle ne garde rien elle-même.
 */
export class SiteResupplyContent {
  private touched = false;

  constructor(
    private currentName: string | null,
    private lineList: readonly SiteResupplyLine[],
  ) {}

  get name(): string | null {
    return this.currentName;
  }

  get lines(): readonly SiteResupplyLine[] {
    return this.lineList;
  }

  /**
   * Vrai si un geste a changé les lignes depuis la réhydratation (ou la
   * création) : l'adaptateur ne réécrit les lignes qu'alors.
   */
  get linesChanged(): boolean {
    return this.touched;
  }

  /** Rogné, vide retire le nom ; cf. {@link resupplyNameOf} pour la borne. */
  rename(name: string | null): void {
    this.currentName = resupplyNameOf(name);
  }

  add(line: SiteResupplyLine): void {
    this.replaceLines(withLineAdded(this.lineList, line));
  }

  correct(sku: string, quantity: number): void {
    this.replaceLines(withLineCorrected(this.lineList, sku, quantity));
  }

  withdraw(sku: string): void {
    this.replaceLines(withLineWithdrawn(this.lineList, sku));
  }

  private replaceLines(lines: readonly SiteResupplyLine[]): void {
    this.lineList = lines;
    this.touched = true;
  }
}
