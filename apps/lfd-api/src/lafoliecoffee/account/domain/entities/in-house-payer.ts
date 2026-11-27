import {
  InHouseAcrossBillingFollowError,
  InHousePublicPayerError,
} from "../errors/in-house-payer-errors.js";
import type { InHouseBillingNeighbours } from "../ports/in-house-billing-neighbours.reader.js";

/** Une période de marquage : qui a marqué le payeur « maison », et quand. */
export interface InHouseDeclaration {
  readonly id: string;
  readonly declaredAt: Date;
  /** L'id de fiche de l'agent — sans clé étrangère, comme les autres traces. */
  readonly declaredBy: string;
}

/** Une période close par ce geste : qui a démarqué, et quand. */
export interface InHouseWithdrawal {
  readonly declarationId: string;
  readonly withdrawnAt: Date;
  readonly withdrawnBy: string;
}

/**
 * **La nature « maison » d'un payeur** — un de nos restaurants, enregistré
 * comme client (`comptabilite/facturation/restaurants-maison.md`).
 *
 * Le geste est immédiat dans les deux sens et ne vaut que pour les commandes
 * passées après : chaque commande porte son régime. Il tient deux exclusions :
 * - un organisme public ne peut pas être maison ;
 * - un suivi `billing` relie deux comptes de même nature maison : marquer ou
 *   démarquer un compte dont le principal ou les sites ont l'autre nature est
 *   refusé.
 *
 * Rien ne s'efface : démarquer CLÔT la période vivante, remarquer en ouvre
 * une neuve. L'agrégat ne tient que la période vivante, et ce que le geste
 * vient d'ouvrir ou de clore — ce que l'adaptateur écrit.
 *
 * Les gestes sont idempotents et le disent (`true` = quelque chose a changé),
 * pour que le handler n'écrive ni ne journalise un geste qui n'a pas eu lieu.
 */
export class InHousePayer {
  private constructor(
    readonly companyId: string,
    private declarationValue: InHouseDeclaration | null,
  ) {}

  private openedValue: InHouseDeclaration | null = null;
  private withdrawalValue: InHouseWithdrawal | null = null;

  /** Un payeur relu ; `declaration` (la période vivante) vaut `null` s'il n'est pas maison. */
  static reconstitute(companyId: string, declaration: InHouseDeclaration | null): InHousePayer {
    return new InHousePayer(companyId, declaration);
  }

  get declaration(): InHouseDeclaration | null {
    return this.declarationValue;
  }

  /** La période que ce geste vient d'ouvrir, à insérer ; `null` sinon. */
  get opened(): InHouseDeclaration | null {
    return this.openedValue;
  }

  /** La période que ce geste vient de clore, à mettre à jour ; `null` sinon. */
  get withdrawal(): InHouseWithdrawal | null {
    return this.withdrawalValue;
  }

  get isInHouse(): boolean {
    return this.declarationValue !== null;
  }

  /**
   * Marque le payeur « maison ».
   *
   * @returns `false` s'il l'était déjà : rien n'a changé.
   * @throws {InHousePublicPayerError} la société est un organisme public.
   * @throws {InHouseAcrossBillingFollowError} un voisin de facturation n'est pas maison.
   */
  declare(input: {
    readonly company: { readonly isPublic: boolean };
    readonly neighbours: InHouseBillingNeighbours;
    /** L'identifiant de la période neuve, tiré par l'appelant (`IdGenerator`). */
    readonly id: string;
    readonly at: Date;
    readonly by: string;
  }): boolean {
    if (this.isInHouse) {
      return false;
    }
    if (input.company.isPublic) {
      throw new InHousePublicPayerError(this.companyId);
    }
    this.ensureNeighboursAre(true, input.neighbours);
    const opened = { id: input.id, declaredAt: input.at, declaredBy: input.by };
    this.declarationValue = opened;
    this.openedValue = opened;
    return true;
  }

  /**
   * Retire la nature « maison » : la période vivante est close à `at`.
   *
   * @returns `false` s'il ne l'était pas : rien n'a changé.
   * @throws {InHouseAcrossBillingFollowError} un voisin de facturation est maison.
   */
  withdraw(input: {
    readonly neighbours: InHouseBillingNeighbours;
    readonly at: Date;
    readonly by: string;
  }): boolean {
    const current = this.declarationValue;
    if (current === null) {
      return false;
    }
    this.ensureNeighboursAre(false, input.neighbours);
    this.withdrawalValue = {
      declarationId: current.id,
      withdrawnAt: input.at,
      withdrawnBy: input.by,
    };
    this.declarationValue = null;
    return true;
  }

  private ensureNeighboursAre(inHouse: boolean, neighbours: InHouseBillingNeighbours): void {
    if (neighbours.principalInHouse !== null && neighbours.principalInHouse !== inHouse) {
      throw new InHouseAcrossBillingFollowError(this.companyId, "principal");
    }
    if (neighbours.sites.some((site) => site.inHouse !== inHouse)) {
      throw new InHouseAcrossBillingFollowError(this.companyId, "sites");
    }
  }
}
