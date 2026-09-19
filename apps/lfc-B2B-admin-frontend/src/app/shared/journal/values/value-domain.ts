/**
 * **Un ensemble de valeurs et leurs mots** — ce qu'une valeur d'énumération
 * devient à l'écran (`write` → « Écriture », `takeaway` → « À emporter »).
 *
 * Le dictionnaire des CLÉS (`key-labels.ts`) nomme la colonne de gauche du
 * détail ; celui-ci nomme la colonne de droite quand elle n'est pas une donnée
 * libre, mais un code choisi dans un ensemble fermé. Sans lui, le détail
 * affichait `write`, `takeaway`, `scan` — des valeurs de contrat, pas des mots.
 *
 * `name` n'est jamais affiché : il dit au lecteur du code de quoi il s'agit,
 * et au test de clôture quoi citer quand un ensemble manque.
 */
export interface ValueDomain {
  readonly name: string;
  readonly labels: Readonly<Record<string, string>>;
}

/**
 * **Une famille de valeurs** — ce qu'un fichier de `values/` apporte au
 * dictionnaire. Une par famille du catalogue des faits, pour que chaque lot de
 * phrases n'ait à toucher que la sienne ; l'index (`values/index.ts`) les
 * réunit et le test de clôture vérifie qu'elles ne se contredisent pas.
 *
 * Quatre manières dont une valeur arrive au détail, quatre entrées :
 */
export interface ValueFamily {
  /**
   * Les énumérations du catalogue (`z.enum`), reconnues à l'ensemble EXACT de
   * leurs valeurs : le schéma ne dit pas comment l'énumération s'appelle, il
   * dit ce qu'elle contient. `["delivery", "pickup"]` est le mode
   * d'acheminement où qu'il paraisse, même sous une clé `from` ou `to`.
   */
  readonly enums: readonly ValueDomain[];
  /**
   * Les littéraux (`z.literal("staff")`) : une valeur seule, qu'aucun
   * ensemble ne permet de reconnaître — elle se nomme donc pour elle-même, et
   * doit garder le même sens partout où elle paraît.
   */
  readonly literals?: Readonly<Record<string, string>>;
  /**
   * Les clés d'un `z.record`, par nom du CHAMP qui porte le record
   * (`vatByContext` → les contextes de vente). `free` : des clés de donnée,
   * saisies par quelqu'un (le nom d'une option de déclinaison) — elles
   * s'affichent telles quelles, et c'est juste.
   */
  readonly recordKeys?: Readonly<Record<string, ValueDomain | 'free'>>;
  /**
   * Les chaînes que le catalogue type `z.string()` alors qu'elles sont prises
   * dans un ensemble fermé (`fields`, `role`, `channel`), par nom de champ.
   * Une valeur hors de l'ensemble s'affiche telle quelle : la chaîne reste
   * libre au schéma, et une ligne ancienne peut porter autre chose.
   */
  readonly strings?: Readonly<Record<string, ValueDomain>>;
}

/**
 * Le « champ » d'un record qui EST la charge — il n'est rangé sous aucune clé.
 * Un seul cas au catalogue (vérifié le 2026-09-19) : le taux par contexte de
 * vente du lot A (`vatByContextV1`), charge de `product.vat_changed` et
 * `product_category.vat_changed` avant le lot B.
 */
export const ROOT_RECORD = '(racine)';

/** Un ensemble à partir d'un `Record` déjà écrit ailleurs (contrats, `b2b-ui`). */
export function domain(name: string, labels: Readonly<Record<string, string>>): ValueDomain {
  return { name, labels };
}

/** Un ensemble à partir d'une fonction de libellé déjà écrite ailleurs. */
export function domainOf<V extends string>(
  name: string,
  values: readonly V[],
  label: (value: V) => string,
): ValueDomain {
  return { name, labels: Object.fromEntries(values.map((value) => [value, label(value)])) };
}
