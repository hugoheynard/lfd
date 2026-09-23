import { z } from "zod";

import { optionalLocalizedTextSchema } from "./localized.js";
import type { LocalizedText } from "./shared.js";

/**
 * Les visuels, **indépendamment de ce qui les porte**.
 *
 * Ces formes vivaient dans `product.ts`, du temps où une fiche était le seul
 * porteur possible. Une FAMILLE en porte aussi désormais, et faire dépendre le
 * contrat des familles de celui des produits aurait posé une hiérarchie qui
 * n'existe pas : ni l'un ni l'autre ne possède la bibliothèque.
 */

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

/**
 * Le point à garder au centre quand le cadre n'a pas la forme de l'image.
 * Fractions de 0 à 1, depuis le coin haut-gauche.
 *
 * 🔴 **DÉCIDÉ, pas mesuré** — d'où sa place HORS de {@link MediaFactsView},
 * dont le contrat dit que `null` veut dire « pas mesuré ». Ici, `null` veut
 * dire « personne ne s'est prononcé », et le cadrage retombe au centre. Le
 * centre choisi et le centre par défaut sont deux états distincts : les
 * confondre obligerait à deviner lequel on lit.
 */
export interface FocalPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * **Qui affiche une image** — une ligne de la liste des porteurs.
 *
 * 🔴 Elle existe parce que `uses` est un NOMBRE, et qu'un nombre empêche sans
 * débloquer : le refus de suppression disait « 3 fiches l'affichent » sans
 * permettre d'en trouver une seule. Le garde-fou devenait un mur.
 *
 * ⚠️ `label` n'est jamais vide — un porteur sans nom se désigne par son
 * identifiant. Une ligne sans mot ne se clique pas.
 */
export interface MediaCarrierView {
  /** Elle décide de l'écran vers lequel le lien renvoie. */
  readonly kind: "product" | "category";
  readonly id: string;
  readonly label: string;
}

/**
 * Une image de la **bibliothèque**, telle que la médiathèque la montre.
 *
 * 🔴 Pas d'identifiant, et ce n'est pas un oubli : l'identité d'une image est
 * son URL, qui est le SHA-256 de son contenu.
 *
 * ⚠️ Cette phrase disait « la table des actifs est en réalité un journal de
 * lignes — chaque enregistrement d'une section Visuels en recrée une par
 * image ». C'était vrai, et ça ne l'est plus depuis le 2026-09-23 : un index
 * unique sur l'URL fait qu'une image y occupe UNE ligne, et les fiches n'y
 * écrivent plus du tout. La conclusion, elle, n'a pas bougé — seule l'adresse
 * traverse deux sauvegardes, et c'est pourquoi elle sert d'identité.
 */
export interface LibraryMediaView extends MediaFactsView {
  readonly url: string;
  /** L'étiquette de bibliothèque ; `''` = personne ne l'a nommée. */
  readonly name: string;
  /**
   * Les mots par lesquels on la retrouve — libres, à plat, normalisés
   * (découpés, minuscules, dédoublonnés) à l'écriture. `[]` = pas taguée.
   */
  readonly tags: readonly string[];
  /** Le texte alternatif, dans les langues où il est écrit. */
  readonly alt: LocalizedText;
  readonly focal: FocalPoint | null;
  /**
   * Combien de porteurs l'affichent — fiches et familles confondues.
   *
   * Sert à DIRE avant de refuser : on ne supprime pas une image qu'un porteur
   * affiche. Sans ce compte, l'écran proposerait une suppression que le
   * serveur rejetterait, et la règle s'apprendrait par un échec.
   *
   * 🔴 Cette phrase disait « les clés étrangères le tiennent en base ». Elles
   * ne le tiennent plus depuis le 2026-09-23 : la bibliothèque a son propre
   * schéma, les porteurs la référencent par URL sans clé étrangère, et la
   * règle vit dans le code — `DiscardMediaHandler` compte et refuse (409), le
   * ramassage s'abstient si un porteur se tait. Croire que Postgres garde
   * encore ce mur ferait retirer le garde-fou applicatif.
   */
  readonly uses: number;
  /** L'entrée dans la bibliothèque — le PREMIER dépôt de ces octets. */
  readonly depositedAt: string;
}

/** Une page de la bibliothèque, et le total pour la pagination. */
export interface MediaLibraryPageView {
  readonly items: readonly LibraryMediaView[];
  readonly total: number;
}

/** Un visuel attaché, tel qu'un écran le lit et le renvoie. */
export interface AttachedMediaView extends MediaFactsView {
  /** `hero`, `gallery`, `lifestyle`, `thumbnail`, `print`. */
  readonly role: string;
  readonly url: string;
  /**
   * L'étiquette de la bibliothèque — courte, non traduite, faite pour
   * RETROUVER. Distincte du texte alternatif, qui DÉCRIT l'image à qui ne la
   * voit pas : deux informations, deux publics. `''` = pas nommé.
   */
  readonly name: string;
  /** Le SEUL champ d'image qui se traduit — accessibilité ET référencement. */
  readonly alt: LocalizedText;
}

/**
 * Ce que rend un dépôt d'image : l'entrée de bibliothèque créée.
 *
 * Les dimensions viennent d'ici et **ne repartent pas** dans l'enregistrement :
 * le serveur les a mesurées, il les relira lui-même au rattachement plutôt que
 * de les redemander à un navigateur qui pourrait en dire autre chose.
 */
export interface UploadedMediaView extends MediaFactsView {
  readonly id: string;
  readonly url: string;
}

/**
 * Un visuel tel qu'un écran l'ENVOIE : **le rôle et l'adresse**.
 *
 * 🔴 Plus d'étiquette ni d'alternative depuis le 2026-09-23 — elles décrivent
 * l'image, qui est partagée, et se saisissent dans la médiathèque. Les
 * envoyer d'ici faisait écrire la bibliothèque à chaque enregistrement de
 * fiche, et corriger l'une changeait silencieusement ce que l'autre affichait.
 */
export const mediaItemPayloadSchema = z.object({
  role: z.string().min(1),
  url: z.string().min(1),
});

/**
 * La liste ENTIÈRE des visuels, dans son ordre. Un remplacement et non un
 * ajout : l'écran envoie ce qu'il affiche, et l'ordre affiché EST l'ordre.
 */
export const setMediaPayloadSchema = z.object({
  media: z.array(mediaItemPayloadSchema),
});
export type SetMediaPayload = z.infer<typeof setMediaPayloadSchema>;

/**
 * Ce qu'un écran DÉCIDE d'une image — par opposition à ce qu'on en a mesuré.
 *
 * Clé = l'**URL**, parce qu'elle EST l'identité d'une image : le SHA-256 de
 * son contenu, une ligne par image depuis le 2026-09-23 (la phrase disait
 * « la table des actifs est un journal de lignes » — c'est fini).
 */
export const mediaDetailsPayloadSchema = z.object({
  url: z.string().min(1),
  /** `''` efface l'étiquette — c'est un geste, pas une absence de champ. */
  name: z.string().max(120),
  /** Le SEUL champ d'image qui se traduit — accessibilité ET référencement. */
  alt: optionalLocalizedTextSchema,
  tags: z.array(z.string()).max(60),
  /**
   * `null` veut dire « personne ne s'est prononcé », jamais « au centre ».
   * Les bornes réelles (0 à 1) sont tenues par le domaine ; le schéma ne dit
   * que la forme.
   */
  focal: z.object({ x: z.number(), y: z.number() }).nullable(),
});

export type MediaDetailsPayload = z.infer<typeof mediaDetailsPayloadSchema>;
