/**
 * Le **diff** qu'un fait de journal transporte : ce qui a changé, champ par
 * champ, en « avant → après ».
 *
 * Calculé **au serveur**, jamais reçu de l'écran. Un front qui annoncerait ce
 * qu'il a modifié serait cru sur parole, et une trace qu'on peut faire mentir
 * ne trace rien. Le prix est un instantané d'avant, que les handlers ont déjà
 * sous la main la plupart du temps.
 */

/** Un champ qui a bougé. `null` est une valeur (« vidé »), pas une absence. */
export interface FieldChange {
  readonly from: unknown;
  readonly to: unknown;
}

export type FieldChanges = Readonly<Record<string, FieldChange>>;

/**
 * Au-delà, un texte est **abrégé** dans la trace.
 *
 * Un journal n'est pas une copie de la base : recopier une histoire produit de
 * trois paragraphes à chaque virgule corrigée gonflerait la table sans rien
 * apprendre — on veut savoir QUE le texte a changé, et le reconnaître d'un coup
 * d'œil, pas le relire ici.
 */
const MAX_TEXT = 120;

/**
 * Ce qui diffère entre deux instantanés. Un objet **vide** signifie « rien n'a
 * changé » — et c'est un résultat utile : l'appelant n'écrit alors aucun fait,
 * plutôt que de remplir l'historique d'enregistrements sans effet.
 */
export function changesBetween<T extends object>(before: T, after: T): FieldChanges {
  const changes: Record<string, FieldChange> = {};
  for (const key of Object.keys(after)) {
    const from = Reflect.get(before, key);
    const to = Reflect.get(after, key);
    if (!sameValue(from, to)) {
      changes[key] = { from: abridge(from), to: abridge(to) };
    }
  }
  return changes;
}

/** Vrai si les deux valeurs se valent, structure comprise. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => sameValue(a[key], b[key]));
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Abrège récursivement les textes trop longs pour un journal. */
function abridge(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length <= MAX_TEXT ? value : `${value.slice(0, MAX_TEXT)}…`;
  }
  if (Array.isArray(value)) {
    return value.map(abridge);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, abridge(item)]));
  }
  return value;
}
