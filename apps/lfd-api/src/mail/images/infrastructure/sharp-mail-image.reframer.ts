import { Injectable } from "@nestjs/common";
import type { ImageShaping } from "@lfd/mail-blocks";
import sharp, { type Sharp } from "sharp";

import { MailImageUnreadableError } from "../domain/errors/mail-image.errors.js";
import { MailImageReframer } from "../domain/ports/mail-image.reframer.js";
import {
  cropRectangle,
  MAIL_IMAGE_LOSSY_QUALITY,
} from "../domain/value-objects/mail-image-crop.js";

/** Les orientations EXIF qui échangent largeur et hauteur (rotation d'un quart). */
const QUARTER_TURN_ORIENTATIONS: readonly number[] = [5, 6, 7, 8];

/** Le même type en sortie qu'en entrée : un PNG reste un PNG. */
const ENCODERS: Readonly<Record<string, (image: Sharp) => Sharp>> = {
  "image/jpeg": (image) => image.jpeg({ quality: MAIL_IMAGE_LOSSY_QUALITY }),
  "image/webp": (image) => image.webp({ quality: MAIL_IMAGE_LOSSY_QUALITY }),
  "image/png": (image) => image.png(),
  "image/gif": (image) => image.gif(),
};

/**
 * La mise en forme par `sharp` (libvips, en mémoire). L'orientation EXIF est
 * appliquée d'abord : le point focal est posé sur l'image telle qu'on la
 * voit. Un GIF animé garde ses images, chacune recadrée pareil.
 *
 * Une image SANS cadrage déjà plus étroite que la borne garde ses octets :
 * la réencoder ne la réduirait pas et lui ferait perdre en qualité.
 */
@Injectable()
export class SharpMailImageReframer extends MailImageReframer {
  async reframe(bytes: Buffer, contentType: string, shaping: ImageShaping): Promise<Buffer> {
    const encode = ENCODERS[contentType];
    if (encode === undefined) {
      throw new MailImageUnreadableError();
    }
    try {
      const animated = contentType === "image/gif";
      const source = sharp(bytes, { animated });
      const { width, height } = await this.visibleSize(source, animated);
      if (shaping.framing === null && width <= shaping.maxWidthPx) {
        return bytes;
      }
      const oriented = animated ? source : source.rotate();
      const framed =
        shaping.framing === null
          ? oriented
          : oriented.extract(cropRectangle(width, height, shaping.framing));
      const resized = framed.resize({ width: shaping.maxWidthPx, withoutEnlargement: true });
      return await encode(resized).toBuffer();
    } catch (cause) {
      throw new MailImageUnreadableError(cause);
    }
  }

  /** Largeur et hauteur d'UNE image, orientation appliquée. */
  private async visibleSize(
    source: Sharp,
    animated: boolean,
  ): Promise<{ readonly width: number; readonly height: number }> {
    const meta = await source.metadata();
    const height = animated ? (meta.pageHeight ?? meta.height) : meta.height;
    const turned = !animated && QUARTER_TURN_ORIENTATIONS.includes(meta.orientation ?? 1);
    return turned ? { width: height, height: meta.width } : { width: meta.width, height };
  }
}
