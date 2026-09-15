import type { DeliveryProcedureView, DeliveryStepFields } from '@lfd/contracts';

/**
 * Ce qu'on fait de la photo d'une étape qu'on refait.
 *
 * Trois cas et non un `Blob | null` : `null` ne distinguerait pas « je n'y
 * touche pas » de « je la retire », et c'est exactement la confusion qui
 * effacerait une photo en corrigeant une faute de frappe dans le titre.
 */
export type DeliveryStepPhotoChange =
  | { readonly kind: 'keep' }
  | { readonly kind: 'replace'; readonly photo: Blob }
  | { readonly kind: 'remove' };

/**
 * La **procédure de livraison** d'une adresse, vue de l'écran.
 *
 * Un port, parce que client et staff n'écrivent pas au même endroit — le client
 * sur `/companies/:id/…`, muré par son adhésion ; le commercial sur
 * `/admin/companies/:id/…`. Le geste et l'écran sont les mêmes ; seul le chemin
 * change, et c'est l'implémentation fournie par l'app qui le connaît. La
 * société est donc liée à l'instance : l'éditeur ne parle que d'adresse.
 *
 * Classe abstraite plutôt qu'`InjectionToken` : elle sert de jeton ET de type,
 * et une app la fournit au plus près de l'écran (`providers` du panneau ou du
 * dialogue) plutôt qu'à la racine.
 *
 * Les méthodes **rejettent** en cas d'échec, avec :
 * - {@link DeliveryProcedureConflictError} quand la procédure a changé sous
 *   l'écran (un ordre qui n'est plus une permutation exacte, une étape
 *   supprimée par quelqu'un d'autre) — l'éditeur recharge ;
 * - {@link DeliveryProcedureWriteError} sinon, dont le `message` est
 *   **affichable** tel quel.
 */
export abstract class DeliveryProcedureGateway {
  /** La procédure de l'adresse ; sans étape, `steps` est vide. */
  abstract load(addressId: string): Promise<DeliveryProcedureView>;

  /** Ajoute une étape en fin de procédure ; rend son identifiant. */
  abstract addStep(
    addressId: string,
    fields: DeliveryStepFields,
    photo: Blob | null,
  ): Promise<string>;

  /** Refait une étape : titre, texte, et ce qu'on fait de sa photo. */
  abstract reviseStep(
    addressId: string,
    stepId: string,
    fields: DeliveryStepFields,
    change: DeliveryStepPhotoChange,
  ): Promise<void>;

  /** Supprime une étape **définitivement**, photo comprise. */
  abstract removeStep(addressId: string, stepId: string): Promise<void>;

  /** Pose le nouvel ordre : tous les identifiants, chacun une fois. */
  abstract reorder(addressId: string, stepIds: readonly string[]): Promise<void>;

  /**
   * Les octets de la photo d'une étape. `revision` est celle de la vue : la
   * route ne change pas quand la photo change, son contenu si.
   */
  abstract photo(addressId: string, stepId: string, revision: string): Promise<Blob>;
}

/** La procédure a changé entre la lecture et l'écriture : il faut la relire. */
export class DeliveryProcedureConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryProcedureConflictError';
  }
}

/** Une écriture refusée ou échouée ; `message` est sûr à afficher. */
export class DeliveryProcedureWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryProcedureWriteError';
  }
}
