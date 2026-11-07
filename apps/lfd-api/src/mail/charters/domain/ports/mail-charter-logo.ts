/**
 * Port de **la copie du logo** d'une charte à sa publication (plan
 * `plan-editeur-par-blocs.md`, § 25 ; plan du service d'e-mails, §§ 23–24) :
 * rend l'adresse de la copie que le bloc `mail` garde de l'image — ou
 * l'adresse elle-même, si elle est déjà une copie.
 *
 * Il appelle le réseau : jamais dans une transaction. Ses refus sont ceux de
 * la copie (`DomainError` : origine non admise, trop lourde, pas une image ;
 * `TechnicalError` : téléchargement ou stockage indisponible).
 */
export abstract class MailCharterLogo {
  abstract copy(sourceUrl: string): Promise<string>;
}
