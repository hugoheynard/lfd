import { createHash } from "node:crypto";

import type { MailAttachment, RenderedMail } from "@lfd/mailer";

/**
 * L'empreinte d'un e-mail rendu : l'objet en clair (il se relit dans un
 * diff), le HTML et les pièces jointes par leur SHA-256 (un octet de plus ou
 * de moins les change). Le texte de l'e-mail EST son HTML : `RenderedMail` ne
 * porte pas de version texte séparée (vérifié le 2026-10-23, `packages/mailer/src/types.ts`).
 */
export interface MailFingerprint {
  readonly subject: string;
  readonly htmlSha256: string;
  readonly attachmentsSha256: string | null;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Une pièce jointe BINAIRE (image, PDF) n'entre que par son nom, son type et
 * son identifiant en ligne : ses octets dépendent de la bibliothèque de
 * compression de la machine. Le 2026-10-23, le QR en PNG ne rendait pas les
 * mêmes octets en CI qu'en local, pour le même e-mail. Une pièce texte garde
 * son contenu.
 */
function stable(attachment: MailAttachment): Readonly<Record<string, string | undefined>> {
  const binary =
    /^(image\/|application\/pdf)/u.test(attachment.contentType ?? "") ||
    /\.(png|jpe?g|pdf)$/iu.test(attachment.filename);
  return {
    filename: attachment.filename,
    contentId: attachment.contentId,
    contentType: attachment.contentType,
    content: binary ? undefined : attachment.contentBase64,
  };
}

export function fingerprintOf(mail: RenderedMail): MailFingerprint {
  return {
    subject: mail.subject,
    htmlSha256: sha256(mail.html),
    attachmentsSha256:
      mail.attachments === undefined ? null : sha256(JSON.stringify(mail.attachments.map(stable))),
  };
}
