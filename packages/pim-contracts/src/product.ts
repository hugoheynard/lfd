import { z } from "zod";

import { salesChannelsSchema } from "./category.js";

import { localizedTextSchema, optionalLocalizedTextSchema } from "./localized.js";
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

/** Valeurs nutritionnelles pour 100 g en **entrée** — chaque champ optionnel. */
const nutritionInputShape = z
  .object({
    energyKcal: z.number().optional(),
    carbsG: z.number().optional(),
    fatG: z.number().optional(),
    proteinG: z.number().optional(),
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
  media: z
    .array(
      z.object({
        role: z.string(),
        url: z.string(),
        name: z.string().optional(),
        alt: optionalLocalizedTextSchema,
      }),
    )
    .optional(),
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
  readonly carbsG: number | null;
  readonly fatG: number | null;
  readonly proteinG: number | null;
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
  /** Prix canonique HT en centimes ; `null` = pas encore tarifé. */
  readonly priceCents: number | null;
  readonly weightGrams: number | null;
  /** `null` = fiche non renseignée ; `[]` = « aucun allergène » déclaré. */
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
 * Ce qu'on a constaté d'un visuel qu'on héberge. Tout est nullable : un visuel
 * saisi par son URL n'a rien de tout ça, et `null` veut dire « pas mesuré »,
 * jamais « zéro » — un écran ne doit pas le coercer en dimension.
 */
export interface MediaFactsView {
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
  readonly contentType: string | null;
}

/** Un visuel attaché à un produit, tel que l'écran le lit et le renvoie. */
export interface ProductMediaView extends MediaFactsView {
  /** `hero`, `gallery`, `lifestyle`, `thumbnail`, `print`. */
  readonly role: string;
  readonly url: string;
  /** L'étiquette de la bibliothèque — courte, non traduite, faite pour
   *  RETROUVER. Distincte du texte alternatif, qui DÉCRIT l'image à qui ne la
   *  voit pas : deux informations, deux publics. `''` = pas nommé.
   *
   *  Elle vit sur la VUE du visuel attaché et pas sur les faits techniques :
   *  un dépôt ne rend pas de nom, puisque personne ne l'a encore donné. */
  readonly name: string;
  readonly alt: LocalizedText;
}

/**
 * Ce que rend un dépôt d'image : l'entrée de bibliothèque créée.
 *
 * L'écran n'a plus qu'à l'ajouter à sa liste et à enregistrer la section. Les
 * dimensions viennent d'ici et **ne repartent pas** dans l'enregistrement : le
 * serveur les a mesurées, il les relira lui-même au rattachement plutôt que de
 * les redemander à un navigateur qui pourrait en dire autre chose.
 */
export interface UploadedMediaView extends MediaFactsView {
  readonly id: string;
  readonly url: string;
}

/** Détail enrichi (socle + éditorial + visuels) — pour la page d'édition. */
export type ProductDetailView = ProductView & {
  readonly editorial: ProductEditorialView | null;
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

export const setProductMediaPayloadSchema = z.object({
  media: z.array(
    z.object({
      role: z.string().min(1),
      url: z.string().min(1),
      name: z.string().optional(),
      alt: optionalLocalizedTextSchema,
    }),
  ),
});
export type SetProductMediaPayload = z.infer<typeof setProductMediaPayloadSchema>;
