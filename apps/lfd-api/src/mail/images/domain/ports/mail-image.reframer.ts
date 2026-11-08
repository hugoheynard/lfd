import type { ImageShaping } from "@lfd/mail-blocks";

/**
 * Port de **la mise en forme** d'une image à copier (plan
 * `plan-editeur-par-blocs.md`, § 19, « Format et point focal » ; largeur,
 * 2026-11-08) : les messageries ne recadrent pas de façon fiable et
 * téléchargent l'image entière, donc la publication le fait.
 *
 * Rend les octets recadrés au format autour du point focal s'il y a un
 * cadrage (`cropRectangle`), ramenés à `shaping.maxWidthPx` de large au plus
 * (jamais agrandis), réencodés dans le MÊME type. Une image sans cadrage déjà
 * assez étroite est rendue telle quelle. Calcul en mémoire, sans réseau.
 *
 * @throws {MailImageUnreadableError} l'image ne se décode pas.
 */
export abstract class MailImageReframer {
  abstract reframe(bytes: Buffer, contentType: string, shaping: ImageShaping): Promise<Buffer>;
}
