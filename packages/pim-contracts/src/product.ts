import { z } from "zod";

import { operationAudienceSchema, type OperationAudience } from "./operation.js";

import { localizedTextSchema, optionalLocalizedTextSchema } from "./localized.js";
import {
  mediaItemPayloadSchema,
  setMediaPayloadSchema,
  type AttachedMediaView,
} from "./attached-media.js";
import type { LocalizedText } from "./shared.js";

/**
 * Contrat de fil des **produits** (catalogue). L'édition se fait **par section**
 * (une requête par section, pas par champ) ; d'où plusieurs payloads. Les vues
 * portent la déclinaison par défaut avec son prix/poids/fiche réglementaire.
 */
export const productKindSchema = z.enum(["daily", "made_to_order", "resale"]);
export type ProductKind = z.infer<typeof productKindSchema>;

/** État de publication — rendu seulement (jamais un payload). */
export type ProductStatus = "draft" | "published" | "archived";

/**
 * Valeurs nutritionnelles pour 100 g en **entrée** — chaque champ optionnel.
 *
 * L'ordre est celui de l'annexe XV du règlement UE 1169/2011, et ce n'est pas
 * une préférence de lecture : le tableau imprimé doit le suivre. Les deux
 * « dont » sont des PARTS de la ligne qui les précède — le domaine refuse
 * qu'elles la dépassent.
 */
const nutritionValuesShape = {
  energyKcal: z.number().optional(),
  fatG: z.number().optional(),
  saturatedFatG: z.number().optional(),
  carbsG: z.number().optional(),
  sugarsG: z.number().optional(),
  proteinG: z.number().optional(),
  saltG: z.number().optional(),
  /** Hors annexe XV : un renseignement produit, pas une mention obligatoire. */
  glycemicIndex: z.number().optional(),
};

const nutritionInputShape = z.object(nutritionValuesShape).optional();

/**
 * La couche éditoriale. Tout est TRADUISIBLE sauf `brand` : une marque est un
 * nom propre, elle ne se traduit pas — et la traiter comme du texte inviterait
 * à écrire « La Folie Coffee » en trois langues pour rien.
 *
 * Le domaine stockait déjà ces champs en `LocalizedText` ; c'est l'entrée qui
 * était plate, donc chaque enregistrement écrasait l'objet entier et EFFAÇAIT
 * les traductions — le même défaut que le nom, un cran plus bas.
 */
const editorialShape = {
  descriptionShort: optionalLocalizedTextSchema,
  descriptionLong: optionalLocalizedTextSchema,
  story: optionalLocalizedTextSchema,
  pairing: optionalLocalizedTextSchema,
  brand: z.string().optional(),
  seoTitle: optionalLocalizedTextSchema,
  seoDescription: optionalLocalizedTextSchema,
};

export const createProductPayloadSchema = z.object({
  /** Le nom, dans les langues renseignées. La source (`fr`) est obligatoire ;
   *  ouvrir une langue de plus ne change pas ce contrat. */
  name: localizedTextSchema,
  kind: productKindSchema,
  categoryId: z.string().min(1),
  sku: z.string().optional(),
  allergens: z.array(z.string()).optional(),
  mayContain: z.array(z.string()).optional(),
  nutrition: nutritionInputShape,
  editorial: z.object(editorialShape).optional(),
  media: z.array(mediaItemPayloadSchema).optional(),
});
export type CreateProductPayload = z.infer<typeof createProductPayloadSchema>;

export const updateProductIdentityPayloadSchema = z.object({
  /** Le nom, dans les langues renseignées. La source (`fr`) est obligatoire ;
   *  ouvrir une langue de plus ne change pas ce contrat. */
  name: localizedTextSchema,
  kind: productKindSchema,
  categoryId: z.string().min(1),
});
export type UpdateProductIdentityPayload = z.infer<typeof updateProductIdentityPayloadSchema>;

/** Comment une déclinaison se vend : à la pièce, ou au poids (en grammes). */
export const saleUnitSchema = z.enum(["piece", "weight"]);
export type SaleUnit = z.infer<typeof saleUnitSchema>;

/** Tarif & logistique d'une déclinaison. `null` = effacer. */
export const updateVariantPricingPayloadSchema = z.object({
  /**
   * Le prix **public TTC**, en centimes. C'est la seule assiette : le hors taxe
   * se calcule, il ne se saisit pas.
   */
  priceCents: z.number().int().min(0).nullable(),
  weightGrams: z.number().int().min(0).nullable(),
  /**
   * Le prix **pro HORS TAXE** saisi, en euros, sous forme de TEXTE (lot P) :
   * `"12.34567"`. Une chaîne et non un nombre, pour que le cinquième chiffre
   * ne passe jamais par un flottant ; la borne des cinq décimales est tenue par
   * le domaine (`ProPriceHt`), pas ici. Absent = inchangé, `null` = effacer.
   */
  proPriceHt: z
    .string()
    .regex(/^\d+(?:[.,]\d+)?$/u)
    .nullable()
    .optional(),
  /**
   * Le prix au kilo **pro HT** saisi, en euros et en TEXTE, comme le prix pro
   * (`plan-prix-au-kilo.md`). Informatif. Absent = inchangé, `null` = effacer.
   */
  proPricePerKgHt: z
    .string()
    .regex(/^\d+(?:[.,]\d+)?$/u)
    .nullable()
    .optional(),
  /**
   * Le prix au kilo **public TTC** saisi, en centimes. Le zéro est refusé par
   * le domaine. Absent = inchangé, `null` = effacer.
   */
  publicPricePerKgTtcCents: z.number().int().min(0).nullable().optional(),
  /**
   * Montrer chaque prix au kilo à son audience (`plan-carte-tarif.md`) : le
   * public TTC aux particuliers, le pro HT aux pros. Décochée, la case laisse
   * son prix saisi mais le canal ne le reçoit plus. Absent = inchangé.
   */
  pricePerKgShownPublic: z.boolean().optional(),
  pricePerKgShownPro: z.boolean().optional(),
  /**
   * L'unité de vente (`vente-au-poids.md`) : `piece` ou `weight`. Absent
   * = inchangée. Figée par le domaine après la première publication.
   */
  saleUnit: saleUnitSchema.optional(),
  /**
   * Au poids : le minimum et le pas de saisie, en grammes. Leur borne (> 0, et
   * vides à la pièce) est tenue par le domaine. Absent = inchangé, `null` =
   * effacer.
   */
  weightMinGrams: z.number().int().nullable().optional(),
  weightStepGrams: z.number().int().nullable().optional(),
});
export type UpdateVariantPricingPayload = z.infer<typeof updateVariantPricingPayloadSchema>;

export const productEditorialPayloadSchema = z.object(editorialShape);
export type ProductEditorialPayload = z.infer<typeof productEditorialPayloadSchema>;

/** Section « Allergènes » : ce que la déclinaison contient, et ses traces. */
export const saveVariantAllergensPayloadSchema = z.object({
  /** `[]` est une AFFIRMATION — « aucun allergène » — pas une absence de réponse. */
  allergens: z.array(z.string()),
  mayContain: z.array(z.string()).optional(),
});
export type SaveVariantAllergensPayload = z.infer<typeof saveVariantAllergensPayloadSchema>;

/**
 * Les codes que la section « Nutrition » n'a pas le droit de porter.
 *
 * L'ancienne route `/nutrition` recevait la fiche entière, allergènes compris.
 * Les accepter en silence pour ne pas les écrire serait le pire des deux
 * mondes : un `200` sur de la donnée réglementaire que personne n'a
 * enregistrée. Le refus nomme donc la route de sortie (§7 du plan).
 */
const REGULATORY_KEYS = ["allergens", "mayContain"] as const;

/** Section « Nutrition » : les valeurs pour 100 g, et RIEN d'autre. */
export const saveVariantNutritionPayloadSchema = z
  .looseObject(nutritionValuesShape)
  .superRefine((body, ctx) => {
    for (const key of REGULATORY_KEYS) {
      if (key in body) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message:
            "les allergènes ne s'enregistrent plus ici — utiliser PUT " +
            ".../variants/{variantId}/allergens",
        });
      }
    }
  })
  .transform((body): SaveVariantNutritionPayload => ({
    energyKcal: body.energyKcal,
    fatG: body.fatG,
    saturatedFatG: body.saturatedFatG,
    carbsG: body.carbsG,
    sugarsG: body.sugarsG,
    proteinG: body.proteinG,
    saltG: body.saltG,
    glycemicIndex: body.glycemicIndex,
  }));

/**
 * Les huit valeurs, chacune facultative. Écrite à la main plutôt qu'inférée du
 * schéma : celui-ci se TRANSFORME, et son entrée porte les clés interdites.
 */
export interface SaveVariantNutritionPayload {
  readonly energyKcal?: number | undefined;
  readonly fatG?: number | undefined;
  readonly saturatedFatG?: number | undefined;
  readonly carbsG?: number | undefined;
  readonly sugarsG?: number | undefined;
  readonly proteinG?: number | undefined;
  readonly saltG?: number | undefined;
  readonly glycemicIndex?: number | undefined;
}

// ── Vues (formes rendues) ──────────────────────────────────────────────────

/**
 * La déclaration d'allergènes d'une déclinaison. `null` = personne ne s'est
 * prononcé ; `declared: []` = « aucun allergène », une affirmation positive.
 *
 * Un objet nullable et non deux champs plats : les deux tableaux viennent
 * d'**une seule ligne** de `variant_allergens`, et l'absence de ligne est donc
 * indivisible — on ne peut pas lire les traces sans avoir traité le cas
 * « personne n'a déclaré ». Deux champs à plat rouvriraient la divergence que
 * ce chantier ferme (`plan-separer-allergenes-et-nutrition.md`, §5 et §7).
 */
export interface VariantAllergenSheet {
  /** Ce que la déclinaison CONTIENT — codes du référentiel INCO. */
  readonly declared: readonly string[];
  /** Les traces « peut contenir » — des allergènes, soumis au même référentiel. */
  readonly mayContain: readonly string[];
}

/**
 * Les VALEURS pour 100 g, et rien d'autre ; chaque champ `null` = non renseigné.
 *
 * ⚠️ Les traces « peut contenir » n'y sont plus depuis le 2026-09-22 : une
 * trace est une déclaration d'allergène, elle vit dans
 * {@link VariantAllergenSheet} et suit le drapeau des allergènes.
 */
export interface VariantNutritionView {
  readonly energyKcal: number | null;
  readonly fatG: number | null;
  readonly saturatedFatG: number | null;
  readonly carbsG: number | null;
  readonly sugarsG: number | null;
  readonly proteinG: number | null;
  readonly saltG: number | null;
  readonly glycemicIndex: number | null;
}

export interface VariantView {
  readonly id: string;
  readonly sku: string;
  /** Le **nom de boutique** : celui qui part sur le fil, au devis, à la facture. */
  readonly name: LocalizedText;
  /**
   * Le **libellé interne** — l'onglet du référentiel. Égal au français du nom
   * de boutique tant qu'on ne les a pas distingués ; ne part jamais sur le fil.
   */
  readonly internalLabel: string;
  readonly options: Readonly<Record<string, string>>;
  readonly isDefault: boolean;
  readonly isDiscontinued: boolean;
  readonly position: number;
  /**
   * Le **prix public TTC** en centimes ; `null` = pas encore tarifé.
   *
   * Il n'y a plus d'assiette à côté : le nombre est le prix d'étiquette, et le
   * hors taxe se déduit du taux de chaque canal (`htFromTtc`).
   */
  readonly priceCents: number | null;
  readonly weightGrams: number | null;
  /**
   * Le prix **pro HORS TAXE saisi**, en millicentimes (10⁻⁵ €) ; `null` = pas
   * saisi (lot P). **Résolu** comme le prix public : une déclinaison qui suit le
   * tarif du défaut rend ici celui du défaut. Lu par le fil sous la méthode
   * `entered` seulement.
   */
  readonly proPriceMillicents: number | null;
  /**
   * Les prix au kilo **saisis** (`plan-prix-au-kilo.md`) : le pro HT en
   * millicentimes, le public TTC en centimes ; `null` = non saisi. Résolus
   * comme le tarif : une déclinaison alignée rend ceux du défaut.
   */
  readonly proPricePerKgMillicents: number | null;
  readonly publicPricePerKgTtcCents: number | null;
  /**
   * Chaque prix au kilo est-il montré à son audience (`plan-carte-tarif.md`) ?
   * Résolus comme le tarif : une déclinaison alignée rend ceux du défaut.
   */
  readonly pricePerKgShownPublic: boolean;
  readonly pricePerKgShownPro: boolean;
  /**
   * L'unité de vente, PROPRE à la déclinaison — jamais héritée du défaut
   * (`vente-au-poids.md`). Au poids, le minimum (`null` = aucun) et le pas
   * de saisie, en grammes ; `null` tous deux à la pièce.
   */
  readonly saleUnit: SaleUnit;
  readonly weightMinGrams: number | null;
  readonly weightStepGrams: number | null;
  /**
   * Déjà publiée : l'unité de vente ne peut plus changer, l'écran grise le
   * sélecteur.
   */
  readonly hasBeenPublished: boolean;
  /**
   * Cette déclinaison **suit les ALLERGÈNES de celle par défaut** — traces
   * comprises, puisqu'une trace est un allergène.
   *
   * Toujours `false` sur le défaut, qui ne peut pas se suivre lui-même. L'écran
   * en fait une case « aligner sur le défaut » : cochée, la carte des
   * allergènes se lit sans se saisir.
   *
   * ⚠️ Le nom dit encore « réglementaire » parce que la COLONNE le dit : la
   * fiche s'aligne par moitié depuis le 2026-09-22, et renommer un champ servi
   * à un front déployé se paierait en trois déploiements pour zéro sens de plus
   * (`plan-separer-allergenes-et-nutrition.md`, §6d).
   */
  readonly regulatoryFollowsDefault: boolean;
  /**
   * Cette déclinaison **suit les VALEURS nutritionnelles de celle par défaut**.
   *
   * Séparé du précédent parce que les deux moitiés s'enregistrent séparément :
   * saisir un tableau nutritionnel propre à une déclinaison ne doit pas
   * l'obliger à retaper les allergènes du défaut, ni l'inverse.
   *
   * ⚠️ Les traces ne suivent PAS ce drapeau mais celui des allergènes — elles
   * sont dans {@link VariantView.allergenSheet}, pas dans `nutrition`.
   */
  readonly nutritionFollowsDefault: boolean;
  /**
   * Cette déclinaison **suit le tarif de celle par défaut** — prix ET poids.
   *
   * ⚠️ `priceCents` et `weightGrams` sont **résolus** comme les allergènes : ils
   * rendent ici ceux du défaut. C'est ce drapeau, et lui seul, qui dit d'où ils
   * viennent.
   */
  readonly pricingFollowsDefault: boolean;
  /**
   * **La quantité minimale d'achat**, en pièces, par audience
   * (`plan-quantite-minimale.md`). `null` = aucun minimum.
   *
   * ⚠️ **Résolue** comme le tarif : une déclinaison qui suit le défaut rend ici
   * les minimums du défaut, et une déclinaison au poids aucun.
   */
  readonly minQuantities: VariantMinQuantities;
  /** Suit-elle la quantité minimale du défaut ? Toujours `false` sur le défaut. */
  readonly minQuantityFollowsDefault: boolean;
  /**
   * La déclaration d'allergènes, traces comprises ; `null` = non renseignée.
   *
   * ⚠️ **Résolue.** Une déclinaison alignée rend ici la déclaration du défaut,
   * pas `null` : c'est ce qu'elle porte réellement sur l'étiquette et ce qui
   * part aux canaux. Pour savoir si elle la possède ou la suit, lire
   * {@link VariantView.regulatoryFollowsDefault} — c'est la seule question à
   * laquelle ce champ ne répond pas.
   */
  readonly allergenSheet: VariantAllergenSheet | null;
  /** Les valeurs pour 100 g ; `null` = personne n'en a saisi aucune. */
  readonly nutrition: VariantNutritionView | null;
}

export interface ProductView {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly kind: ProductKind;
  readonly categoryId: string;
  readonly status: ProductStatus;
  readonly variants: readonly VariantView[];
  /**
   * La **dérogation** de cette fiche au taux de sa famille, par clé de contexte.
   * Vide = elle hérite, et c'est le cas courant.
   *
   * La vue rend la dérogation SEULE, pas le taux effectif : l'écran affiche
   * déjà l'héritage de la famille, et rendre les deux fusionnés lui retirerait
   * le moyen de dire « ce taux-là vient d'ici ».
   */
  readonly vatByContext: Readonly<Record<string, string>>;
  /**
   * **Vendu seulement pendant une opération** (D3 du plan des opérations
   * datées). `false` = article courant, le cas de toute fiche d'avant le lot 2.
   */
  readonly operationOnly: boolean;
  /**
   * **Demande le froid** — conservation réfrigérée (lot 4 bis du plan de
   * préparation de tournée, v2-2). `false` = personne ne l'a déclaré, pas
   * « se conserve au sec ».
   */
  readonly requiresCold: boolean;
  /**
   * **Montrer chaque déclinaison en vignette** au rayon de la boutique ;
   * `false` = seule la déclinaison par défaut (`plan-declinaisons-en-vignette.md`).
   * `true` pour toute fiche tant que personne ne l'a décochée.
   */
  readonly variantsAsTiles: boolean;
  /**
   * La clientèle **propre** à la fiche ; `null` = elle suit sa famille. La
   * dérogation seule, comme les canaux — l'effective est à côté.
   */
  readonly audience: OperationAudience | null;
  /** À qui la fiche vend réellement : la sienne, sinon celle de sa famille. */
  readonly effectiveAudience: OperationAudience;
  /** Vrai quand l'audience effective vient de la famille. */
  readonly audienceInherited: boolean;
}

/**
 * Ce qui empêche une fiche d'être activée — la forme exacte que le refus
 * `catalogue.product.not_activatable` décrit.
 */
export interface ProductActivationGapsView {
  /** Toutes les déclinaisons sont arrêtées : rien ne se vendrait. */
  readonly allDiscontinued: boolean;
  /**
   * SKU → ce qui lui manque. Vide dès qu'UNE déclinaison est complète : une
   * seule suffit à activer.
   */
  readonly byVariant: Readonly<Record<string, readonly string[]>>;
}

/**
 * Une ligne de la LISTE des fiches : la vue, plus ce qu'une activation en
 * dirait. Séparée de {@link ProductView} parce que le détail ne la calcule pas.
 */
export interface ProductListView extends ProductView {
  /**
   * Une activation la mettrait en vente maintenant. Calculé par le même code
   * que le refus d'activation. `false` pour une fiche déjà publiée (rien à
   * activer) ou archivée (elle se restaure d'abord).
   */
  readonly activatable: boolean;
  /** Les manques jugés pour un brouillon ; `null` pour une publiée ou une archivée. */
  readonly activationGaps: ProductActivationGapsView | null;
  /** Elle porte au moins une image, quel que soit son rôle (filtre « Sans image », 2026-10-28). */
  readonly illustrated: boolean;
}

/**
 * Couche éditoriale rendue **dans toutes ses langues** ; `null` = non renseigné.
 *
 * La vue rendait le français à plat, avec pour raison « le back-office est
 * monolingue FR ». Il ne l'est plus — et surtout, une vue qui aplatit prive de
 * traduction TOUT consommateur, y compris celui qui voudrait l'italien. C'est au
 * lecteur qui vise une langue d'appeler `readLocalized`, parce que lui seul sait
 * laquelle il vise.
 */
export interface ProductEditorialView {
  readonly descriptionShort: LocalizedText | null;
  readonly descriptionLong: LocalizedText | null;
  readonly story: LocalizedText | null;
  readonly pairing: LocalizedText | null;
  readonly brand: string | null;
  readonly seoTitle: LocalizedText | null;
  readonly seoDescription: LocalizedText | null;
}

/**
 * Un visuel attaché à un PRODUIT. Un alias, et c'est voulu : la forme est celle
 * de {@link AttachedMediaView}, la nommer ici garde les appelants lisibles sans
 * inventer un second contrat.
 */
export type ProductMediaView = AttachedMediaView;

/**
 * **La déclaration qu'une fiche est publiable**, telle que l'écran la lit.
 *
 * `null` = personne ne s'est prononcé. Ce n'est pas un état de publication :
 * une fiche déclarée publiable n'est pas en vente, elle est *vouchée*. Le
 * schéma dit qu'elle est bien remplie ; ceci dit que quelqu'un a regardé.
 *
 * `contentUpdatedAt` accompagne toujours la déclaration parce qu'elle seule ne
 * suffit pas à répondre à la question qu'on lui pose. Rien ne périme la
 * déclaration en écriture — c'est un fait daté, pas une garantie perpétuelle —
 * donc c'est la LECTURE qui compare : la fiche a-t-elle bougé depuis ? Les deux
 * dates voyagent ensemble pour qu'aucun appelant ne puisse afficher la première
 * sans la seconde et annoncer « publiable » sur une fiche modifiée depuis.
 */
export interface ProductReadinessView {
  readonly readyAt: string;
  /**
   * L'id de la fiche staff de l'auteur, ou une valeur qui ne désigne personne —
   * un marqueur (`system`, `seed-pim`…) ou un `sub` que la conversion n'a
   * rattaché à aucune fiche. L'écran affiche `readyByName` et ne lit ce champ
   * que quand le nom manque.
   */
  readonly readyBy: string;
  /**
   * « Prénom Nom » de la personne qui a signé, résolu au serveur. `null` =
   * l'auteur ne désigne aucune fiche : l'écran affiche alors `readyBy`.
   */
  readonly readyByName: string | null;
}

/** Détail enrichi (socle + éditorial + visuels) — pour la page d'édition. */
export type ProductDetailView = ProductView & {
  readonly editorial: ProductEditorialView | null;
  /** La déclaration « publiable », si quelqu'un s'est prononcé. */
  readonly readiness: ProductReadinessView | null;
  /**
   * La dernière fois que le CONTENU de la fiche a bougé — toutes tables
   * confondues (socle, déclinaisons, éditorial, visuels).
   *
   * @deprecated Mesure fausse **dans les deux sens** ; lire
   *   {@link ProductDetailView.readinessStale} à la place.
   *
   *   Elle repose sur `product.updated_at`, un `@updatedAt` posé sur la ligne
   *   qui porte `status` : mettre en vente périmait donc la signature qui
   *   justifiait la mise en vente. Et elle ignore les taux et les canaux, qui
   *   vivent dans des tables satellites : les changer ne périmait rien.
   *
   *   Servie encore UN déploiement, le temps que les fronts basculent (audit
   *   2026-09-01, tranche 3).
   */
  readonly contentUpdatedAt: string;
  /**
   * La déclaration « publiable » vaut-elle encore ?
   *
   * Elle voyage avec la déclaration et jamais sans : la signature seule ne
   * répond pas à la question qu'on lui pose. Rien ne la périme en écriture —
   * c'est un fait daté, pas une garantie perpétuelle — donc c'est la LECTURE
   * qui tranche, sur les **faits du journal** plutôt que sur des horodatages de
   * ligne : eux seuls distinguent un prix d'un statut.
   *
   * `false` quand personne n'a signé : il n'y a alors rien à périmer.
   */
  readonly readinessStale: boolean;
  /**
   * Les visuels attachés, dans l'ordre. Ils étaient acceptés à la CRÉATION et
   * jamais relus : le formulaire ouvrait un panneau vide sur un produit qui
   * avait des images, et le premier enregistrement les aurait effacées.
   */
  readonly media: readonly ProductMediaView[];
  /** D'où vient la fiche, et ce que ses déclinaisons archivées sont devenues. */
  readonly lineage: ProductLineageView;
};

/**
 * **La filiation d'un détachement** (`plan-gestes-de-declinaison.md`, G2) —
 * des deux côtés, avec les noms du moment pour que l'écran pose un lien.
 */
export interface ProductLineageView {
  /** Né de cette déclinaison de cette fiche ; `null` = né d'une création. */
  readonly origin: {
    readonly productId: string;
    readonly productSku: string;
    readonly productName: LocalizedText;
    readonly variantSku: string;
    readonly variantName: LocalizedText;
  } | null;
  /** Par id de déclinaison archivée : le produit qu'elle est devenue. */
  readonly detachedTo: Readonly<Record<string, DetachedProductView>>;
}

export interface DetachedProductView {
  readonly productId: string;
  readonly productSku: string;
  readonly productName: LocalizedText;
}

/**
 * Le panneau **Visuels**, enregistré d'un bloc.
 *
 * Un REMPLACEMENT et non un ajout : l'écran envoie la liste entière, dans son
 * ordre, et c'est elle qui fait foi. Retirer une image et réordonner les autres
 * sont le même geste ; les séparer en deux routes obligerait l'écran à
 * décomposer ce que l'utilisateur a fait en une suite d'appels dont l'échec
 * partiel laisserait un ordre incohérent.
 */
/**
 * La **dérogation de TVA** d'une fiche, par clé de contexte de vente.
 *
 * Une carte VIDE est la valeur qui rend le produit à sa famille : c'est un
 * geste, pas un oubli. Une clé absente d'une carte non vide dit la même chose
 * pour ce contexte-là — le produit hérite là, et déroge ailleurs.
 *
 * Le serveur refuse une clé inconnue du registre, et une clé dont la famille ne
 * vend pas le contexte : déroger là où rien ne se vend, c'est décider d'un prix
 * pour une vente qui n'a pas lieu.
 */
/**
 * Réserver la fiche aux opérations datées, ou la rendre à la vente courante
 * (`PUT /pim/catalogue/products/:id/operation-only`). Le booléen entier plutôt
 * que deux routes : l'écran envoie l'état de sa case, comme les autres sections.
 */
export const setProductOperationOnlyPayloadSchema = z.strictObject({
  operationOnly: z.boolean(),
});
export type SetProductOperationOnlyPayload = z.infer<typeof setProductOperationOnlyPayloadSchema>;

/**
 * **Déclarer que la fiche demande le froid** — ou le retirer
 * (`PUT /pim/catalogue/products/:id/cold-requirement`). L'état de la case,
 * comme pour la réservation aux opérations.
 */
export const setProductColdRequirementPayloadSchema = z.strictObject({
  requiresCold: z.boolean(),
});
export type SetProductColdRequirementPayload = z.infer<
  typeof setProductColdRequirementPayloadSchema
>;

/**
 * **Montrer chaque déclinaison en vignette** au rayon, ou seulement la
 * déclinaison par défaut (`PUT /pim/catalogue/products/:id/variants-as-tiles`,
 * `documentation/catalogue/plan-declinaisons-en-vignette.md`). L'état de la case.
 */
export const setProductVariantsAsTilesPayloadSchema = z.strictObject({
  variantsAsTiles: z.boolean(),
});
export type SetProductVariantsAsTilesPayload = z.infer<
  typeof setProductVariantsAsTilesPayloadSchema
>;

/**
 * **Élargir ou restreindre à qui la fiche vend** — ou la rendre à sa famille
 * avec `null` (`PUT /pim/catalogue/products/:id/audience`).
 */
export const setProductAudiencePayloadSchema = z.strictObject({
  audience: operationAudienceSchema.nullable(),
});
export type SetProductAudiencePayload = z.infer<typeof setProductAudiencePayloadSchema>;

/**
 * **La quantité minimale d'une déclinaison**, en pièces : un minimum pro,
 * un minimum public, `null` = aucun — sans contexte (`plan-quantite-minimale.md`, Q2).
 */
export const variantMinQuantitiesSchema = z.strictObject({
  pro: z.number().int().nullable(),
  public: z.number().int().nullable(),
});
export type VariantMinQuantities = z.infer<typeof variantMinQuantitiesSchema>;

/**
 * **Poser la quantité minimale d'une déclinaison** — ses minimums, ou `"follow"`
 * pour suivre le défaut (`PUT /pim/catalogue/products/:id/variants/:variantId/min-quantities`).
 * La forme seule : le minimum de 2 et l'unité de vente sont
 * jugés par le référentiel.
 */
export const setVariantMinQuantitiesPayloadSchema = z.strictObject({
  minQuantities: z.union([z.literal("follow"), variantMinQuantitiesSchema]),
});
export type SetVariantMinQuantitiesPayload = z.infer<typeof setVariantMinQuantitiesPayloadSchema>;

export const setProductVatPayloadSchema = z.object({
  vatByContext: z.record(z.string(), z.string()),
});
export type SetProductVatPayload = z.infer<typeof setProductVatPayloadSchema>;

/**
 * Ajouter une **déclinaison** à une fiche existante.
 *
 * `sku` reste ouvert pour la reprise d'une référence imposée, comme à la
 * création d'un produit ; laissé vide, il se dérive du rang (`P-XXXXXX-3`).
 *
 * `options` est libre : le référentiel ne connaît pas d'axe de déclinaison, et
 * en imposer un (taille/couleur) ferait rentrer au chausse-pied ce qui n'y
 * rentre pas — un poids, un conditionnement, un affinage.
 */
/**
 * **Rebaptiser une déclinaison** — son libellé seul.
 *
 * Ni la référence ni les options ne voyagent avec : le SKU est immuable par
 * construction (il est dicté au labo et part dans les envois), et les options
 * décrivent ce qui distingue l'article, pas comment on l'appelle. Un `PUT` qui
 * accepterait les trois ferait d'un renommage un remplacement.
 *
 * Le crayon de la barre des déclinaisons : il renomme le **libellé interne**
 * seulement (`plan-identite-de-declinaison.md`, I5). Un texte, pas un
 * `LocalizedText` : le libellé ne se traduit pas, il ne part pas en boutique.
 */
export const renameProductVariantPayloadSchema = z.object({
  label: z.string(),
});
export type RenameProductVariantPayload = z.infer<typeof renameProductVariantPayloadSchema>;

/**
 * Le **nom de boutique** d'une déclinaison et ses langues — carte « Identité
 * de la déclinaison », enregistrée seule (I1, I4 révisée au § 3).
 */
export const setVariantShopNamePayloadSchema = z.object({
  name: localizedTextSchema,
});
export type SetVariantShopNamePayload = z.infer<typeof setVariantShopNamePayloadSchema>;

export const addProductVariantPayloadSchema = z.object({
  name: localizedTextSchema,
  options: z.record(z.string(), z.string()).optional(),
  sku: z.string().trim().min(1).optional(),
});
export type AddProductVariantPayload = z.infer<typeof addProductVariantPayloadSchema>;

/**
 * « Cette déclinaison suit celle par défaut, sur cette section. »
 *
 * Une affirmation, pas un réglage d'affichage : sur le réglementaire elle décide
 * ce qui part sur l'étiquette, sur le tarif ce qui est facturé.
 */
/**
 * Ce qu'une déclinaison peut suivre du défaut.
 *
 * Trois sections, et c'est le MODÈLE qui le décide : l'identité, la
 * communication et les visuels sont portés par la fiche, donc une déclinaison
 * ne peut pas en diverger — il n'y a rien à aligner sur ce qu'on ne possède
 * pas. La fiche réglementaire, elle, en fait DEUX depuis le 2026-09-22 : ses
 * moitiés s'enregistrent séparément, et un drapeau unique aurait fait suivre le
 * défaut sur une moitié qu'on venait de saisir à la main.
 *
 * ⚠️ **Quatre valeurs pour trois sections.** `"regulatory"` désigne exactement
 * la même chose que `"allergens"` : les valeurs s'AJOUTENT, on ne renomme pas
 * (`plan-separer-allergenes-et-nutrition.md`, §6d). Plus aucun écran ne
 * l'envoie depuis le 2026-09-22, et elle reste pourtant ACCEPTÉE : le
 * back-office n'est pas déployé en même temps que l'API, et refuser pendant
 * cette fenêtre casserait l'alignement depuis la version encore en ligne. La
 * retirer est un geste à part, une fois la bascule du front en production.
 *
 * La correspondance vit à **un seul endroit**, côté domaine — `ASPECT_FLAG` de
 * `variant.ts`.
 */
export const variantAspectSchema = z.enum(["regulatory", "allergens", "pricing", "nutrition"]);
export type VariantAspect = z.infer<typeof variantAspectSchema>;

export const alignVariantPayloadSchema = z.object({
  aspect: variantAspectSchema,
  aligned: z.boolean(),
});
export type AlignVariantPayload = z.infer<typeof alignVariantPayloadSchema>;

/** La liste entière des visuels d'une fiche — {@link setMediaPayloadSchema}. */
export const setProductMediaPayloadSchema = setMediaPayloadSchema;
export type SetProductMediaPayload = z.infer<typeof setProductMediaPayloadSchema>;
