import type { LayoutLogo } from "./layout-header.js";
import type { LayoutSectionId } from "./layout-sections.js";
import type { MailRenderCharter } from "./render-charter.js";

/**
 * L'entrée de la coquille, sortie de `html.ts` le 2026-11-07 (S4b) : la
 * coquille et le rendu d'un document la lisent tous les deux.
 */

/** L'appel à l'action d'un e-mail : un libellé, un lien. */
export interface MailCta {
  readonly label: string;
  readonly url: string;
}

/**
 * Une ligne de récapitulatif : un libellé à gauche, une valeur à droite.
 *
 * Structurée plutôt que passée en HTML : c'est la coquille qui échappe, et
 * l'appelant n'a donc **aucune** façon d'injecter une balise, pas même par
 * inadvertance. Un `body` en HTML brut aurait été plus souple et aurait rouvert
 * exactement le trou que `htmlEscape` existe pour fermer.
 */
export interface LayoutRow {
  readonly label: string;
  readonly value: string;
  /** La ligne de total : filet au-dessus, valeur en gras. Une seule par bloc. */
  readonly strong?: boolean;
}

/**
 * Une **image en ligne**, référencée par son `cid:` — la pièce jointe que le
 * message transporte.
 *
 * Ni `data:` URI (Gmail les supprime) ni URL distante (bloquée par défaut, et
 * récupérée par le proxy de Google, qui verrait passer ce que l'URL contient).
 *
 * `alt` n'est pas une politesse : c'est ce qui reste quand un client bloque les
 * images, et il doit donc dire ce que l'image dit — pas « QR code ».
 */
export interface LayoutImage {
  readonly contentId: string;
  readonly alt: string;
  /** Côté en pixels. Les clients mail ignorent le CSS de dimension, pas l'attribut. */
  readonly sizePx: number;
  /** La ligne sous l'image — souvent le repli lisible quand elle ne s'affiche pas. */
  readonly caption?: string;
}

/**
 * **Le pied de désinscription d'un e-mail marketing** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, contradiction B2) :
 * INJECTÉ par l'envoi, hors du document — un document publié ne peut ni le
 * porter, ni le perdre. La phrase vient de l'app (sa phrase système, déjà
 * dans la langue de l'envoi), coupée autour du lien : le HTML pose
 * `label` en lien, le texte pose l'adresse en clair.
 */
export interface LayoutUnsubscribe {
  /** La phrase avant le lien. */
  readonly before: string;
  /** Le libellé du lien, dans le HTML. */
  readonly label: string;
  /** L'adresse de désinscription — celle de l'en-tête `List-Unsubscribe`. */
  readonly url: string;
  /** La phrase après le lien (souvent vide). */
  readonly after: string;
}

export interface LayoutInput {
  readonly title: string;
  /** Le corps, en texte brut. Les retours à la ligne sont préservés. */
  readonly body: string;
  readonly cta?: MailCta;
  /**
   * Un second chemin, en lien discret sous le bouton — « ou choisissez un mot
   * de passe » (2026-10-09, l'invitation qui passe au code e-mail). Rendu
   * seulement s'il y a un bouton : seul, il deviendrait l'action principale
   * sans en avoir la forme.
   */
  readonly secondaryLink?: MailCta;
  /** La ligne de pied — mentions, désinscription. Texte brut. */
  readonly footer?: string;
  /**
   * L'adresse de recours, affichée en bas : « un problème ? écrivez ici ».
   *
   * Elle n'a de valeur que si elle ne peut pas devenir fausse — d'où l'usage de
   * l'**admin racine**, la seule adresse que le domaine protège de toute
   * suppression, rétrogradation ou renommage. Une adresse de support qui
   * disparaît est pire que pas d'adresse : elle envoie quelqu'un attendre.
   */
  readonly supportEmail?: string;
  /**
   * Le bandeau de marque. Absent, l'e-mail garde la coquille sans en-tête —
   * utile pour les messages purement techniques, qui n'ont personne à rassurer.
   */
  readonly brand?: string;
  /**
   * Le sous-titre du bandeau, sous l'enseigne (« Commande confirmée ») — en
   * capitales par le style, pour que le dictionnaire garde une casse normale.
   */
  readonly kicker?: string;
  /**
   * L'URL PUBLIQUE et stable du woff2 de la face de l'enseigne (Chunk). Posée
   * ⇒ un `@font-face` dans le `<head>`. Gmail ignore `<style>` et les
   * polices web : il affiche le repli système gras, écrit aussi en ligne.
   */
  readonly brandFontUrl?: string;
  /** Le logo, à gauche DANS le bandeau, sur un pavé blanc. Absent ⇒ pas de logo. */
  readonly logo?: LayoutLogo;
  /** Le récapitulatif, sous le corps. Vide ou absent ⇒ aucun bloc rendu. */
  readonly rows?: readonly LayoutRow[];
  /** L'image en ligne, sous le récapitulatif. */
  readonly image?: LayoutImage;
  /**
   * L'itinéraire vers le point de retrait (plan `plan-textes-des-e-mails.md`,
   * S7) : un bouton secondaire, encadré plutôt que plein, pour ne pas
   * disputer sa place à l'action principale.
   */
  readonly itinerary?: MailCta;
  /**
   * L'ordre des sections du corps (S2). Absent : l'ordre par défaut, celui
   * d'avant les sections, à l'octet près. Une section qu'il ne nomme pas
   * suit, dans l'ordre par défaut (`effectiveSectionOrder`).
   */
  readonly sections?: readonly LayoutSectionId[];
  /**
   * Un `<div data-mail-section="…">` neutre autour de chaque section rendue —
   * pour l'aperçu de l'écran (S4), JAMAIS pour un e-mail envoyé.
   */
  readonly markSections?: boolean;
  /**
   * La charte de l'espace, quand une charte est publiée (plan
   * `plan-editeur-par-blocs.md`, § 25, C1). Absente : la charte de départ,
   * c'est-à-dire le rendu d'avant, à l'octet.
   */
  readonly charter?: MailRenderCharter;
  /**
   * Le pied de désinscription (plan de désinscription, B2) : rendu APRÈS tout
   * le corps, à côté du pied de la charte, en HTML et en texte. Absent pour
   * tout e-mail transactionnel — le rendu d'avant, à l'octet.
   */
  readonly unsubscribe?: LayoutUnsubscribe;
}
