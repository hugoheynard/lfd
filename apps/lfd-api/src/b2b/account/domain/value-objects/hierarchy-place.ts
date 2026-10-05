import {
  AlreadySubAccountError,
  CompanyCannotParentItselfError,
  CompanyHasSubAccountsError,
  GroupAccountCannotBeSubAccountError,
  NotASubAccountError,
  ParentIsSubAccountError,
} from "../errors/hierarchy-errors.js";

/** Ce qu'il faut pour reconstituer la place d'une société lue en base. */
export interface HierarchyPlaceInput {
  readonly parentCompanyId: string | null;
  /** A-t-elle des sous-comptes ? Lu sous le verrou de la hiérarchie par l'adaptateur. */
  readonly hasSubAccounts: boolean;
  readonly groupWithoutDelivery: boolean;
}

/**
 * **La place d'une société dans la hiérarchie des comptes** (plan
 * `plan-sous-comptes.md`, §2 et §5) — immuable, chaque geste rend une place
 * neuve ou refuse.
 *
 * Les règles de profondeur vivent ICI, pas dans le handler : un compte n'est
 * pas son propre principal, un principal n'est le sous-compte de personne, un
 * compte qui a des sous-comptes n'en devient pas un. Le cycle A→B, B→A est un
 * cas particulier de la deuxième règle — il n'a pas besoin d'une garde à lui.
 *
 * Ces règles ne valent que si les deux places sont lues sous le verrou
 * consultatif unique de la hiérarchie (`AccountHierarchyLock`) : en READ
 * COMMITTED, deux rattachements concurrents se croiseraient sans se voir.
 */
export class HierarchyPlace {
  private constructor(
    readonly parentCompanyId: string | null,
    readonly hasSubAccounts: boolean,
    readonly groupWithoutDelivery: boolean,
  ) {}

  /** Une société seule : ni principal, ni sous-comptes, ni compte de groupe. */
  static standalone(): HierarchyPlace {
    return new HierarchyPlace(null, false, false);
  }

  static reconstitute(input: HierarchyPlaceInput): HierarchyPlace {
    return new HierarchyPlace(
      input.parentCompanyId,
      input.hasSubAccounts,
      input.groupWithoutDelivery,
    );
  }

  /** Est-ce un sous-compte ? */
  get isSubAccount(): boolean {
    return this.parentCompanyId !== null;
  }

  /**
   * Rattache à `parentId`. Idempotent quand le lien existe déjà : deux clics
   * sur le même bouton ne sont pas deux refus.
   *
   * @param selfId `null` pour une société pas encore enregistrée.
   */
  attachTo(selfId: string | null, parentId: string, parent: HierarchyPlace): HierarchyPlace {
    if (selfId === parentId) {
      throw new CompanyCannotParentItselfError(parentId);
    }
    if (this.parentCompanyId === parentId) {
      return this;
    }
    if (this.parentCompanyId !== null) {
      throw new AlreadySubAccountError(selfId ?? "");
    }
    if (parent.isSubAccount) {
      throw new ParentIsSubAccountError(parentId);
    }
    if (this.hasSubAccounts) {
      throw new CompanyHasSubAccountsError(selfId ?? "");
    }
    if (this.groupWithoutDelivery) {
      throw new GroupAccountCannotBeSubAccountError(selfId ?? "");
    }
    return new HierarchyPlace(parentId, false, false);
  }

  /** @throws {NotASubAccountError} il n'y a rien à détacher. */
  detach(selfId: string | null): HierarchyPlace {
    if (this.parentCompanyId === null) {
      throw new NotASubAccountError(selfId ?? "");
    }
    return new HierarchyPlace(null, this.hasSubAccounts, this.groupWithoutDelivery);
  }

  /**
   * Coche ou décoche « Compte de groupe, sans livraison ». Un sous-compte ne
   * peut pas l'être : la case est celle d'un principal (§4).
   */
  markGroupWithoutDelivery(selfId: string | null, enabled: boolean): HierarchyPlace {
    if (enabled && this.isSubAccount) {
      throw new GroupAccountCannotBeSubAccountError(selfId ?? "");
    }
    return new HierarchyPlace(this.parentCompanyId, this.hasSubAccounts, enabled);
  }
}
