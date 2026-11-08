/** L'adresse publique d'une image rangée par le bloc `mail`. */
export interface MailImageCopy {
  readonly url: string;
}

/**
 * Port d'**écriture** du stockage public des images d'e-mail (plan
 * `documentation/mail/plan-service-e-mails.md`, § 24).
 *
 * Adressé par le contenu : la clé est le hash des octets, servie
 * `public, max-age=31536000, immutable`. Sous une même adresse l'image ne
 * change jamais, et la même image publiée deux fois n'est rangée qu'une.
 *
 * **Pas de `delete`** : une image publiée est relue par la messagerie d'un
 * e-mail parti il y a des mois. Le verbe n'existe pas, comme sur
 * `CustomerDocumentStore`.
 *
 * @throws {MailImageStorageUnavailableError} stockage non configuré ou en panne.
 */
export abstract class MailImageStore {
  abstract put(bytes: Buffer, contentType: string): Promise<MailImageCopy>;
}
