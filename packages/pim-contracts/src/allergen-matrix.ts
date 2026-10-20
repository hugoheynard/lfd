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

/**
 * Les mots du DOCUMENT imprimé (lot AM2) — tête, périmètre, légende, pied.
 * Une phrase qui porte une valeur la reçoit par un repère entre accolades
 * (`{date}`, `{name}`, `{page}`, `{count}`) : l'ordre des mots appartient à
 * la langue, pas au rendu.
 */
export interface AllergenMatrixDocumentWording {
  readonly generatedAt: string;
  readonly lastModifiedAt: string;
  readonly perimeter: string;
  readonly scopes: Readonly<Record<AllergenMatrixScope, string>>;
  readonly family: string;
  readonly allFamilies: string;
  readonly undeclaredIncluded: string;
  readonly undeclaredExcluded: string;
  /** Q4 : une mention manque dans la langue et s'affiche en français. */
  readonly untranslated: string;
  readonly legend: string;
  readonly legendAbsent: string;
  readonly legendNotDeclared: string;
  /** Plan §1 : « Établie à partir des fiches au [date] ; … ». */
  readonly footer: string;
  readonly page: string;
  readonly continued: string;
  readonly empty: string;
  /** « 20 octobre 2026 à 21:59 » : le mot entre la date et l'heure. */
  readonly timeJoiner: string;
  readonly months: readonly string[];
}

/** Les mots fixes d'une matrice dans une langue — en-têtes, états, valeurs. */
export interface AllergenMatrixWording {
  /**
   * Le titre de la matrice = le titre de l'annexe II d'INCO 1169/2011 —
   * RÉGLEMENTAIRE, verbatim.
   */
  readonly title: string;
  readonly headers: {
    readonly family: string;
    readonly product: string;
    readonly variant: string;
    readonly sku: string;
    readonly state: string;
    readonly others: string;
  };
  readonly states: Readonly<Record<AllergenMatrixRowState, string>>;
  /**
   * `contains` est RÉGLEMENTAIRE (art. 21 d'INCO 1169/2011, verbatim) ;
   * `traces` est une FORMULE D'USAGE validée par Hugo : le règlement n'en
   * fixe aucune pour l'étiquetage de précaution (art. 36).
   */
  readonly presence: { readonly contains: string; readonly traces: string };
  readonly document: AllergenMatrixDocumentWording;
}

/**
 * **Le dictionnaire unique de la matrice** — le tableur (AM1), le PDF (AM2)
 * et l'écran (AM3) le lisent ici, pour qu'un même mot ne s'écrive pas trois
 * fois (Q4 : une sortie est ENTIÈRE dans sa langue).
 *
 * Ce qui est RÉGLEMENTAIRE (décision de Hugo, 2026-10-20) — recopié du
 * règlement (UE) n° 1169/2011 consolidé au 2018-01-01 (EUR-Lex,
 * `CELEX:02011R1169-20180101`), dans ses versions fr, en et it :
 *
 * - `title` = le titre de l'annexe II ;
 * - `presence.contains` = le mot de l'art. 21 (« contient », « contains »,
 *   « contiene »).
 *
 * `presence.traces` est une FORMULE D'USAGE, validée par Hugo le même jour :
 * le règlement n'en fixe aucune (art. 36, information facultative).
 *
 * ⚠️ Tous les AUTRES mots — en-têtes, états, tête et pied du document — sont
 * des traductions de libellés d'interface, rien de réglementaire ; les
 * mentions d'allergènes elles-mêmes viennent du référentiel.
 */
export const ALLERGEN_MATRIX_WORDING: Readonly<Record<Locale, AllergenMatrixWording>> = {
  fr: {
    title: "Substances ou produits provoquant des allergies ou intolérances",
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
    presence: { contains: "contient", traces: "Peut contenir des traces" },
    document: {
      generatedAt: "Générée le {date}",
      lastModifiedAt: "Dernière modification d'une fiche : {date}",
      perimeter: "Périmètre : {value}",
      scopes: { published: "Produits publiés", all: "Tous les produits, brouillons compris" },
      family: "Famille : {name}",
      allFamilies: "Toutes les familles",
      undeclaredIncluded: "Non renseignés inclus",
      undeclaredExcluded: "Non renseignés exclus",
      untranslated:
        "Certaines mentions n'existent pas encore dans cette langue : elles s'affichent en français.",
      legend: "Légende :",
      legendAbsent: "Case vide : ne contient pas cette catégorie",
      legendNotDeclared: "« Non renseigné » : la fiche ne déclare rien, ce n'est pas « aucun »",
      footer:
        "Établie à partir des fiches au {date} ; la déclaration en vigueur est celle de l'étiquette.",
      page: "Page {page}/{count}",
      continued: "(suite)",
      empty: "Aucune déclinaison dans ce périmètre.",
      timeJoiner: "à",
      months: [
        "janvier",
        "février",
        "mars",
        "avril",
        "mai",
        "juin",
        "juillet",
        "août",
        "septembre",
        "octobre",
        "novembre",
        "décembre",
      ],
    },
  },
  en: {
    title: "Substances or products causing allergies or intolerances",
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
    presence: { contains: "contains", traces: "May contain traces" },
    document: {
      generatedAt: "Generated on {date}",
      lastModifiedAt: "Last product sheet change: {date}",
      perimeter: "Scope: {value}",
      scopes: { published: "Published products", all: "All products, drafts included" },
      family: "Family: {name}",
      allFamilies: "All families",
      undeclaredIncluded: "Not provided included",
      undeclaredExcluded: "Not provided excluded",
      untranslated: "Some mentions do not exist in this language yet: they are shown in French.",
      legend: "Key:",
      legendAbsent: "Empty cell: does not contain this category",
      legendNotDeclared: '"Not provided": the sheet declares nothing, which is not "none"',
      footer:
        "Drawn up from the product sheets on {date}; the declaration in force is the one on the label.",
      page: "Page {page}/{count}",
      continued: "(continued)",
      empty: "No variant in this scope.",
      timeJoiner: "at",
      months: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ],
    },
  },
  it: {
    title: "Sostanze o prodotti che provocano allergie o intolleranze",
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
    presence: { contains: "contiene", traces: "Può contenere tracce" },
    document: {
      generatedAt: "Generata il {date}",
      lastModifiedAt: "Ultima modifica di una scheda: {date}",
      perimeter: "Perimetro: {value}",
      scopes: { published: "Prodotti pubblicati", all: "Tutti i prodotti, bozze comprese" },
      family: "Famiglia: {name}",
      allFamilies: "Tutte le famiglie",
      undeclaredIncluded: "Non compilati inclusi",
      undeclaredExcluded: "Non compilati esclusi",
      untranslated:
        "Alcune diciture non esistono ancora in questa lingua: sono riportate in francese.",
      legend: "Legenda:",
      legendAbsent: "Casella vuota: non contiene questa categoria",
      legendNotDeclared:
        "« Non compilato »: la scheda non dichiara nulla, non significa « nessuno »",
      footer:
        "Redatta a partire dalle schede il {date}; la dichiarazione in vigore è quella dell'etichetta.",
      page: "Pagina {page}/{count}",
      continued: "(segue)",
      empty: "Nessuna variante in questo perimetro.",
      timeJoiner: "alle",
      months: [
        "gennaio",
        "febbraio",
        "marzo",
        "aprile",
        "maggio",
        "giugno",
        "luglio",
        "agosto",
        "settembre",
        "ottobre",
        "novembre",
        "dicembre",
      ],
    },
  },
};
