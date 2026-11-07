import type { ImageFraming } from "@lfd/mail-blocks";

/**
 * Port du **recadrage** d'une image à copier (plan `plan-editeur-par-blocs.md`,
 * § 19, « Format et point focal ») : les messageries ne recadrent pas de
 * façon fiable, donc la publication le fait.
 *
 * Rend les octets recadrés au format autour du point focal
 * (`cropRectangle`), ramenés à `MAIL_IMAGE_FRAMED_WIDTH_PX` de large au plus
 * (jamais agrandis), réencodés dans le MÊME type. Calcul en mémoire, sans
 * réseau.
 *
 * @throws {MailImageUnreadableError} l'image ne se décode pas.
 */
export abstract class MailImageReframer {
  abstract reframe(bytes: Buffer, contentType: string, framing: ImageFraming): Promise<Buffer>;
}
