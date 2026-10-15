import type { SalesTermsDocument } from "./platform-content.defaults.js";
import type { LegalDocumentView } from "./legal-document.js";

/**
 * **Un PDF de référence des CGV**, tel que l'écran du back-office le liste
 * (plan `documentation/legal/plan-cgv-par-audience.md`, C3).
 *
 * Le PDF est le document juridique ; les paragraphes en sont la lecture en
 * ligne. Chaque dépôt est une ligne neuve et un objet neuf : le dépôt suivant
 * pose `supersededAt` sur celui-ci, rien ne l'efface. C'est ce qui permet de
 * retrouver le PDF qu'un client a accepté (C4).
 *
 * Types seuls, sans zod : la boutique et le back-office les lisent.
 */
export interface LegalDocumentFileView {
  readonly id: string;
  readonly document: SalesTermsDocument;
  readonly sizeBytes: number;
  /** L'empreinte SHA-256 des octets, en hexadécimal — ce qui prouve l'identité du fichier. */
  readonly sha256: string;
  readonly uploadedAt: string;
  /**
   * « Prénom Nom » de qui l'a déposé, lu dans l'annuaire, ou `null` si la
   * fiche ne nomme plus personne. Jamais un nom inventé.
   */
  readonly uploadedByName: string | null;
  /** `null` = le PDF en vigueur. */
  readonly supersededAt: string | null;
}

/**
 * L'historique des dépôts d'un texte de CGV, le plus récent d'abord. Le
 * premier, s'il n'est pas remplacé, est celui en vigueur.
 */
export interface LegalDocumentFileHistoryView {
  readonly document: SalesTermsDocument;
  readonly files: readonly LegalDocumentFileView[];
}

/** Ce que rend un dépôt : l'identifiant du fichier frappé par le serveur. */
export interface LegalDocumentFileDeposited {
  readonly id: string;
}

/**
 * **Les CGV qu'une commande porte**, telles que le détail de commande du
 * back-office les lit (C4, C4′).
 *
 * `revision` et `file` sont `null` quand le texte n'existait pas à la
 * passation (CGV pro pas encore rédigées, aucun PDF déposé) : le fait est
 * enregistré tel quel, on n'en invente pas.
 *
 * `placedByStaff` : la commande a été saisie par l'équipe — l'écran dit alors
 * « CGV applicables », pas « acceptées » (C4′).
 */
export interface OrderSalesTermsView {
  readonly document: SalesTermsDocument;
  readonly revision: number | null;
  readonly file: { readonly id: string; readonly uploadedAt: string } | null;
  readonly placedByStaff: boolean;
}

/**
 * La réponse du détail de commande : `salesTerms` est `null` pour une commande
 * passée avant que la version soit enregistrée — on n'en invente pas (C4).
 */
export interface OrderSalesTermsResponse {
  readonly salesTerms: OrderSalesTermsView | null;
}

/**
 * **Le PDF en vigueur d'un texte**, tel que la lecture publique d'une mention
 * l'annonce (décision de Hugo, 2026-10-15 : « l'API doit le dire »). La
 * boutique n'a plus à le deviner par une sonde `HEAD`, qui coûtait une lecture
 * R2 et comptait dans le throttle.
 */
export interface LegalDocumentPdfView {
  readonly fileId: string;
  /** Le nom daté sous lequel le téléchargement le servira. */
  readonly fileName: string;
  /** ISO 8601. */
  readonly uploadedAt: string;
  readonly sizeBytes: number;
}

/**
 * Le document d'une mention tel que la route PUBLIQUE le rend : le texte, et
 * son PDF en vigueur — `null` s'il n'y en a pas, ou si la mention n'en porte
 * jamais (seules les CGV en ont).
 *
 * Une vue DISTINCTE de {@link LegalDocumentView}, et délibérément : l'écran
 * d'édition lit l'historique des PDF par sa propre route, et n'a que faire
 * de ce champ.
 */
export interface PublishedLegalDocumentView extends LegalDocumentView {
  readonly pdf: LegalDocumentPdfView | null;
}
