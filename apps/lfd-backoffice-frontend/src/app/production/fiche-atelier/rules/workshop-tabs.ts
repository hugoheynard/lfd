import type { FoldSelectItem, FoldTabItem } from 'fold-ng';

import type { WorkshopGroup, WorkshopLine } from '@lfd/contracts';
import { sectionIntertitles } from '@lfd/b2b-ui/catalog';

/**
 * **Les onglets et les intertitres de la fiche d'atelier** — mise en forme pure
 * de ce que le serveur sert ; aucun compte n'est refait ici.
 */

/** La ligne attend-elle le four pour une commande ? (le point ambre de l'onglet) */
function presses(line: WorkshopLine): boolean {
  return !line.done && (line.waitingOrders ?? null) !== null;
}

/** Les onglets de la tablette : le rayon et son avancement, tels que servis. */
export function groupTabs(groups: readonly WorkshopGroup[]): readonly FoldTabItem[] {
  return groups.map((group) => ({
    key: group.key,
    label: group.label,
    badge: `${group.doneCount}/${group.lineCount}`,
    // Ce qui presse : un point ambre, et les mots sur la ligne elle-même.
    ...(group.lines.some(presses)
      ? { dot: 'warning' as const, dotLabel: 'une commande attend le four' }
      : {}),
  }));
}

/** Le même choix, sous le pouce : une liste, jamais six onglets de 390 px. */
export function groupOptions(groups: readonly WorkshopGroup[]): readonly FoldSelectItem<string>[] {
  return groups.map((group) => ({
    value: group.key,
    label: `${group.label} · ${String(group.remainingUnits)} à sortir`,
  }));
}

/** Les intertitres d'une liste de la fiche, d'après les sections servies. */
export function intertitlesOf(
  group: WorkshopGroup | null,
  lines: readonly WorkshopLine[],
): ReadonlyMap<string, string> {
  const sections = group?.sections;
  if (sections === undefined) {
    return new Map();
  }
  const bySku = new Map(sections.flatMap((section) => section.skus.map((sku) => [sku, section])));
  return sectionIntertitles(lines, (line) => bySku.get(line.sku));
}
