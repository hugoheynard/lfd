import type { DossierRecapGroup, DossierRecapLine } from "./day-dossier.js";
import type { TrancheThreshold } from "./production-tranches.js";

/**
 * **Le calendrier du dossier** — une page paysage par catégorie racine, ses
 * produits en lignes et les tranches horaires en colonnes (Hugo, 2026-11-02 :
 * « des pages de totaux par tranche horaire, en paysage comme le
 * prévisionnel par tranche, comme un calendrier, par catégorie »).
 *
 * La règle est celle de la journée par tranche à l'écran
 * (`lfd-backoffice-frontend/…/previsionnel/day-tranche-matrix.ts`) : le total
 * d'un produit est celui du récapitulatif — ce que la journée a figé —, les
 * tranches de la fiche d'atelier ne font que le RÉPARTIR, et ce qu'aucune
 * échéance ne place tombe dans « Sans heure ». La somme d'une ligne est donc
 * le total du produit, par construction. Des échéances qui dépassent le
 * total (sources désynchronisées) ne répartissent rien : tout reste « Sans
 * heure », et la ligne le dit.
 *
 * Fonction pure. Les colonnes d'une catégorie sont les seules tranches que
 * ses produits touchent : une colonne vide sur toute une page ne dit rien.
 */

/** `deadline` : une heure ; `day` : la journée sans heure réglée ; `rest` : ce qu'aucune échéance ne place. */
export type CalendarColumnKind = "deadline" | "day" | "rest";

export interface CalendarColumn {
  readonly key: string;
  readonly kind: CalendarColumnKind;
  /** « avant 05:00 », « Dans la journée », « Sans heure ». */
  readonly label: string;
}

export interface CalendarRow {
  readonly line: DossierRecapLine;
  /** Alignées sur les colonnes : la quantité à sortir DANS la tranche, `0` = rien. */
  readonly quantities: readonly number[];
  /** Les échéances dépassent le total : rien n'est réparti. */
  readonly mismatch: boolean;
}

export interface CalendarPage {
  /** Le nom de la catégorie racine — le titre de la page. */
  readonly label: string;
  readonly columns: readonly CalendarColumn[];
  readonly rows: readonly CalendarRow[];
  /** Les intertitres de sous-catégorie du récapitulatif, repris tels quels. */
  readonly intertitles?: ReadonlyMap<string, string>;
}

const DAY_KEY = "day";
const REST_KEY = "rest";

/** Une page par catégorie du récapitulatif, dans son ordre. */
export function dossierCalendarOf(
  recap: readonly DossierRecapGroup[],
  tranches: ReadonlyMap<string, readonly TrancheThreshold[]>,
): readonly CalendarPage[] {
  return recap.map((group) => pageOf(group, tranches));
}

function pageOf(
  group: DossierRecapGroup,
  tranches: ReadonlyMap<string, readonly TrancheThreshold[]>,
): CalendarPage {
  const split = group.lines.map((line) => splitOf(line, tranches.get(line.sku) ?? []));
  const columns = columnsOf(split);
  const rows = split.map(({ line, parts, mismatch }) => ({
    line,
    mismatch,
    quantities: columns.map((column) => parts.get(column.key) ?? 0),
  }));
  const page = { label: group.label, columns, rows };
  return group.intertitles === undefined ? page : { ...page, intertitles: group.intertitles };
}

interface Split {
  readonly line: DossierRecapLine;
  readonly parts: ReadonlyMap<string, number>;
  readonly mismatch: boolean;
}

/** Le total d'un produit, réparti dans ses tranches ; le reste « Sans heure ». */
function splitOf(line: DossierRecapLine, thresholds: readonly TrancheThreshold[]): Split {
  const parts = new Map<string, number>();
  for (const threshold of thresholds) {
    const key = keyOf(threshold);
    if (key === REST_KEY) {
      continue;
    }
    parts.set(key, (parts.get(key) ?? 0) + threshold.quantity);
  }
  const placed = [...parts.values()].reduce((sum, quantity) => sum + quantity, 0);
  if (placed > line.quantity) {
    return { line, parts: restOnly(line.quantity), mismatch: true };
  }
  const rest = line.quantity - placed;
  if (rest > 0) {
    parts.set(REST_KEY, rest);
  }
  return { line, parts, mismatch: false };
}

function restOnly(quantity: number): ReadonlyMap<string, number> {
  return quantity > 0 ? new Map([[REST_KEY, quantity]]) : new Map();
}

/**
 * La clé de colonne d'un seuil. `before_first` va dans la première tranche,
 * où le rangement l'a mis ; `undated` rejoint « Sans heure ».
 */
function keyOf(threshold: TrancheThreshold): string {
  switch (threshold.kind) {
    case "deadline":
    case "before_first":
      return threshold.before ?? REST_KEY;
    case "day":
      return DAY_KEY;
    case "undated":
      return REST_KEY;
  }
}

/** Les heures dans l'ordre, puis la journée, puis « Sans heure » — seulement celles qui servent. */
function columnsOf(split: readonly Split[]): readonly CalendarColumn[] {
  const used = new Set(
    split.flatMap(({ parts }) =>
      [...parts.entries()].filter(([, quantity]) => quantity > 0).map(([key]) => key),
    ),
  );
  const hours = [...used].filter((key) => key !== DAY_KEY && key !== REST_KEY).sort();
  return [
    ...hours.map((hour) => ({ key: hour, kind: "deadline" as const, label: `avant ${hour}` })),
    ...(used.has(DAY_KEY)
      ? [{ key: DAY_KEY, kind: "day" as const, label: "Dans la journée" }]
      : []),
    ...(used.has(REST_KEY) ? [{ key: REST_KEY, kind: "rest" as const, label: "Sans heure" }] : []),
  ];
}
