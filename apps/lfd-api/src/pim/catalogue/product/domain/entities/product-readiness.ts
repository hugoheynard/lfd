import { AnonymousReadinessError, ProductNotDeclaredReadyError } from "../errors/product-errors.js";

/**
 * Ce qu'une **déclaration de publiabilité** vaut : sa date et son auteur.
 *
 * Un `Date`, pas une chaîne : le domaine compare, il ne sérialise pas.
 */
export interface ReadinessSignature {
  readonly readyAt: Date;
  readonly readyBy: string;
}

/**
 * **La mise en vente d'une fiche** : qui a affirmé qu'elle était juste, et quand.
 *
 * Un agrégat à part de `Product`, parce que la signature vit dans sa propre
 * table et qu'écrire une ligne ne doit pas charger la fiche entière. Il porte
 * les deux règles qui peuvent refuser une écriture : une signature a un
 * auteur, et elle ne précède pas ce qu'elle couvre.
 *
 * Il ne touche jamais au statut du produit : la déclaration dit ce qu'une
 * PERSONNE affirme du contenu, pas ce que le catalogue en fait.
 */
export class ProductReadiness {
  private constructor(
    readonly productId: string,
    private current: ReadinessSignature | null,
  ) {}

  /** Une fiche sur laquelle personne ne s'est prononcé. */
  static unsigned(productId: string): ProductReadiness {
    return new ProductReadiness(productId, null);
  }

  /** Relit une signature posée — l'adaptateur de persistance, et lui seul. */
  static signed(productId: string, signature: ReadinessSignature): ProductReadiness {
    return new ProductReadiness(productId, signature);
  }

  /** La signature en place, `null` = personne ne s'est prononcé. */
  get signature(): ReadinessSignature | null {
    return this.current;
  }

  /**
   * Pose la signature, ou remplace l'ancienne par une plus récente.
   *
   * @param at l'instant de la déclaration (l'horloge de la requête).
   * @param by qui signe ; `null` hors requête (seed, cron), où personne n'a
   *   regardé la fiche.
   *
   * @throws {AnonymousReadinessError} personne ne signe.
   */
  declare(at: Date, by: string | null): void {
    if (by === null || by === "") {
      throw new AnonymousReadinessError(this.productId);
    }
    this.current = { readyAt: at, readyBy: by };
  }

  /**
   * Retire la signature courante. L'historique des signatures et de leurs
   * retraits est au journal : la ligne n'est qu'un ÉTAT.
   *
   * @throws {ProductNotDeclaredReadyError} il n'y a pas de signature à retirer.
   */
  withdraw(): void {
    if (this.current === null) {
      throw new ProductNotDeclaredReadyError(this.productId);
    }
    this.current = null;
  }
}
