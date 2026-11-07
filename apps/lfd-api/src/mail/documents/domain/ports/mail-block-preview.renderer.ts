import type {
  MailBlockPreviewFragment,
  MailDocument,
  MailLocale,
  MailPreviewSituation,
} from "@lfd/mail-blocks";

import type { MailTextsByMail } from "../../../copy/domain/mail-copy-texts.js";

/** Le document rendu en morceaux marqués (S5f) : objet, cadres, un fragment par bloc. */
export interface MailBlockPreviewRendering {
  readonly subject: string;
  readonly header: string;
  readonly footer: string;
  readonly blocks: readonly MailBlockPreviewFragment[];
}

/**
 * Port de **l'aperçu de l'éditeur par blocs** (plan `plan-editeur-par-blocs.md`,
 * § 22, S5f) : le VRAI gabarit, sur les données d'un cas, avec ces phrases et
 * ce document — découpé en blocs, phrases et variables marquées. Distinct de
 * l'aperçu fidèle (ISP) : celui-là rend ce qui partirait, sans repère ; ce
 * port ne sert que le canevas. N'écrit rien, n'envoie rien.
 */
export abstract class MailBlockPreviewRenderer {
  /**
   * @param variants les phrases que l'éditeur écrit et leur variante, telle
   *   que `GET …/phrases` la sert — elle devient `data-variant` ; un chemin
   *   absent n'est pas marqué (§ 23, `editablePhrases`).
   * @param situation le cas passé en retrait ou en livraison (§ 24) ; `null` :
   *   le cas tel quel. Un bloc absent dans cette situation a un fragment vide.
   * Les fragments portent la charte publiée de l'espace de l'e-mail,
   * comme l'envoi (§ 25, C1) ; sans charte publiée, la charte de départ.
   * @throws {UnknownMailTemplateError} l'e-mail n'est pas au registre.
   * @throws {UnknownMailCaseError} l'e-mail n'a pas ce cas.
   * @throws {MailTemplateWithoutLayoutError} le gabarit n'a pas posé la coquille.
   */
  abstract render(
    template: string,
    caseId: string,
    locale: MailLocale,
    texts: MailTextsByMail,
    document: MailDocument,
    variants: ReadonlyMap<string, string | null>,
    situation: MailPreviewSituation | null,
  ): Promise<MailBlockPreviewRendering>;
}
