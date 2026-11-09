import type { ImageFocal, ImageFormat } from "./image-framing.js";
import type { ImageWidth } from "./image-width.js";
import type { ColumnWidthStep } from "./column-widths.js";
import type { MailCharter } from "./mail-charter.js";
import type { Localized, MailLocale } from "./mail-locales.js";
import type { ModelSectionId } from "./model-sections.js";

/**
 * **Le document d'un e-mail** (plan `plan-editeur-par-blocs.md`, § 2) : la
 * suite de ses blocs, dans l'ordre de l'e-mail. Il ne stocke que
 * l'ARRANGEMENT et les blocs libres — jamais une phrase du modèle, qui n'a
 * qu'une source, le dictionnaire (§ 3).
 */
export interface MailDocument {
  /** La clé du modèle au registre (`customer.order-placed`…). */
  readonly template: string;
  readonly blocks: readonly MailBlock[];
}

/** Un bloc du modèle : le code le compose, l'équipe le place. */
export interface ModelBlock {
  readonly id: string;
  readonly kind: "model";
  readonly section: ModelSectionId;
}

/**
 * Un bloc libre de texte. Un texte FIXE par langue — ni variable, ni variante
 * (§ 2, question 7) : ce qui dépend des données reste dans les blocs du modèle.
 * Texte brut : la forme d'un texte enrichi n'est pas encore fixée (S5b).
 */
export interface TextBlock {
  readonly id: string;
  readonly kind: "heading" | "paragraph";
  readonly text: Localized<string>;
}

/** Les tons d'un encadré. */
export const CALLOUT_TONES = ["info", "warning"] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

/** Un encadré (« Fermé le 1ᵉʳ mai »). */
export interface CalloutBlock {
  readonly id: string;
  readonly kind: "callout";
  readonly tone: CalloutTone;
  readonly text: Localized<string>;
}

/** Un bouton vers une adresse fixe, en `https://`. */
export interface ButtonBlock {
  readonly id: string;
  readonly kind: "button";
  readonly label: Localized<string>;
  readonly href: string;
}

/** Un séparateur. */
export interface DividerBlock {
  readonly id: string;
  readonly kind: "divider";
}

/**
 * Une image (plan `plan-editeur-par-blocs.md`, § 19, S5d) : son adresse, un
 * texte de remplacement par langue, et un lien facultatif en `https://`.
 *
 * L'écran passe l'adresse d'une image de la médiathèque ; à la publication,
 * le bloc `mail` en range sa copie et la version publiée pointe vers elle.
 * Une adresse vide est admise dans un brouillon (l'image n'est pas encore
 * choisie), jamais à la publication.
 *
 * `decorative` déclare une image sans information (RGAA 1.2) : elle se rend
 * avec un `alt` vide, voulu, et ne porte pas de lien — un lien sans nom
 * accessible ne se lit pas.
 *
 * `format` et `focal` (« Format et point focal », § 19) : la publication
 * recadre la copie au format autour du point focal ; absent ou `original`,
 * l'image est copiée telle quelle.
 */
export interface ImageBlock {
  readonly id: string;
  readonly kind: "image";
  readonly src: string;
  readonly alt: Localized<string>;
  readonly href?: string;
  readonly decorative?: boolean;
  readonly format?: ImageFormat;
  readonly focal?: ImageFocal;
  /**
   * `full` : l'image va d'un bord de la carte à l'autre, comme le bandeau
   * (Hugo, 2026-11-08), en gardant son format ; absent ou `content`, elle
   * reste entre les marges du corps. Jamais `full` dans une colonne.
   */
  readonly width?: ImageWidth;
  /**
   * L'adresse de la copie que la publication a rangée (recadrée s'il y a un
   * format), posée seulement dans une version publiée. `src` reste TOUJOURS
   * la source : changer le cadrage puis republier recopie depuis elle.
   * L'envoi lit `copySrc ?? src` — une version publiée avant ce champ
   * portait la copie dans `src`, et s'envoie comme avant.
   */
  readonly copySrc?: string;
}

/** Ce qu'une colonne peut porter : un bloc libre, jamais des colonnes. */
export type FreeBlock = TextBlock | CalloutBlock | ButtonBlock | DividerBlock | ImageBlock;

/**
 * Une mise en page à 2 ou 3 colonnes : une largeur et une cellule par
 * colonne. Jamais de bloc du modèle dedans, jamais de colonnes dans une
 * colonne.
 */
export interface ColumnsBlock {
  readonly id: string;
  readonly kind: "columns";
  readonly widths: readonly ColumnWidthStep[];
  readonly cells: readonly (readonly FreeBlock[])[];
}

/** Un bloc d'un e-mail. */
export type MailBlock = ModelBlock | FreeBlock | ColumnsBlock;

/** Les sortes de blocs libres admises hors colonnes. */
export const FREE_BLOCK_KINDS = [
  "heading",
  "paragraph",
  "callout",
  "button",
  "divider",
  "image",
  "columns",
] as const;

/**
 * Les seuls blocs admis dans une ligne de trois colonnes : les courts. Une
 * image n'en est pas (S5d) : sur 560 px, un tiers de colonne la réduit à
 * une vignette illisible.
 */
export const SHORT_BLOCK_KINDS = ["heading", "button"] as const;

/** Le nombre de colonnes d'une mise en page. */
export const COLUMN_COUNTS = [2, 3] as const;

/**
 * **La déclaration d'un modèle** : ce que le code en sait, et que l'écran ne
 * règle pas — ses blocs du modèle dans l'ordre de la coquille, les langues
 * dans lesquelles il part, sa charte.
 */
/**
 * **La nature d'un e-mail** (doc `la-desinscription-et-l-accord.md`,
 * règle 1) : un e-mail de service (`transactional`) part sans consentement ;
 * un e-mail `marketing` porte d'office la désinscription. Sans valeur par
 * défaut : chaque modèle la déclare.
 */
export const MAIL_NATURES = ["transactional", "marketing"] as const;
export type MailNature = (typeof MAIL_NATURES)[number];

export interface MailTemplateDeclaration {
  readonly modelBlocks: readonly ModelSectionId[];
  readonly locales: readonly MailLocale[];
  readonly charter: MailCharter;
  /** Sa nature, déclarée par le modèle : jamais déduite. */
  readonly nature: MailNature;
  /**
   * Les seules phrases (chemins du dictionnaire) que l'éditeur laisse
   * réécrire — l'accroche d'un e-mail qui suit la règle du § 23 du plan
   * `plan-editeur-par-blocs.md` ; les libellés de ses blocs système n'y sont
   * pas. Absente : toutes ses phrases s'écrivent, comme avant.
   */
  readonly editablePhrases?: readonly string[] | undefined;
  /**
   * Où mène le bouton du modèle, dit au staff du point de vue du
   * destinataire (§ 23) : le lien se calcule à l'envoi et ne s'écrit pas
   * dans l'éditeur. Absente : le modèle n'a pas de bouton.
   */
  readonly ctaDestination?: string | undefined;
}

/** Cette phrase s'écrit-elle dans l'éditeur ? Sans liste déclarée, oui. */
export function isEditablePhrase(declaration: MailTemplateDeclaration, path: string): boolean {
  return declaration.editablePhrases === undefined || declaration.editablePhrases.includes(path);
}
