import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { POSITION_RETENTION_DAYS } from "../position-retention.js";

/**
 * Une entrée du registre RGPD, réduite à ce que ce test lit. Ses clés sont
 * celles du JSON (`documentation/legal/rgpd-registre.json`) : des valeurs de
 * données, pas des noms choisis ici.
 */
interface RegistryEntry {
  readonly colonne: string;
  readonly categorie: string;
  readonly conservation: unknown;
}

/** La catégorie que le registre donne à une position relevée au geste. */
const POSITION_CATEGORY = "position";

/**
 * Les six colonnes que la purge des positions remet à `null`
 * (`prisma-gesture-position.pruner.ts`, vérifié le 2026-10-07). Le centre
 * d'une suggestion du carnet (`point_lat`, `point_lng`) est purgé aussi, mais
 * le registre l'exclut : ce n'est la position de personne.
 */
const PURGED_POSITION_COLUMNS = [
  "delivery.delivery_round_stop.closed_lat",
  "delivery.delivery_round_stop.closed_lng",
  "delivery.delivery_round_stop.closed_accuracy_m",
  "delivery.delivery_stop_execution.arrived_lat",
  "delivery.delivery_stop_execution.arrived_lng",
  "delivery.delivery_stop_execution.arrived_accuracy_m",
] as const;

function isRegistryEntry(entry: unknown): entry is RegistryEntry {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "colonne" in entry &&
    typeof entry.colonne === "string" &&
    "categorie" in entry &&
    typeof entry.categorie === "string" &&
    "conservation" in entry
  );
}

/** Les entrées du registre, lu sur le disque comme la porte le lit. */
function registryEntries(): readonly RegistryEntry[] {
  const path = fileURLToPath(
    new URL("../../../../../../../documentation/legal/rgpd-registre.json", import.meta.url),
  );
  const registry: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof registry !== "object" || registry === null || !("entrees" in registry)) {
    return [];
  }
  const entries: unknown = registry.entrees;
  return Array.isArray(entries) ? entries.filter(isRegistryEntry) : [];
}

/** `{ "jours": N }` rend N ; une durée en mots (`a-decider`…) se rend telle quelle. */
function daysOf(conservation: unknown): unknown {
  return typeof conservation === "object" && conservation !== null && "jours" in conservation
    ? conservation.jours
    : conservation;
}

/**
 * Régression (audit `documentation/livraisons/audit-2026-10-07.md`, F3) :
 * `POSITION_RETENTION_DAYS` se disait la même durée que le registre, mais
 * rien ne les liait — `lint:rgpd-staff` empreinte colonne et catégorie, pas
 * la durée. Changer l'un sans l'autre gardait la porte verte, et le registre
 * aurait annoncé une conservation que la purge ne tient pas.
 */
describe("la conservation des positions et le registre RGPD", () => {
  const positions = registryEntries().filter((entry) => entry.categorie === POSITION_CATEGORY);

  it("le registre déclare en positions les six colonnes que la purge efface", () => {
    // Sans elles, la comparaison suivante porterait sur une liste vide et
    // serait vraie sans rien vérifier.
    expect(positions.map((entry) => entry.colonne)).toEqual(
      expect.arrayContaining([...PURGED_POSITION_COLUMNS]),
    );
  });

  it("chaque position y est gardée POSITION_RETENTION_DAYS jours, ni plus ni moins", () => {
    expect(
      positions.map((entry) => ({ column: entry.colonne, days: daysOf(entry.conservation) })),
    ).toEqual(positions.map((entry) => ({ column: entry.colonne, days: POSITION_RETENTION_DAYS })));
  });
});
