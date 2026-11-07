/**
 * Port de **la copie des images d'un document** à sa publication (plan
 * `plan-editeur-par-blocs.md`, § 19, S5d ; plan du service d'e-mails, § 23) :
 * rend l'adresse de la copie que le bloc `mail` garde de l'image — ou
 * l'adresse elle-même, si elle est déjà une copie.
 *
 * Il appelle le réseau : jamais dans une transaction. Ses refus sont ceux de
 * la copie (`DomainError` : origine non admise, trop lourde, pas une image ;
 * `TechnicalError` : téléchargement ou stockage indisponible) — l'appelant
 * les rattache au bloc qu'ils concernent.
 */
export abstract class MailDocumentImages {
  abstract copy(sourceUrl: string): Promise<string>;
}
