import type { StaffNavPreferences, StaffNavPreferencesPatch } from "@lfd/contracts";

/**
 * Les préférences de navigation d'une personne du staff — un sac JSON purement
 * UI, persisté sur la fiche pour qu'il suive la PERSONNE et non la machine.
 *
 * Aucun invariant métier ici : ces valeurs ne protègent rien. Ce fichier ne
 * garantit que deux comportements, et ils sont du comportement, pas du type :
 * la **relecture défensive** d'une colonne `Json?` (donc `unknown`), et la
 * **fusion** d'une préférence dans le sac sans toucher aux autres.
 *
 * La forme, elle, vient des contrats : l'écrire deux fois, c'est entretenir un
 * miroir à la main, et un miroir entretenu à la main finit par renvoyer autre
 * chose.
 */

/**
 * Une valeur JSON, telle qu'une colonne `Json` peut en contenir.
 *
 * Écrite ici plutôt qu'empruntée à Prisma : le domaine ne connaît pas la
 * persistance, et un `Prisma.InputJsonValue` qui remonterait jusqu'ici casserait
 * la frontière que l'adaptateur existe pour tenir. La forme est structurelle,
 * donc les deux se rencontrent sans conversion.
 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Ce que porte le sac tel qu'il est rangé en base : des clés, des valeurs JSON. */
export type StaffNavPreferencesBag = Readonly<Record<string, JsonValue>>;

/** Aucune préférence encore posée — la valeur de TOUTES les fiches d'avant la colonne. */
export const EMPTY_STAFF_NAV_PREFERENCES: StaffNavPreferences = { worksheetCategory: null };

/**
 * Reconstruit des préférences **sûres** depuis la colonne JSON.
 *
 * Aucune exception, jamais : une donnée d'affichage corrompue — ou simplement
 * absente, ce qui est le cas normal d'une colonne neuve — ne doit pas casser
 * `/admin/me`, c'est-à-dire l'amorçage de tout le back-office. Ce qui n'est pas
 * reconnu retombe sur « aucun choix ».
 *
 * La borne haute du contrat n'est pas rejouée ici : elle garde l'ÉCRITURE, et
 * une valeur trop longue déjà rangée reste parfaitement affichable. Refuser à
 * la relecture ne réparerait rien et casserait l'écran.
 */
export function parseStaffNavPreferences(value: unknown): StaffNavPreferences {
  const category = asBag(value)["worksheetCategory"];
  if (typeof category !== "string") {
    return EMPTY_STAFF_NAV_PREFERENCES;
  }
  const trimmed = category.trim();
  return { worksheetCategory: trimmed === "" ? null : trimmed };
}

/**
 * Applique une charge partielle **par fusion**, et c'est tout l'intérêt.
 *
 * Remplacer le sac entier marcherait tant qu'il n'y a qu'une préférence, puis
 * ferait s'effacer la seconde par la première sans que rien ne le signale. Les
 * clés qu'on ne connaît pas sont donc recopiées telles quelles — y compris
 * celles d'une version plus récente du front.
 */
export function mergeStaffNavPreferences(
  stored: unknown,
  patch: StaffNavPreferencesPatch,
): StaffNavPreferencesBag {
  const merged: Record<string, JsonValue> = { ...asBag(stored) };
  // `in` plutôt qu'une comparaison à `undefined` : `null` est une valeur — elle
  // efface le choix — alors qu'une clé absente veut dire « n'y touche pas ».
  if ("worksheetCategory" in patch) {
    merged["worksheetCategory"] = patch.worksheetCategory ?? null;
  }
  return merged;
}

/** Une valeur JSON quelconque vue comme un sac de clés. Tout le reste vaut « vide ». */
function asBag(value: unknown): Record<string, JsonValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  // La colonne est du JSON : ce qui est un objet est un objet de valeurs JSON.
  // La relecture défensive ci-dessus ne présume rien de plus — chaque clé lue
  // est re-vérifiée avant d'être rendue.
  return value as Record<string, JsonValue>;
}
