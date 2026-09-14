import { z } from "zod";

import type { CatalogCategory } from "./catalog.js";

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
 * **Un calcul à l'écran** (décidé le 2026-09-14). Rayons, piles, compteurs et
 * journée travaillée sont servis : l'écran affiche et relit. Le rayon vient d'un
 * port que le commerce implémente — la production ne lit toujours pas le
 * catalogue.
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

/** Le libellé du groupe des SKU que le catalogue ne connaît pas. */
export const SHELF_LABEL_OFF_CATALOG = "Hors catalogue";

/**
 * Le libellé du groupe quand la lecture des rayons a ÉCHOUÉ. Distinct du
 * précédent : « Hors catalogue » affirmerait que le fournil fabrique des articles
 * retirés de la vente.
 */
export const SHELF_LABEL_UNKNOWN = "Rayon inconnu";

/** La clé du groupe sans rayon — aucune catégorie ne la porte. */
export const UNSHELVED_WORKSHOP_GROUP_KEY = "?";

/**
 * **Une fiche** : un rayon, ses deux listes, et où elle en est — tout compté au
 * serveur.
 *
 * 🔴 L'écran n'additionne rien et ne filtre rien : `pending` et `done` arrivent
 * séparées, dans l'ordre de la fiche, qui ne bouge pas quand on coche.
 */
export interface WorkshopGroup {
  /** La catégorie, ou `UNSHELVED_WORKSHOP_GROUP_KEY`. Sert d'onglet et de préférence. */
  readonly key: string;
  /** `null` = SKU hors catalogue, ou rayons illisibles (`shelvesKnown: false`). */
  readonly category: CatalogCategory | null;
  readonly label: string;
  readonly lineCount: number;
  /** Les lignes en cours de production — le « N » de sa liste. */
  readonly pendingCount: number;
  readonly doneCount: number;
  /** Toutes lignes confondues, faites ou non. */
  readonly totalUnits: number;
  /** Ce qu'il reste à sortir. */
  readonly remainingUnits: number;
  /** Ce qui est sorti. */
  readonly doneUnits: number;
  /** En cours de production, dans l'ordre de la fiche. */
  readonly pending: readonly WorkshopLine[];
  /** Production faite, dans l'ordre de la fiche. */
  readonly done: readonly WorkshopLine[];
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
  /**
   * @deprecated depuis le 2026-09-14 — lire `groups`. Servi un déploiement de
   * plus : le front en ligne le lit (CLAUDE.md §0).
   */
  readonly lines: readonly WorkshopLine[];
  /** Toujours `null` sur une journée ouverte : rien d'arrêté ne peut périmer. */
  readonly drift: WorkshopDrift | null;
  /** Les fiches, une par rayon, dans l'ordre de la vitrine ; le groupe sans rayon en dernier. */
  readonly groups: readonly WorkshopGroup[];
  /**
   * `false` = la lecture des rayons a échoué : toutes les lignes sont dans le
   * groupe « Rayon inconnu ». La fiche reste juste, et l'écran le dit.
   */
  readonly shelvesKnown: boolean;
  /**
   * La journée servie, relativement à aujourd'hui **selon l'horloge du
   * serveur**. `null` = ni aujourd'hui ni demain.
   */
  readonly relativeDay: "today" | "tomorrow" | null;
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
