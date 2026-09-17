import { EmailAddress } from "../../../account/domain/value-objects/email-address.js";
import { PersonName } from "../../../account/domain/value-objects/person-name.js";
import { PhoneNumber } from "../../../account/domain/value-objects/phone-number.js";
import type { GuestBuyer } from "../ports/guest-buyer.registrar.js";

/**
 * **Qui commande, quand personne ne peut le dire à notre place** — plan
 * `documentation/b2b/plan-commande-sans-compte.md`, D1.
 *
 * ## Ce que ce value object garantit, et ce qu'il ne garantit pas
 *
 * Il garantit la **forme** de ce qui va être écrit dans l'annuaire : une adresse
 * qui en est une, un prénom qui tient, un téléphone qui ressemble à un
 * téléphone. Rien de plus, et surtout pas que cette adresse appartienne à qui
 * l'a tapée — aucun code ne peut l'attester au moment de la commande, et D2
 * l'assume : deux lignes, deux histoires.
 *
 * ## Pourquoi il existe, alors que Zod a déjà refusé le payload
 *
 * Parce que le contrôleur valide une forme et le domaine porte la règle, et que
 * les deux ne protègent pas les mêmes chemins : un semis, un test, un futur
 * appelant interne n'entrent pas par HTTP. `GrantAccountAccess` a payé cette
 * leçon — sans son passage par `EmailAddress`, une adresse **vide** restait une
 * clé de recherche valide, et le dernier rempart (le mailer) n'était pas le
 * premier.
 *
 * ## Les trois value objects viennent d'`account`, et ne sont pas recopiés
 *
 * Ils appartiennent au contexte qui possède la personne, et la règle qu'ils
 * portent — ce qu'est une adresse, ce qu'est un nom — ne dépend pas de la porte
 * par laquelle on arrive. Le précédent est
 * `b2b/feature-access/domain/feature-exemption.ts`, qui importe `EmailAddress`
 * du même endroit (vérifié le 2026-09-17) : même bloc, une seule définition. En
 * redéclarer une copie ici ferait diverger le jour où l'une des deux se
 * corrigerait.
 *
 * L'**adresse est obligatoire**, et c'est le seul champ qui le soit vraiment :
 * sans elle, pas de confirmation, pas de QR de retrait, pas de code à présenter
 * au comptoir. Le téléphone reste facultatif — il sert à rappeler, pas à
 * identifier —, et le prénom est exigé parce qu'un courriel qui commence par
 * « Bonjour , » se remarque plus qu'il ne coûte à demander.
 */
export class GuestIdentity {
  private constructor(
    private readonly firstName: PersonName,
    private readonly email: EmailAddress,
    private readonly phone: PhoneNumber,
  ) {}

  /**
   * Déclare l'identité d'un visiteur. La factory nomme l'intention, et refuse un
   * état initial invalide.
   *
   * @throws {InvalidEmailError} l'adresse n'en est pas une.
   * @throws {InvalidPersonNameError} le prénom est vide ou trop long.
   * @throws {InvalidPhoneError} le téléphone ne ressemble pas à un numéro.
   */
  static declare(raw: { firstName: string; email: string; phone?: string }): GuestIdentity {
    return new GuestIdentity(
      PersonName.create(raw.firstName, "Prénom"),
      EmailAddress.create(raw.email),
      PhoneNumber.create(raw.phone ?? ""),
    );
  }

  /**
   * Ce que le registre écrit — la forme **normalisée**, jamais la saisie brute.
   *
   * C'est l'adresse en minuscules et sans blancs qui part en base : deux
   * graphies d'une même boîte ne doivent pas donner deux façons d'écrire à la
   * même personne, même si D2 admet qu'elles donnent deux lignes.
   */
  forRegistration(): GuestBuyer {
    return {
      firstName: this.firstName.value,
      email: this.email.value,
      phone: this.phone.value,
    };
  }
}
