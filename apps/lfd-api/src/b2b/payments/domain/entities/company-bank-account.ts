import { Bic } from "../../../accounting/domain/value-objects/bic.js";
import { Iban } from "../../../accounting/domain/value-objects/iban.js";
import { LegalAddress } from "../../../accounting/domain/value-objects/legal-address.js";
import { DebtorAccount } from "../value-objects/debtor-account.js";

/**
 * L'état complet du compte, **IBAN en clair**.
 *
 * 🔴 Le domaine travaille en clair, et c'est volontaire : le chiffrement est un
 * fait d'infrastructure, pas une règle métier. Un agrégat qui scellerait
 * lui-même dépendrait d'un port de chiffrement pour se tester, et la relecture
 * d'un scellé deviendrait un détour obligé pour vérifier un invariant qui n'a
 * rien à voir. C'est l'adaptateur Prisma qui scelle à l'écriture et ouvre à la
 * relecture — le seul endroit qui touche la colonne.
 */
export interface CompanyBankAccountSnapshot {
  readonly id: string;
  readonly companyId: string;
  readonly holder: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly postalCode: string;
  readonly city: string;
  readonly countryCode: string;
  readonly iban: string;
  readonly bic: string;
}

/** Ce qu'il faut pour déclarer le RIB d'un client. */
export interface CompanyBankAccountDeclaration {
  readonly id: string;
  readonly companyId: string;
  readonly account: DebtorAccount;
}

/**
 * **Le RIB d'une société cliente** — le compte que nous débitons.
 *
 * Agrégat plutôt que colonnes sur `Company`, pour la raison qui vaut aussi
 * pour le mandat : ce n'est pas un réglage, c'est une coordonnée qui **change**,
 * et dont le changement déclenchera une conséquence sur le mandat en cours.
 *
 * ## 🔴 Ce que cet agrégat ne fait PAS encore, et pourquoi
 *
 * Changer de RIB doit avoir un effet sur le mandat : soit en frapper un neuf
 * avec une RUM neuve, soit **amender** l'existant (`AmdmntInd` +
 * `OrgnlDbtrAcct`), qui change le compte en gardant la RUM et la signature. La
 * question est posée à la banque et sans réponse au 2026-09-12.
 *
 * Cet agrégat ne connaît donc **aucun mandat**. Ce qu'il sait déjà faire, et qui
 * ne dépend pas de la réponse, c'est dire si le compte a **réellement** changé —
 * {@link replaceWith}. Le jour où la règle existera, elle se posera là, sur la
 * seule transition qui la déclenche, et pas dans un handler.
 */
export class CompanyBankAccount {
  private constructor(
    readonly id: string,
    readonly companyId: string,
    private accountValue: DebtorAccount,
  ) {}

  /** Le premier RIB d'un client. */
  static declare({ id, companyId, account }: CompanyBankAccountDeclaration): CompanyBankAccount {
    return new CompanyBankAccount(id, companyId, account);
  }

  /**
   * Ligne → agrégat. Les value objects **revalident** au passage : une ligne
   * écrite par une main tierce — script, correction en SQL — est refusée à la
   * relecture plutôt que promenée dans le domaine.
   */
  static reconstitute(snapshot: CompanyBankAccountSnapshot): CompanyBankAccount {
    return new CompanyBankAccount(
      snapshot.id,
      snapshot.companyId,
      DebtorAccount.create({
        holder: snapshot.holder,
        address: LegalAddress.create({
          line1: snapshot.addressLine1,
          line2: snapshot.addressLine2,
          postalCode: snapshot.postalCode,
          city: snapshot.city,
          countryCode: snapshot.countryCode,
        }),
        iban: Iban.create(snapshot.iban),
        bic: Bic.create(snapshot.bic),
      }),
    );
  }

  get account(): DebtorAccount {
    return this.accountValue;
  }

  /**
   * Pose un RIB à la place du précédent.
   *
   * @returns `true` si le **compte bancaire** a réellement changé, `false` si
   *   seuls le titulaire ou l'adresse ont bougé.
   *
   * 🔴 La distinction n'est pas une optimisation d'écriture. Corriger une raison
   * sociale mal orthographiée ou enregistrer un déménagement ne touche pas à ce
   * que le débiteur a autorisé ; changer d'IBAN, si. Traiter les deux pareil
   * ferait refaire signer un mandat pour une faute de frappe — et un client à
   * qui on redemande une signature sans raison finit par ne plus la donner.
   *
   * C'est ce booléen que lira la règle du mandat, quand elle existera.
   */
  replaceWith(account: DebtorAccount): boolean {
    const changed = !this.accountValue.sameAccountAs(account);
    this.accountValue = account;
    return changed;
  }

  /** Agrégat → ligne. L'IBAN en sort **en clair** : c'est l'adaptateur qui scelle. */
  toPersistence(): CompanyBankAccountSnapshot {
    const { holder, address, iban, bic } = this.accountValue;
    return {
      id: this.id,
      companyId: this.companyId,
      holder,
      addressLine1: address.line1,
      addressLine2: address.line2,
      postalCode: address.postalCode,
      city: address.city,
      countryCode: address.countryCode,
      iban: iban.value,
      bic: bic.value,
    };
  }
}
