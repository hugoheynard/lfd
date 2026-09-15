import type { Bic } from "../../../accounting/domain/value-objects/bic.js";
import type { Iban } from "../../../accounting/domain/value-objects/iban.js";
import type { LegalAddress } from "../../../accounting/domain/value-objects/legal-address.js";
import { InvalidDebtorAccountError } from "../errors/mandate-errors.js";

/** Ce qu'on recopie du RIB d'un client, avant validation. */
export interface DebtorAccountInput {
  readonly holder: string;
  /** Civilité ou forme juridique du titulaire — `""` quand non renseignée. */
  readonly holderLegalForm: string;
  readonly address: LegalAddress;
  readonly iban: Iban;
  readonly bic: Bic;
}

/** La case « Civilité / Forme juridique » du mandat interentreprises (plan §9, décidé le 2026-09-15). */
const HOLDER_LEGAL_FORM_MAX_LENGTH = 40;

/**
 * **Le compte du débiteur — la recopie du RIB d'un client.**
 *
 * C'est le compte que nous débitons, par opposition à `CreditorAccount`, qui est
 * le nôtre et qui reçoit. Les deux portent la même forme — titulaire, adresse,
 * IBAN, BIC — parce qu'un RIB a la même forme des deux côtés du prélèvement.
 *
 * ## Pourquoi il ne réutilise PAS `CreditorAccount`
 *
 * La tentation est réelle : quatre champs identiques, une factory identique. Ce
 * qui diffère n'est pas la forme, ce sont **les règles**, et elles sont opposées
 * sur le seul point qui compte.
 *
 * - `CreditorAccount.sameIdentityAs` compare titulaire et adresse en **excluant
 *   volontairement l'IBAN**, parce qu'un mandat imprime notre nom et notre
 *   adresse mais **pas** notre IBAN : changer de banque ne contredit aucune
 *   signature de notre côté.
 * - Côté débiteur, c'est exactement l'inverse. L'IBAN du débiteur **est** imprimé
 *   sur le mandat (zones 5 et 6 du modèle EPC), et c'est lui que sa banque
 *   oppose. En changer touche à ce qui a été signé.
 *
 * Un parent commun devrait donc porter une comparaison qui n'a pas le même sens
 * dans ses deux enfants — soit précisément le cas où l'héritage ment. On
 * partage les **value objects** (`Iban`, `Bic`, `LegalAddress`), qui portent la
 * forme ; on ne partage pas la règle, qui porte le sens.
 *
 * ## 🔴 Ce que cet objet ne décide PAS
 *
 * Ce qu'un changement de RIB fait au mandat en cours — nouveau mandat, ou
 * amendement (`AmdmntInd` + `OrgnlDbtrAcct`) sous la même RUM — **n'est pas
 * tranché** : la question est posée à la banque et sans réponse au 2026-09-12.
 * C'est pourquoi ce compte vit de façon **autonome**, sans lien vers un mandat :
 * lier les deux maintenant reviendrait à répondre par la structure à une
 * question ouverte, et à devoir défaire une migration pour se corriger.
 */
export class DebtorAccount {
  private constructor(
    readonly holder: string,
    /**
     * Civilité ou forme juridique du **titulaire** — pas de la société : le
     * titulaire peut en différer, et le mandat interentreprises imprime la
     * sienne. Vide permis ici ; c'est la frappe qui l'exige, et seulement en
     * interentreprises (`mintBlockersOf`).
     */
    readonly holderLegalForm: string,
    readonly address: LegalAddress,
    readonly iban: Iban,
    readonly bic: Bic,
  ) {}

  /**
   * Un compte complet, ou rien.
   *
   * ⚠️ **Tout ou rien**, pour la même raison que côté créancier : un compte sans
   * BIC ou sans titulaire ne se découvrirait qu'au **rejet du lot**, cinq jours
   * après l'envoi — et un rejet de prélèvement se paie en frais bancaires et en
   * appel du client. L'état incomplet est rendu inexprimable plutôt que gardé.
   *
   * @throws {InvalidDebtorAccountError} titulaire vide, ou forme juridique du
   *   titulaire plus longue que sa case.
   */
  static create(input: DebtorAccountInput): DebtorAccount {
    const holder = input.holder.trim();
    if (holder === "") {
      throw new InvalidDebtorAccountError(
        "Titulaire du compte",
        "obligatoire — c'est le nom que la banque du débiteur compare au mandat",
      );
    }
    const holderLegalForm = input.holderLegalForm.trim();
    if (holderLegalForm.length > HOLDER_LEGAL_FORM_MAX_LENGTH) {
      throw new InvalidDebtorAccountError(
        "Civilité ou forme juridique du titulaire",
        `${String(HOLDER_LEGAL_FORM_MAX_LENGTH)} caractères au plus — c'est ce que tient la case du mandat`,
      );
    }
    return new DebtorAccount(holder, holderLegalForm, input.address, input.iban, input.bic);
  }

  /**
   * Le même compte, avec une autre forme juridique du titulaire — revalidée.
   *
   * Sert la fusion du RIB : un écran qui n'envoie pas le champ ne doit pas
   * l'effacer (`recordCompanyBankAccount`).
   */
  withHolderLegalForm(holderLegalForm: string): DebtorAccount {
    return DebtorAccount.create({
      holder: this.holder,
      holderLegalForm,
      address: this.address,
      iban: this.iban,
      bic: this.bic,
    });
  }

  /** Les quatre derniers caractères de l'IBAN — de quoi reconnaître, pas débiter. */
  last4(): string {
    return this.iban.last4();
  }

  /**
   * Les deux comptes désignent-ils le **même compte bancaire** ?
   *
   * 🔴 La comparaison porte sur l'**IBAN**, et c'est l'exact inverse de
   * {@link CreditorAccount.sameIdentityAs}, qui l'exclut. La raison est dans le
   * papier : le mandat EPC imprime l'IBAN du débiteur et pas celui du créancier.
   * Un débiteur qui change de banque change donc ce qu'il a signé ; nous, non.
   *
   * Le titulaire et l'adresse sont hors de la comparaison : une raison sociale
   * corrigée ou un déménagement ne changent pas le compte débité.
   */
  sameAccountAs(other: DebtorAccount): boolean {
    return this.iban.value === other.iban.value;
  }
}
