import {
  DeliveryProcedureFullError,
  DeliveryProcedureOrderStaleError,
  DeliveryStepNotFoundError,
} from "../errors/delivery-procedure-errors.js";
import {
  PhotoCardList,
  type PhotoCardListRules,
} from "../../../shared/photo-cards/domain/entities/photo-card-list.js";
import { DeliveryStepContent } from "../value-objects/delivery-step-content.js";

/**
 * **Vingt étapes au plus** : au-delà, ce n'est plus une consigne qu'on lit sur
 * le trottoir. `@lfd/contracts` en garde une copie
 * (`DELIVERY_PROCEDURE_MAX_STEPS`) ; l'autorité est ici.
 */
export const DELIVERY_PROCEDURE_MAX_STEPS = 20;

/** L'identité d'une procédure : la sienne, et l'adresse de la société qu'elle sert. */
export interface DeliveryProcedureIdentity {
  readonly id: string;
  readonly companyId: string;
  readonly addressId: string;
}

/** Une étape telle que l'adaptateur l'écrit et la relit. */
export interface DeliveryStepState {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly photoKey: string | null;
}

/**
 * L'état complet de la procédure. Les étapes sont **dans l'ordre** : leur rang
 * dans le tableau EST leur position, et l'adaptateur réécrit `0..n-1`.
 */
export interface DeliveryProcedureState extends DeliveryProcedureIdentity {
  readonly steps: readonly DeliveryStepState[];
}

/**
 * La règle de la liste d'étapes : vingt au plus, ajoutées **en fin**, et les
 * refus dans les mots de la procédure — ceux que le client et le staff lisent
 * aujourd'hui.
 */
const STEP_LIST_RULES: PhotoCardListRules = {
  max: DELIVERY_PROCEDURE_MAX_STEPS,
  insertAt: "end",
  refusals: {
    full: (max) => new DeliveryProcedureFullError(max),
    cardNotFound: (stepId) => new DeliveryStepNotFoundError(stepId),
    orderStale: () => new DeliveryProcedureOrderStaleError(),
  },
};

/**
 * **La procédure de livraison d'une adresse** — les étapes qu'un livreur suit
 * pour déposer la marchandise.
 *
 * Un agrégat et non un CRUD parce que trois règles peuvent refuser une
 * écriture : le nombre d'étapes, une étape inconnue, et un ordre qui doit être
 * une permutation EXACTE des étapes présentes. Cette dernière est la raison
 * d'être de l'agrégat : un réordonnancement envoyé depuis un écran périmé
 * (quelqu'un a ajouté une étape entre-temps) ne se complète pas en devinant.
 *
 * **Le numéro d'une étape n'existe pas ici** : il se déduit du rang. Un numéro
 * stocké se contredirait au premier réordonnancement.
 *
 * L'agrégat ne connaît pas le stockage objet : il porte des **clés**. Chaque
 * geste qui rend une photo orpheline rend son ancienne clé, et c'est le handler
 * qui la supprime du bucket — après la transaction, jamais avant.
 *
 * Les trois règles sont celles de {@link PhotoCardList}, que la procédure porte
 * en champ privé depuis le 2026-09-15 : le carnet de notes du commercial a la
 * même (plan `documentation/b2b/plan-notes-photo-du-commercial.md`, D8). Le
 * vocabulaire public, lui, reste celui des étapes.
 */
export class DeliveryProcedure {
  private constructor(
    private readonly identity: DeliveryProcedureIdentity,
    private readonly steps: PhotoCardList<DeliveryStepContent>,
  ) {}

  /**
   * Ouvre la procédure d'une adresse qui n'en a pas. Elle naît vide et reçoit
   * aussitôt sa première étape : aucun geste ne l'enregistre sans étape.
   */
  static openFor(identity: DeliveryProcedureIdentity): DeliveryProcedure {
    return new DeliveryProcedure({ ...identity }, PhotoCardList.empty(STEP_LIST_RULES));
  }

  /**
   * Rehydrate depuis la base. Le contenu repasse par son value object : une
   * ligne écrite hors du domaine ne rentre pas en mémoire sans être revalidée.
   */
  static reconstitute(state: DeliveryProcedureState): DeliveryProcedure {
    const steps = state.steps.map((step) => ({
      id: step.id,
      content: DeliveryStepContent.create({ title: step.title, body: step.body }),
      photoKey: step.photoKey,
    }));
    return new DeliveryProcedure(
      { id: state.id, companyId: state.companyId, addressId: state.addressId },
      PhotoCardList.of(STEP_LIST_RULES, steps),
    );
  }

  get id(): string {
    return this.identity.id;
  }

  get stepCount(): number {
    return this.steps.size;
  }

  /**
   * Ajoute une étape **en fin** de procédure.
   *
   * @throws {DeliveryProcedureFullError} la procédure a déjà son maximum.
   */
  addStep(stepId: string, content: DeliveryStepContent, photoKey: string | null): void {
    this.steps.add(stepId, content, photoKey);
  }

  /**
   * « Refaire l'étape » : nouveau titre, nouveau texte. La photo se change par
   * {@link attachPhoto} / {@link detachPhoto}.
   *
   * @throws {DeliveryStepNotFoundError} l'étape n'est pas dans la procédure.
   */
  reviseStep(stepId: string, content: DeliveryStepContent): void {
    this.steps.revise(stepId, content);
  }

  /**
   * Pose une photo sur l'étape, et rend la clé qu'elle remplace (`null` s'il
   * n'y en avait pas) — à supprimer du stockage une fois l'écriture validée.
   *
   * @throws {DeliveryStepNotFoundError} l'étape n'est pas dans la procédure.
   */
  attachPhoto(stepId: string, photoKey: string): string | null {
    return this.steps.attachPhoto(stepId, photoKey);
  }

  /**
   * Retire la photo de l'étape et rend sa clé (`null` s'il n'y en avait pas).
   *
   * @throws {DeliveryStepNotFoundError} l'étape n'est pas dans la procédure.
   */
  detachPhoto(stepId: string): string | null {
    return this.steps.detachPhoto(stepId);
  }

  /**
   * **Supprime définitivement** l'étape, et rend la clé de sa photo pour qu'elle
   * parte du stockage avec elle.
   *
   * ⚠️ Exception écrite à « pas de DELETE physique sur un agrégat métier »
   * (`CLAUDE.md` §3) : la RACINE ne se supprime jamais, mais une étape si, parce
   * que Hugo l'a demandé explicitement le 2026-09-15 (« possibilité de supprimer
   * définitivement »). Une consigne d'accès périmée n'a rien d'opposable, et la
   * garder mettrait sous les yeux du livreur un code de portail changé. Plan
   * `documentation/b2b/plan-procedure-de-livraison.md` §2.2.
   *
   * @throws {DeliveryStepNotFoundError} l'étape n'est pas dans la procédure.
   */
  removeStep(stepId: string): string | null {
    return this.steps.remove(stepId);
  }

  /**
   * Range les étapes dans l'ordre donné. La liste doit nommer **chaque** étape
   * présente, **une** fois : une étape manquante, en trop ou répétée signale un
   * écran qui n'a pas vu la dernière écriture, et on refuse plutôt que de ranger
   * à sa place ce qu'il n'a pas vu.
   *
   * @throws {DeliveryProcedureOrderStaleError} la liste n'est pas une
   *   permutation exacte des étapes présentes.
   */
  reorder(stepIds: readonly string[]): void {
    this.steps.reorder(stepIds);
  }

  /** L'état à écrire, étapes dans l'ordre. */
  toPersistence(): DeliveryProcedureState {
    return {
      ...this.identity,
      steps: this.steps.snapshot().map((step) => ({
        id: step.id,
        title: step.content.title,
        body: step.content.body,
        photoKey: step.photoKey,
      })),
    };
  }
}
