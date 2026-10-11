import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * Une autre inscription a pris cette URL entre la lecture et l'écriture (→ 409).
 *
 * Elle naît de deux dépôts SIMULTANÉS des mêmes octets : tous deux lisent
 * « absente », le second bute sur l'unicité de l'URL. Le dépôt la rattrape
 * et rend l'image déjà au fonds (2026-10-11) ; elle ne sort en 409 que si un
 * autre appelant de `MediaLibrary.register` la laisse passer.
 */
export class MediaAlreadyRegisteredError extends BusinessError {
  constructor(readonly url: string) {
    super(
      "media.already_registered",
      "Cette image vient d'entrer au fonds par un autre dépôt simultané : rechargez la " +
        "médiathèque, elle y est déjà.",
    );
  }
}
