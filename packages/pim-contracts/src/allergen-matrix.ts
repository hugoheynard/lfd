/**
 * Contrat de fil de la **matrice des allergènes** — `GET /pim/allergen-matrix`
 * et son export tableur (`documentation/pim/plan-matrice-des-allergenes.md`,
 * lot AM1).
 *
 * La matrice est une LECTURE : seul le schéma de la demande est validé, la vue
 * reste plain. Elle dit trois choses par case et quatre par ligne, et c'est
 * tout son objet : « non renseigné » n'est pas « aucun », et « peut contenir »
 * n'est pas « contient ».
 */
import { z } from "zod";

import { LOCALES, type Locale } from "./shared.js";

/**
 * Quelles fiches : `published` = les produits publiés dans le PIM (Q0 du plan,
 * sans condition de canal) ; `all` = brouillons compris. Les archivés jamais.
 */
export const ALLERGEN_MATRIX_SCOPES = ["published", "all"] as const;
export type AllergenMatrixScope = (typeof ALLERGEN_MATRIX_SCOPES)[number];

const matrixFlagSchema = z
  .enum(["1", "true", "0", "false"])
  .transform((raw) => raw === "1" || raw === "true");

/** La FORME d'une demande de matrice — chaque paramètre a son défaut. */
export const allergenMatrixQuerySchema = z.object({
  locale: z.enum(LOCALES).default("fr"),
  scope: z.enum(ALLERGEN_MATRIX_SCOPES).default("published"),
  /** Une famille ET ses sous-familles. Absent = toutes. */
  categoryId: z.string().trim().min(1).optional(),
  /** Défaut : inclus — on doit VOIR ce qui n'est pas renseigné. */
  includeUndeclared: matrixFlagSchema.default(true),
});
export type AllergenMatrixQuery = z.infer<typeof allergenMatrixQuerySchema>;

/**
 * L'état d'une LIGNE, toujours écrit en clair :
 *
 * - `not_declared` — ni déclaration propre, ni alignement sur une déclinaison
 *   déclarée ; aucune case n'est rendue ;
 * - `none_declared` — l'affirmation positive « aucun » (ni allergène, ni trace) ;
 * - `to_review` — un code déclaré n'est rangé NULLE PART par le référentiel
 *   (inconnu, ou dans une catégorie maison archivée) : la ligne garde ses
 *   cases, mais n'est jamais lue « aucun ». Un code hors annexe II mais rangé
 *   (sarrasin, maison) se nomme dans « Autres » et ne rend PAS la ligne à
 *   revoir (Q3, qui l'emporte sur la première rédaction du §1) ;
 * - `declared` — les cases parlent.
 */
export const ALLERGEN_MATRIX_ROW_STATES = [
  "not_declared",
  "none_declared",
  "to_review",
  "declared",
] as const;
export type AllergenMatrixRowState = (typeof ALLERGEN_MATRIX_ROW_STATES)[number];

/** Ce qu'une case dit : contient, peut contenir, ou ni l'un ni l'autre. */
export type AllergenMatrixPresence = "contains" | "traces" | "absent";

/** Une colonne : une catégorie de l'annexe II, dans l'ordre du référentiel. */
export interface AllergenMatrixColumn {
  /** La catégorie INCO — `gluten`, `tree_nuts`… */
  readonly category: string;
  /** La mention d'étiquette, dans la langue demandée (repli français). */
  readonly label: string;
}

export interface AllergenMatrixCell {
  readonly category: string;
  readonly presence: AllergenMatrixPresence;
  /**
   * Les précisions que l'annexe II impose de NOMMER — la céréale, le fruit à
   * coque — pour ce qui est CONTENU. Vide pour les autres catégories.
   */
  readonly contains: readonly string[];
  /** Les mêmes précisions, pour ce qui est en TRACES. */
  readonly traces: readonly string[];
}

/**
 * Un allergène déclaré HORS annexe II mais rangé par le référentiel — une
 * entrée de « hors obligation UE » ou d'une catégorie maison (Q3).
 *
 * Règle de RENDU (AM0, décision de Hugo) : le code GS1 s'affiche à côté du
 * libellé quand `official` — une entrée maison n'est jamais officielle, son
 * code libre ne s'affiche pas.
 */
export interface AllergenMatrixOtherAllergen {
  readonly code: string;
  /** Libellé granulaire, dans la langue demandée (repli français). */
  readonly label: string;
  readonly official: boolean;
}

/** La colonne « Autres », après les catégories de l'annexe II : elle NOMME. */
export interface AllergenMatrixOthersCell {
  readonly presence: AllergenMatrixPresence;
  readonly contains: readonly AllergenMatrixOtherAllergen[];
  readonly traces: readonly AllergenMatrixOtherAllergen[];
}

/** Une ligne = une déclinaison (Q1 : toujours une par déclinaison). */
export interface AllergenMatrixRow {
  readonly productId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productName: string;
  /** `null` quand le produit n'a qu'une déclinaison : le nom du produit suffit. */
  readonly variantName: string | null;
  readonly state: AllergenMatrixRowState;
  /** Une case par colonne, dans le même ordre ; vide pour `not_declared`. */
  readonly cells: readonly AllergenMatrixCell[];
  /** La colonne « Autres » ; `null` pour `not_declared`. */
  readonly others: AllergenMatrixOthersCell | null;
}

export interface AllergenMatrixFamily {
  readonly id: string;
  readonly name: string;
  readonly rows: readonly AllergenMatrixRow[];
}

/** La matrice entière — un instantané daté. */
export interface AllergenMatrixView {
  readonly locale: Locale;
  readonly scope: AllergenMatrixScope;
  readonly categoryId: string | null;
  readonly includeUndeclared: boolean;
  /** Instant ISO de génération : un imprimé vieillit, il doit le dire. */
  readonly generatedAt: string;
  /**
   * Instant ISO de la dernière mise à jour d'une fiche retenue (fiche,
   * déclinaison, déclaration d'allergènes) ; `null` si aucune fiche n'est
   * retenue. Ce qu'il ne voit pas : une fiche SORTIE du périmètre (archivée,
   * dépubliée) n'y laisse pas de trace, et le référentiel n'y compte pas.
   */
  readonly lastModifiedAt: string | null;
  /**
   * `false` dès qu'une mention de la matrice (colonne ou précision) manque
   * dans la langue demandée et s'affiche donc en français (Q4) : le rendu le
   * dit en tête, jamais par une case vide.
   */
  readonly mentionsTranslated: boolean;
  readonly columns: readonly AllergenMatrixColumn[];
  readonly families: readonly AllergenMatrixFamily[];
}

/** Les mots fixes d'une matrice dans une langue — en-têtes, états, valeurs. */
export interface AllergenMatrixWording {
  readonly headers: {
    readonly family: string;
    readonly product: string;
    readonly variant: string;
    readonly sku: string;
    readonly state: string;
    readonly others: string;
  };
  readonly states: Readonly<Record<AllergenMatrixRowState, string>>;
  readonly presence: { readonly contains: string; readonly traces: string };
}

/**
 * **Le dictionnaire unique de la matrice** — le tableur (AM1), le PDF (AM2)
 * et l'écran (AM3) le lisent ici, pour qu'un même mot ne s'écrive pas trois
 * fois (Q4 : une sortie est ENTIÈRE dans sa langue).
 *
 * ⚠️ L'anglais et l'italien sont des traductions de libellés d'interface, non
 * relues par Hugo au 2026-10-20 — rien de réglementaire : les mentions
 * d'allergènes viennent du référentiel.
 */
export const ALLERGEN_MATRIX_WORDING: Readonly<Record<Locale, AllergenMatrixWording>> = {
  fr: {
    headers: {
      family: "Famille",
      product: "Produit",
      variant: "Déclinaison",
      sku: "SKU",
      state: "État",
      others: "Autres",
    },
    states: {
      not_declared: "Non renseigné",
      none_declared: "Aucun allergène déclaré",
      to_review: "Déclaration à revoir",
      declared: "",
    },
    presence: { contains: "contient", traces: "traces" },
  },
  en: {
    headers: {
      family: "Family",
      product: "Product",
      variant: "Variant",
      sku: "SKU",
      state: "Status",
      others: "Other",
    },
    states: {
      not_declared: "Not provided",
      none_declared: "No allergens declared",
      to_review: "Declaration to review",
      declared: "",
    },
    presence: { contains: "contains", traces: "traces" },
  },
  it: {
    headers: {
      family: "Famiglia",
      product: "Prodotto",
      variant: "Variante",
      sku: "SKU",
      state: "Stato",
      others: "Altri",
    },
    states: {
      not_declared: "Non compilato",
      none_declared: "Nessun allergene dichiarato",
      to_review: "Dichiarazione da rivedere",
      declared: "",
    },
    presence: { contains: "contiene", traces: "tracce" },
  },
};
