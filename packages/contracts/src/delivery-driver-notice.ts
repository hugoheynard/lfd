import { z } from "zod";

/**
 * **L'information du livreur sur ses données** (`documentation/legal/rgpd-livreur.md`,
 * §7 point 2 ; Hugo, 2026-10-06 : « un dialog qui s'ouvre au moment de
 * démarrer la tournée »).
 *
 * Une INFORMATION préalable, pas un consentement : entre employeur et salarié,
 * le consentement n'est pas une base valable. L'accusé de lecture prouve que
 * le texte a été montré, il n'autorise rien.
 *
 * Routes (`admin/livraison/mes-donnees`, sous `delivery_driving`) :
 * - `GET` → {@link MyDriverNoticeView} : le texte courant, et si la personne
 *   connectée l'a déjà accusé ;
 * - `POST /accuse` (corps {@link AcknowledgeDriverNoticePayload}) → 204,
 *   idempotente. Le livreur n'accuse que pour lui : la personne est celle de
 *   la requête, jamais un paramètre.
 *
 * Le texte vit au serveur, source unique ; l'écran ne fait que l'afficher.
 */
export interface MyDriverNoticeView {
  readonly notice: DriverNoticeView;
  /** L'accusé de LA version courante, ou `null` : le dialogue s'ouvre au départ. */
  readonly acknowledgedAt: string | null;
}

/** Le texte d'information, versionné. */
export interface DriverNoticeView {
  /** Croît à chaque changement de ce que le texte annonce. */
  readonly version: number;
  readonly title: string;
  readonly intro: string;
  readonly sections: readonly DriverNoticeSectionView[];
}

/** Une rubrique : un titre, puis des lignes lues dans l'ordre. */
export interface DriverNoticeSectionView {
  readonly heading: string;
  readonly lines: readonly string[];
}

/** « J'ai compris » — la version LUE : une version périmée est refusée. */
export const acknowledgeDriverNoticePayloadSchema = z.object({
  version: z.number().int().positive(),
});
export type AcknowledgeDriverNoticePayload = z.infer<typeof acknowledgeDriverNoticePayloadSchema>;
