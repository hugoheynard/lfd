import { staffPermission, type StaffOverride, type StaffPermission } from "@lfd/contracts";

/**
 * Ce qu'une édition fait **réellement** aux dérogations d'une personne,
 * couple (ressource, action) par couple.
 *
 * Le formulaire décrit un ÉTAT ; la base, elle, doit recevoir un CHANGEMENT.
 * Recréer toutes les lignes à chaque enregistrement (ce que faisait l'annuaire
 * jusqu'au 2026-09-18) réattribuait chaque écart à son dernier éditeur, et
 * effaçait la date à laquelle il avait été accordé : « qui a ouvert la compta
 * à Marc, et quand » n'avait plus de réponse vraie.
 *
 * `changed` porte le **nouvel** effet : c'est ce qui s'écrit, et ce que la
 * trace doit dire.
 */
export interface OverrideDiff {
  readonly added: readonly StaffOverride[];
  readonly removed: readonly StaffOverride[];
  readonly changed: readonly StaffOverride[];
}

/**
 * Compare l'état stocké à l'état voulu. Les deux listes sont supposées déjà
 * dédoublonnées (une ligne par couple) — c'est ce que garantit la contrainte
 * d'unicité d'un côté, `dedupeStaffOverrides` de l'autre.
 */
export function diffOverrides(
  stored: readonly StaffOverride[],
  wanted: readonly StaffOverride[],
): OverrideDiff {
  const before = byPermission(stored);
  const after = byPermission(wanted);
  return {
    added: wanted.filter((entry) => !before.has(keyOf(entry))),
    removed: stored.filter((entry) => !after.has(keyOf(entry))),
    changed: wanted.filter((entry) => {
      const previous = before.get(keyOf(entry));
      return previous !== undefined && previous.effect !== entry.effect;
    }),
  };
}

/** Vrai si l'édition ne touche à aucune dérogation. */
export function isEmptyOverrideDiff(diff: OverrideDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
}

function keyOf(entry: StaffOverride): StaffPermission {
  return staffPermission(entry.resource, entry.action);
}

function byPermission(
  entries: readonly StaffOverride[],
): ReadonlyMap<StaffPermission, StaffOverride> {
  return new Map(entries.map((entry) => [keyOf(entry), entry]));
}
