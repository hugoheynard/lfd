import { z } from "zod";

import { salesChannelsSchema } from "./category.js";

import { localizedTextSchema, optionalLocalizedTextSchema } from "./localized.js";
import { mediaItemPayloadSchema, setMediaPayloadSchema, type AttachedMediaView } from "./media.js";
import type { LocalizedText, SalesChannels } from "./shared.js";

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
const nutritionInputShape = z
  .object({
    energyKcal: z.number().optional(),
    fatG: z.number().optional(),
    saturatedFatG: z.number().optional(),
    carbsG: z.number().optional(),
    sugarsG: z.number().optional(),
    proteinG: z.number().optional(),
    saltG: z.number().optional(),
    /** Hors annexe XV : un renseignement produit, pas une mention obligatoire. */
    glycemicIndex: z.number().optional(),
  })
  .optional();

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

/** Tarif & logistique d'une déclinaison. `null` = effacer. */
export const updateVariantPricingPayloadSchema = z.object({
  /**
   * Le prix **public TTC**, en centimes. C'est la seule assiette : le hors taxe
   * se calcule, il ne se saisit pas.
   */
  priceCents: z.number().int().min(0).nullable(),
  weightGrams: z.number().int().min(0).nullable(),
});
export type UpdateVariantPricingPayload = z.infer<typeof updateVariantPricingPayloadSchema>;

export const productEditorialPayloadSchema = z.object(editorialShape);
export type ProductEditorialPayload = z.infer<typeof productEditorialPayloadSchema>;

export const declareNutritionPayloadSchema = z.object({
  allergens: z.array(z.string()),
  mayContain: z.array(z.string()).optional(),
  nutrition: nutritionInputShape,
});
export type DeclareNutritionPayload = z.infer<typeof declareNutritionPayloadSchema>;

// ── Vues (formes rendues) ──────────────────────────────────────────────────

/** Fiche nutritionnelle rendue ; chaque champ `null` = non renseigné. */
export interface VariantNutritionView {
  readonly mayContain: readonly string[];
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
  readonly name: LocalizedText;
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
   * Cette déclinaison **suit la fiche réglementaire de celle par défaut**.
   *
   * Toujours `false` sur le défaut, qui ne peut pas se suivre lui-même. L'écran
   * en fait une case « aligner sur le défaut » : cochée, la carte réglementaire
   * se lit sans se saisir.
   */
  readonly regulatoryFollowsDefault: boolean;
  /**
   * Cette déclinaison **suit le tarif de celle par défaut** — prix ET poids.
   *
   * ⚠️ `priceCents` et `weightGrams` sont **résolus** comme les allergènes : ils
   * rendent ici ceux du défaut. C'est ce drapeau, et lui seul, qui dit d'où ils
   * viennent.
   */
  readonly pricingFollowsDefault: boolean;
  /**
   * `null` = fiche non renseignée ; `[]` = « aucun allergène » déclaré.
   *
   * ⚠️ **Résolue.** Une déclinaison alignée rend ici les allergènes du défaut,
   * pas `null` : c'est ce qu'elle porte réellement sur l'étiquette et ce qui
   * part aux canaux. Pour savoir si elle les possède ou les suit, lire
   * {@link VariantView.regulatoryFollowsDefault} — c'est la seule question à
   * laquelle ce champ ne répond pas.
   */
  readonly allergens: readonly string[] | null;
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
   * Où la fiche se vend quand elle ne suit pas sa famille. `null` = elle hérite.
   *
   * La vue rend la DÉROGATION, pas les canaux effectifs : l'écran a déjà la
   * matrice de la famille, et rendre les deux fusionnés lui retirerait le moyen
   * de dire « ceci vient d'ici » — donc de proposer d'y renoncer.
   */
  readonly channelOverride: SalesChannels | null;
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
  readonly readyBy: string;
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
};

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
 * Où une fiche se vend, quand elle ne suit PAS sa famille.
 *
 * `null` la rend à sa famille — c'est une valeur, pas une omission, et c'est ce
 * qui rend le geste réversible. Sinon la matrice entière : tout-ou-rien, parce
 * qu'une matrice à moitié redéfinie ne se lit pas.
 */
export const setProductChannelsPayloadSchema = z.object({
  channels: salesChannelsSchema.nullable(),
});
export type SetProductChannelsPayload = z.infer<typeof setProductChannelsPayloadSchema>;

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
 * Deux valeurs, et c'est le MODÈLE qui le décide : l'identité, la communication
 * et les visuels sont portés par la fiche, donc une déclinaison ne peut pas en
 * diverger — il n'y a rien à aligner sur ce qu'on ne possède pas.
 */
export const variantAspectSchema = z.enum(["regulatory", "pricing"]);
export type VariantAspect = z.infer<typeof variantAspectSchema>;

export const alignVariantPayloadSchema = z.object({
  aspect: variantAspectSchema,
  aligned: z.boolean(),
});
export type AlignVariantPayload = z.infer<typeof alignVariantPayloadSchema>;

/** La liste entière des visuels d'une fiche — {@link setMediaPayloadSchema}. */
export const setProductMediaPayloadSchema = setMediaPayloadSchema;
export type SetProductMediaPayload = z.infer<typeof setProductMediaPayloadSchema>;
