import {
  DeliveryProcedureFullError,
  DeliveryProcedureOrderStaleError,
  DeliveryStepNotFoundError,
} from "../errors/delivery-procedure-errors.js";
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

/** L'étape telle que l'agrégat la mute. */
interface Step {
  readonly id: string;
  content: DeliveryStepContent;
  photoKey: string | null;
}

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
 */
export class DeliveryProcedure {
  private constructor(
    private readonly identity: DeliveryProcedureIdentity,
    private steps: Step[],
  ) {}

  /**
   * Ouvre la procédure d'une adresse qui n'en a pas. Elle naît vide et reçoit
   * aussitôt sa première étape : aucun geste ne l'enregistre sans étape.
   */
  static openFor(identity: DeliveryProcedureIdentity): DeliveryProcedure {
    return new DeliveryProcedure({ ...identity }, []);
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
      steps,
    );
  }

  get id(): string {
    return this.identity.id;
  }

  get stepCount(): number {
    return this.steps.length;
  }

  /**
   * Ajoute une étape **en fin** de procédure.
   *
   * @throws {DeliveryProcedureFullError} la procédure a déjà son maximum.
   */
  addStep(stepId: string, content: DeliveryStepContent, photoKey: string | null): void {
    if (this.steps.length >= DELIVERY_PROCEDURE_MAX_STEPS) {
      throw new DeliveryProcedureFullError(DELIVERY_PROCEDURE_MAX_STEPS);
    }
    this.steps.push({ id: stepId, content, photoKey });
  }

  /**
   * « Refaire l'étape » : nouveau titre, nouveau texte. La photo se change par
   * {@link attachPhoto} / {@link detachPhoto}.
   *
   * @throws {DeliveryStepNotFoundError} l'étape n'est pas dans la procédure.
   */
  reviseStep(stepId: string, content: DeliveryStepContent): void {
    this.require(stepId).content = content;
  }

  /**
   * Pose une photo sur l'étape, et rend la clé qu'elle remplace (`null` s'il
   * n'y en avait pas) — à supprimer du stockage une fois l'écriture validée.
   *
   * @throws {DeliveryStepNotFoundError} l'étape n'est pas dans la procédure.
   */
  attachPhoto(stepId: string, photoKey: string): string | null {
    const step = this.require(stepId);
    const previous = step.photoKey;
    step.photoKey = photoKey;
    return previous;
  }

  /**
   * Retire la photo de l'étape et rend sa clé (`null` s'il n'y en avait pas).
   *
   * @throws {DeliveryStepNotFoundError} l'étape n'est pas dans la procédure.
   */
  detachPhoto(stepId: string): string | null {
    const step = this.require(stepId);
    const previous = step.photoKey;
    step.photoKey = null;
    return previous;
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
    const step = this.require(stepId);
    this.steps = this.steps.filter((candidate) => candidate.id !== stepId);
    return step.photoKey;
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
    const byId = new Map(this.steps.map((step) => [step.id, step]));
    const unique = new Set(stepIds);
    if (stepIds.length !== this.steps.length || unique.size !== stepIds.length) {
      throw new DeliveryProcedureOrderStaleError();
    }
    const ordered: Step[] = [];
    for (const stepId of stepIds) {
      const step = byId.get(stepId);
      if (step === undefined) {
        throw new DeliveryProcedureOrderStaleError();
      }
      ordered.push(step);
    }
    this.steps = ordered;
  }

  /** L'état à écrire, étapes dans l'ordre. */
  toPersistence(): DeliveryProcedureState {
    return {
      ...this.identity,
      steps: this.steps.map((step) => ({
        id: step.id,
        title: step.content.title,
        body: step.content.body,
        photoKey: step.photoKey,
      })),
    };
  }

  /** L'étape visée, ou le refus. */
  private require(stepId: string): Step {
    const step = this.steps.find((candidate) => candidate.id === stepId);
    if (step === undefined) {
      throw new DeliveryStepNotFoundError(stepId);
    }
    return step;
  }
}
