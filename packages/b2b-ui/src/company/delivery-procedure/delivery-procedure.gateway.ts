import type {
  DeliveryProcedureStepView,
  DeliveryProcedureView,
  DeliveryStepFields,
} from '@lfd/contracts';

import {
  PhotoCardsConflictError,
  PhotoCardsGateway,
  PhotoCardsWriteError,
  type PhotoCardPhotoChange,
} from '../../photo-cards/photo-cards.gateway';

/**
 * Ce qu'on fait de la photo d'une étape qu'on refait — la règle du socle
 * photo-cartes, sous le nom que la procédure a publié.
 */
export type DeliveryStepPhotoChange = PhotoCardPhotoChange;

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

/**
 * La procédure a changé entre la lecture et l'écriture : il faut la relire.
 *
 * Elle hérite de l'erreur du socle, et c'est ce qui la fait reconnaître par
 * l'éditeur photo-cartes sans que les passerelles des apps changent.
 */
export class DeliveryProcedureConflictError extends PhotoCardsConflictError {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryProcedureConflictError';
  }
}

/** Une écriture refusée ou échouée ; `message` est sûr à afficher. */
export class DeliveryProcedureWriteError extends PhotoCardsWriteError {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryProcedureWriteError';
  }
}

/** La procédure d'UNE adresse, vue par l'éditeur comme une liste de cartes. */
class AddressDeliverySteps extends PhotoCardsGateway<DeliveryProcedureStepView> {
  constructor(
    private readonly procedure: DeliveryProcedureGateway,
    private readonly addressId: string,
  ) {
    super();
  }

  async load(): Promise<readonly DeliveryProcedureStepView[]> {
    return (await this.procedure.load(this.addressId)).steps;
  }

  add(fields: DeliveryStepFields, photo: Blob | null): Promise<string> {
    return this.procedure.addStep(this.addressId, fields, photo);
  }

  revise(
    stepId: string,
    fields: DeliveryStepFields,
    change: DeliveryStepPhotoChange,
  ): Promise<void> {
    return this.procedure.reviseStep(this.addressId, stepId, fields, change);
  }

  remove(stepId: string): Promise<void> {
    return this.procedure.removeStep(this.addressId, stepId);
  }

  reorder(stepIds: readonly string[]): Promise<void> {
    return this.procedure.reorder(this.addressId, stepIds);
  }

  photo(stepId: string, revision: string): Promise<Blob> {
    return this.procedure.photo(this.addressId, stepId, revision);
  }
}

/**
 * Lie la passerelle de la procédure à une adresse. Une adresse neuve rend une
 * passerelle neuve, et c'est ce changement qui fait recharger l'éditeur.
 */
export function deliveryStepsOf(
  procedure: DeliveryProcedureGateway,
  addressId: string,
): PhotoCardsGateway<DeliveryProcedureStepView> {
  return new AddressDeliverySteps(procedure, addressId);
}
