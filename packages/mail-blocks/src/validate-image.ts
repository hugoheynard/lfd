import type { ImageBlock } from "./mail-document.js";
import { violation, type MailDocumentViolation } from "./mail-document-violation.js";
import { isHttpsUrl, isImageSourceUrl } from "./urls.js";

/**
 * Les règles de forme d'une image, à chaque enregistrement : une adresse
 * admise (ou vide, l'image n'étant pas encore choisie), un lien en
 * `https://` s'il existe, et pas de lien sur une image décorative.
 */
export function imageViolations(block: ImageBlock): readonly MailDocumentViolation[] {
  if (block.src !== "" && !isImageSourceUrl(block.src)) {
    return [
      violation(
        "image-src-invalid",
        block.id,
        `L'image a pour adresse « ${block.src} », qui n'est pas une adresse en https:// : choisissez l'image dans la médiathèque.`,
      ),
    ];
  }
  if (block.href === undefined) {
    return [];
  }
  if (block.decorative === true) {
    return [
      violation(
        "decorative-image-link",
        block.id,
        "Une image décorative ne porte pas de lien : un lecteur d'écran n'aurait rien à annoncer. Retirez le lien, ou décrivez l'image.",
      ),
    ];
  }
  return isHttpsUrl(block.href)
    ? []
    : [
        violation(
          "href-not-https",
          block.id,
          `L'image pointe vers « ${block.href} », qui n'est pas une adresse en https:// : saisissez l'adresse complète, commençant par https://.`,
        ),
      ];
}

/** À la publication : une image choisie. */
export function imageSourceMissingViolations(block: ImageBlock): readonly MailDocumentViolation[] {
  return block.src === ""
    ? [
        violation(
          "image-src-missing",
          block.id,
          "Ce bloc image n'a pas d'image : choisissez-en une dans la médiathèque, ou retirez le bloc avant de publier.",
        ),
      ]
    : [];
}
