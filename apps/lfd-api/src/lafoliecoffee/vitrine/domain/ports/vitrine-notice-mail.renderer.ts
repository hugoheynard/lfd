import type { VitrineNoticeText } from "../vitrine-notice-text.js";

/** Un e-mail rendu : l'objet tel que la boîte l'affichera, et le corps HTML. */
export interface RenderedVitrineNotice {
  readonly subject: string;
  readonly html: string;
}

/**
 * Port du rendu de l'annonce, pour l'APERÇU : le même gabarit que l'envoi
 * (`agency.vitrine-notice`), pour que ce qu'on relit soit ce qui part.
 */
export abstract class VitrineNoticeMailRenderer {
  abstract render(text: VitrineNoticeText): RenderedVitrineNotice;
}
