import { z } from "zod";

/**
 * **La fiche d'atelier** : ce que le fournil a à sortir aujourd'hui, et ce qui
 * est déjà sorti.
 *
 * C'est le compte à produire d'une journée, rendu cochable. Aucun prix, aucun
 * nom de client, aucun total en euros — et comme sur `AtelierSheet`, l'absence
 * est portée par le TYPE plutôt que par une consigne : il n'y a pas de champ à
 * laisser vide, donc rien à remplir par distraction.
 *
 * ## Ce que la fiche ne porte PAS, et pourquoi
 *
 * **La catégorie.** Le fournil groupe ses postes par rayon, mais la production
 * ne connaît un article que par son SKU — elle ne lit pas le catalogue, et ne
 * doit pas commencer. L'écran joint le catalogue lui-même, exactement comme le
 * récapitulatif le fait déjà pour ses rayons.
 *
 * **Un taux de casse.** La maquette montre « 4 moules · +2 de casse ». Aucune
 * table n'en porte, et un nombre fabriqué pour remplir un dessin devient un
 * nombre que quelqu'un finit par citer au téléphone.
 */

/** La journée d'une fiche : le jour de **service**, jamais de commande. */
export const productionWorksheetQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ"),
});
export type ProductionWorksheetQuery = z.infer<typeof productionWorksheetQuerySchema>;

/**
 * **Les initiales** de qui a fait la ligne — deux lettres au crayon, ce que les
 * fournils écrivent déjà.
 *
 * Deux à trois caractères, et pas un nom : c'est la trace qui sert quand une
 * ligne manque à 7 h, pas un registre du personnel. Vides autorisées — on coche
 * d'abord, on signe si on veut.
 */
export const workshopInitialsSchema = z
  .string()
  .trim()
  .max(3, "trois lettres au plus")
  .regex(/^[\p{L}]*$/u, "des lettres, rien d'autre");

/** Le geste de cocher. L'auteur vient du jeton, jamais de la charge. */
export const markWorkshopLineSchema = z.object({
  initials: workshopInitialsSchema,
});
export type MarkWorkshopLine = z.infer<typeof markWorkshopLineSchema>;

/**
 * Une ligne de la fiche : quoi, combien, dans quel contenant, et par qui.
 *
 * L'ordre des champs suit celui de l'écran, qui est celui du geste : on coche,
 * on lit la quantité, on lit le nom. Cette colonne de gauche ne bouge d'aucun
 * support.
 */
export interface WorkshopLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  /**
   * « 4 tourneuses » — la seule traduction utile d'une quantité au fournil. Là
   * où un bon de commande met un montant, la fiche met un matériel.
   *
   * `null` = aucun contenant réglé pour ce produit. La colonne reste vide : une
   * fiche qui inventerait « 1 plaque » ferait sortir la mauvaise quantité.
   */
  readonly containerLabel: string | null;
  readonly done: boolean;
  /** `null` quand la ligne n'est pas faite, ou faite sans signature. */
  readonly initials: string | null;
  /** ISO du moment où la ligne a été cochée. `null` si elle ne l'est pas. */
  readonly doneAt: string | null;
}

/** Une ligne dont l'écart a changé la quantité — « seigle 30 → 42 ». */
export interface WorkshopDriftLine {
  readonly sku: string;
  readonly productName: string;
  /** Ce que la fiche affiche aujourd'hui. `0` = un article entièrement neuf. */
  readonly from: number;
  /** Ce qu'elle afficherait après retirage. */
  readonly to: number;
  /**
   * 🔴 La ligne est-elle **déjà cochée** ?
   *
   * Le seul cas réellement dangereux du lot, et c'est pour lui que cette
   * structure nomme ses lignes au lieu de rendre un compteur : quelqu'un a
   * déclaré avoir sorti 30 pièces d'un article qui en demande 42, et personne
   * ne le saura au colisage.
   */
  readonly done: boolean;
}

/**
 * **Ce qui est arrivé depuis le tirage.** `null` = rien, ou rien à périmer.
 *
 * Il ne dit pas « des choses ont changé » : il donne un chiffre et une action,
 * comme tout bandeau de ce back-office.
 */
export interface WorkshopDrift {
  /** Combien de **commandes** sont arrivées depuis que le plan est arrêté. */
  readonly orders: number;
  /** Les pièces en plus, toutes lignes confondues — le `+18`. */
  readonly addedUnits: number;
  readonly lines: readonly WorkshopDriftLine[];
}

/**
 * La fiche d'une journée, telle que l'écran la reçoit.
 *
 * ## Les deux sources, et ce que `generatedAt` en dit
 *
 * Une journée **arrêtée** rend son instantané, et `generatedAt` porte l'heure de
 * cet arrêt — c'est le tirage, celui qu'on affiche en pied. Une journée
 * **ouverte** rend la demande du commerce, et `generatedAt` vaut `null` : rien
 * n'a été arrêté, donc il n'y a pas d'heure à donner. L'écran le dit ainsi
 * plutôt que d'écrire l'heure de la lecture, qui n'atteste de rien.
 *
 * C'est le même arbitrage que le prévisionnel — « le compte arrêté l'emporte, la
 * demande sinon » — et il vaut mieux qu'il reste le même : deux écrans du même
 * fournil qui trancheraient différemment afficheraient deux vérités le même
 * matin.
 */
export interface ProductionWorksheetView {
  /** `AAAA-MM-JJ`, la journée servie. */
  readonly date: string;
  /** L'heure du tirage. `null` = le plan n'est pas arrêté. */
  readonly generatedAt: string | null;
  /** L'heure du dernier retirage, si la journée en a connu un. */
  readonly retakenAt: string | null;
  readonly lines: readonly WorkshopLine[];
  /** Toujours `null` sur une journée ouverte : rien d'arrêté ne peut périmer. */
  readonly drift: WorkshopDrift | null;
}

/**
 * Ce que rend un **retirage** : combien la fiche vient d'absorber.
 *
 * `absorbed` vaut zéro quand rien n'était arrivé — une information, pas une
 * erreur, exactement comme `alreadyClosed` sur la clôture.
 */
export interface ProductionWorksheetRetake {
  readonly date: string;
  readonly absorbed: number;
  readonly retakenAt: string;
}

/**
 * **Le contenant d'un produit**, tel que le fournil le règle une fois.
 *
 * ⚠️ Ce n'est **pas** un `ProductPackaging` du PIM. Celui-là est une unité de
 * VENTE en volume — ce que le client achète d'un coup. Celui-ci est le matériel
 * du four : combien de pièces tiennent sur une tourneuse, dans un moule, sur une
 * plaque. Les confondre mettrait un conditionnement client sur une feuille
 * d'atelier, et ferait sortir la mauvaise quantité.
 *
 * D'où son emplacement : le bloc `production`, qui ne connaît le SKU que comme
 * un identifiant opaque — et n'a donc rien à joindre pour le régler.
 */
export const productionContainerSchema = z.object({
  /** Combien de pièces tiennent dans UN contenant. Zéro n'a pas de sens. */
  unitsPerContainer: z.number().int().positive("au moins une pièce par contenant"),
  /** « tourneuse », « plaque », « moule » — au singulier. */
  singular: z.string().trim().min(1).max(40),
  /**
   * Le pluriel, écrit et non dérivé. Le français ne se pluralise pas par un
   * « s » ajouté à la fin d'une règle : « plaque entière » n'en prend pas un
   * mais deux, et personne n'a envie de lire un pluraliseur dans ce dépôt.
   */
  plural: z.string().trim().min(1).max(40),
});
export type ProductionContainerRule = z.infer<typeof productionContainerSchema>;

/** Un contenant réglé, avec le SKU qu'il vise. */
export interface ProductionContainerView {
  readonly sku: string;
  readonly unitsPerContainer: number;
  readonly singular: string;
  readonly plural: string;
}
