import { z } from "zod";

/**
 * **La grammaire du catalogue des faits** — ce qu'une entrée est, et les
 * briques dont les charges sont faites.
 *
 * Une charge se décrit avec des **unités nommées** plutôt qu'avec des nombres
 * nus : un `priceMillicents` et un `totalCents` sont deux `number` pour le
 * typage, et trois ordres de grandeur d'écart pour qui les affiche. L'unité est
 * portée par la métadonnée du schéma (`.meta({ unit })`) : c'est ce qui permet
 * au moteur de phrases (lot C du plan `plan-phrases-du-journal.md`) de choisir
 * son formateur **d'après le schéma**, sans une table de clés tenue à la main.
 *
 * Même chose pour les **identifiants nus** (`.meta({ ref })`) : ils disent
 * quelles clés ne citent un objet que par son id, sans son libellé — la liste
 * de travail du lot B.
 */

/** Les unités qu'une valeur de charge peut porter. */
export const JOURNAL_UNITS = [
  /** Entier, centimes d'euro. */
  "cents",
  /** Entier, millièmes de centime — les prix unitaires. */
  "millicents",
  /** Entier, points de base : 10 000 = 100 %. */
  "basisPoints",
  /** Nombre, pourcentage : 5.5 = 5,5 %. */
  "percent",
  /** Chaîne, instant ISO 8601 (`2026-09-19T08:00:00.000Z`). */
  "instant",
  /** Chaîne, jour civil ISO (`2026-09-19`). */
  "day",
  /** Chaîne, heure d'horloge (`17:30`). */
  "clockTime",
  /** Entier, minutes. */
  "minutes",
  /** Entier, jours. */
  "days",
  /** Nombre, grammes. */
  "grams",
  /** Nombre, kilocalories. */
  "kcal",
] as const;
export type JournalUnit = (typeof JOURNAL_UNITS)[number];

/** La métadonnée qu'une valeur de charge peut porter. */
export interface JournalValueMeta {
  readonly unit?: JournalUnit;
  /** L'objet qu'un identifiant nu désigne (`company`, `product_category`…). */
  readonly ref?: string;
}

/**
 * Une entrée du catalogue : la charge, et si le type s'écrit encore.
 *
 * `retired` : le type existe en base mais plus aucun code ne l'écrit (renommé
 * sans migration, geste supprimé). Il reste au catalogue pour que ses lignes se
 * lisent toujours ; l'écrire aujourd'hui est une faute que la vérification à
 * l'écriture signale.
 */
export interface JournalFactEntry<S extends z.ZodType = z.ZodType, R extends boolean = boolean> {
  readonly payload: S;
  readonly retired: R;
  /**
   * Les formes **antérieures** de la charge, encore en base (lot B du plan
   * `plan-phrases-du-journal.md`, 2026-09-19). Le journal ne se réécrit pas :
   * quand une charge gagne un libellé ou perd une coordonnée, les lignes
   * d'avant gardent leur forme, et le lecteur doit savoir la lire. L'écriture,
   * elle, ne vérifie que `payload` — une forme ancienne ne s'écrit plus.
   */
  readonly history: readonly z.ZodType[];
}

/** Un type qui s'écrit aujourd'hui. */
export function fact<S extends z.ZodType>(
  payload: S,
  history: readonly z.ZodType[] = [],
): JournalFactEntry<S, false> {
  return { payload, retired: false, history };
}

/** Un type qui ne s'écrit plus, avec sa charge telle qu'elle a été écrite. */
export function retired<S extends z.ZodType>(
  payload: S,
  history: readonly z.ZodType[] = [],
): JournalFactEntry<S, true> {
  return { payload, retired: true, history };
}

/** Une famille : des types, et leur entrée. */
export type JournalFactFamily = Readonly<Record<string, JournalFactEntry>>;

/**
 * Une charge **fermée** : une clé qui n'est pas décrite ici échoue. C'est ce
 * qui tient l'exigence « rien ne se perd » — une clé que le catalogue ignore
 * est une clé que l'écran ne saurait pas nommer.
 */
export const payload = z.strictObject;

/** La charge vide — un fait qui n'a rien à dire de plus que son sujet. */
export const empty = (): z.ZodType => z.strictObject({});

export const cents = () => z.number().int().meta({ unit: "cents" });
export const millicents = () => z.number().int().meta({ unit: "millicents" });
export const basisPoints = () => z.number().int().meta({ unit: "basisPoints" });
export const percent = () => z.number().meta({ unit: "percent" });
export const instant = () => z.iso.datetime().meta({ unit: "instant" });
export const day = () => z.iso.date().meta({ unit: "day" });
export const clockTime = () =>
  z
    .string()
    .regex(/^\d{2}:\d{2}$/u)
    .meta({ unit: "clockTime" });
export const minutes = () => z.number().int().meta({ unit: "minutes" });
export const days = () => z.number().int().meta({ unit: "days" });
export const grams = () => z.number().meta({ unit: "grams" });
export const kcal = () => z.number().meta({ unit: "kcal" });
/** Un compte (de lignes, d'articles, de tables…) : un entier positif ou nul. */
export const count = () => z.number().int().min(0);

/** Un identifiant **nu** — sans le libellé de ce qu'il désigne. */
export const ref = (target: string) => z.string().min(1).meta({ ref: target });

/**
 * Un texte traduisible, tel que le référentiel le stocke : le français fait
 * foi, les autres langues sont facultatives.
 *
 * Recopié de `@lfd/pim-contracts` (`LocalizedText`) plutôt qu'importé : ce
 * paquet-ci ne dépend que de zod, et le catalogue ne doit pas tirer le
 * référentiel entier pour une forme de trois clés.
 */
/**
 * Un objet cité **avec son libellé du moment** (D5 du plan des phrases) : le
 * journal dit ce qui était vrai quand c'est arrivé. L'id sert aux liens et aux
 * filtres, le nom à la lecture ; une famille renommée depuis se lit sous
 * l'ancien nom sur les lignes d'avant.
 */
export const named = (target: string) =>
  z.strictObject({ id: ref(target), name: z.string().min(1) });

/**
 * Le **libellé du sujet** de la ligne, figé à l'écriture (D6) : le nom de la
 * fiche, du client, de la personne. Clé conventionnelle `subjectLabel` de la
 * charge — la recherche lit déjà les valeurs de la charge.
 */
export const subjectLabel = () => z.string().min(1);

/**
 * Un objet cité avec son nom du moment — ou par son seul id, quand l'annuaire
 * qui devait le nommer ne le connaissait pas (une fiche staff illisible, un
 * point de retrait disparu, une société qu'aucune clé étrangère n'exige). Le
 * fait ne se perd pas pour un nom manquant, et il n'en invente pas.
 */
export const namedOrBare = (target: string) => z.union([named(target), ref(target)]);

export const localizedText = () =>
  z.strictObject({ fr: z.string(), en: z.string().optional(), it: z.string().optional() });

/** Un « avant → après » sur une même valeur. */
export const fromTo = <S extends z.ZodType>(value: S) => z.strictObject({ from: value, to: value });

/**
 * Le diff d'une section (`changesBetween`, `pim/journal/changes.ts`) : chaque
 * clé changée porte son avant et son après, les autres sont absentes.
 */
export function changes(fields: Readonly<Record<string, z.ZodType>>) {
  const entries = Object.entries(fields).map(([key, value]) => [key, fromTo(value).optional()]);
  return z.strictObject(Object.fromEntries(entries));
}

/**
 * La **portée** d'un fait du référentiel (`PimBlastRadius`), que le journal du
 * référentiel verse dans la charge sous la clé `blast`.
 */
export const blast = () =>
  z
    .strictObject({
      families: z.record(z.string(), count()).optional(),
      variants: count().optional(),
      articles: count().optional(),
    })
    .optional();
