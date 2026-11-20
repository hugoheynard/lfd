import type {
  MenuLevel,
  MenuReading,
  MenuReadingEntry,
} from "../../shared/company-standing/domain/sub-account-menu-reading.js";

/**
 * Ce que la carte d'un sous-compte lit d'un article : ses trois grains
 * (`documentation/comptes-client/plan-carte-des-sites.md`, § 3.3).
 */
export interface MenuSubject {
  readonly sku: string;
  readonly productSku: string;
  /** `CatalogFamily.path` : la famille en tête, puis ses parentes. */
  readonly familyPath: readonly string[];
}

/** L'article est-il dans la carte du lecteur ? `on` sans carte. */
export type MenuMark = "on" | "off";

/**
 * **La carte d'un sous-compte, jugée sur un article** (§ 3.3) — pure.
 *
 * Le plus fin l'emporte : SKU, puis produit, puis la famille la plus proche
 * dans `familyPath`, puis ses parentes. L'entrée trouvée décide (`include` →
 * dans la carte, `exclude` → hors carte), même contre le mode : c'est
 * l'exception d'une exception. Sans entrée qui touche l'article, le mode
 * donne le défaut — `only` ferme, `except` ouvre.
 */
export function menuMarkOf(menu: MenuReading | null, subject: MenuSubject): MenuMark {
  if (menu === null) {
    return "on";
  }
  const decisive = finestEntry(menu.entries, subject);
  if (decisive !== undefined) {
    return decisive.effect === "include" ? "on" : "off";
  }
  return menu.mode === "only" ? "off" : "on";
}

function finestEntry(
  entries: readonly MenuReadingEntry[],
  subject: MenuSubject,
): MenuReadingEntry | undefined {
  const at = (level: MenuLevel, ref: string): MenuReadingEntry | undefined =>
    entries.find((entry) => entry.level === level && entry.ref === ref);
  const candidates: readonly (readonly [MenuLevel, string])[] = [
    ["sku", subject.sku],
    ["product", subject.productSku],
    ...subject.familyPath.map((familyId) => ["family", familyId] as const),
  ];
  for (const [level, ref] of candidates) {
    const found = at(level, ref);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}
