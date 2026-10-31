import {
  ArchivedPromotionIsSealedError,
  PromotionAlreadyPausedError,
  PromotionArchiveReasonMissingError,
  PromotionNotPausedError,
} from "./errors/promotion-errors.js";
import {
  applicationPointOf,
  canonicalFulfillment,
  type PromotionApplicationPoint,
} from "./promotion-fulfillment.js";
import { assertTerms, type PromotionTerms } from "./promotion-terms.js";
import { sameTerms } from "./promotion-terms-equality.js";

/** Qui a suspendu, et quand. */
export interface PromotionPause {
  readonly at: Date;
  readonly by: string;
}

/** Qui a archivé, quand, et pourquoi — terminal. */
export interface PromotionArchive {
  readonly at: Date;
  readonly by: string;
  readonly reason: string;
}

/**
 * **D'où vient une promotion reprise** (§ 13.4) — `null` pour une saisie.
 * Écrit par la reprise SQL seulement ; le domaine le relit et le garde, il ne
 * le pose jamais. `floor` et `detached` ne sont qu'une mémoire de la règle
 * d'origine (un plancher qui n'agissait pas, un report après détachement).
 */
export type PromotionOrigin =
  | {
      readonly kind: "price_rule";
      readonly ruleId: string;
      readonly floor?: { readonly mode: string; readonly value: number };
      readonly detached?: unknown;
    }
  | { readonly kind: "pickup_discount"; readonly siteId: string; readonly clientele: string };

export type PromotionStatus = "active" | "paused" | "archived";

/** L'état entier, tel que le dépôt l'écrit et le relit. */
export interface PromotionState extends PromotionTerms {
  readonly id: string;
  readonly paused: PromotionPause | null;
  readonly archived: PromotionArchive | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly origin: PromotionOrigin | null;
  /** La clé qui rend la reprise rejouable ; `null` = saisie. */
  readonly legacySource: string | null;
}

/**
 * **La promotion, en tant qu'agrégat** (`documentation/promotions/promotions.md`, § 2.1, lot L3).
 *
 * Elle porte tout ce qui peut refuser une écriture : les cohérences que les
 * CHECK de la table répètent (point ⇔ acheminement, effet ⇔ point, public ⇔
 * société, fenêtre) et celles qu'aucun CHECK ne voit (la portée). Elle les
 * tient à la pose, à la révision, et à la RELECTURE : une ligne écrite par la
 * reprise SQL qui les contournerait est refusée au chargement.
 *
 * « Deux promotions ne se chevauchent pas » ne vit PAS ici : l'agrégat ne voit
 * qu'une promotion, et le refus lit le catalogue vendable (§ 13.2, lot L7).
 *
 * Immuable : chaque geste rend une nouvelle promotion, que le dépôt écrit.
 */
export class Promotion {
  private constructor(private readonly state: PromotionState) {}

  /**
   * **Poser** une promotion saisie : active, sans origine.
   *
   * @throws les refus de `assertTerms`.
   */
  static pose(id: string, terms: PromotionTerms, by: string, at: Date): Promotion {
    assertTerms(terms);
    return new Promotion({
      ...termsOf(terms),
      id,
      paused: null,
      archived: null,
      createdBy: by,
      createdAt: at,
      origin: null,
      legacySource: null,
    });
  }

  /**
   * **Relire** une promotion en base — et la revalider : la reprise l'a
   * écrite en SQL, sans passer par la pose.
   *
   * @throws les refus de `assertTerms`.
   */
  static restore(state: PromotionState): Promotion {
    assertTerms(state);
    return new Promotion({ ...state, ...termsOf(state) });
  }

  get id(): string {
    return this.state.id;
  }

  get applicationPoint(): PromotionApplicationPoint {
    return applicationPointOf(this.state.fulfillment);
  }

  get status(): PromotionStatus {
    if (this.state.archived !== null) {
      return "archived";
    }
    return this.state.paused === null ? "active" : "paused";
  }

  /** Les termes en vigueur — ce que l'éditeur montre et ce que le résumé lit. */
  get terms(): PromotionTerms {
    return termsOf(this.state);
  }

  /** L'état entier, pour l'adaptateur. */
  toPersistence(): PromotionState {
    return this.state;
  }

  /**
   * **Réviser** : de nouveaux termes, la même identité. Une promotion en pause
   * se révise et reste en pause.
   *
   * @throws {ArchivedPromotionIsSealedError} elle est archivée.
   * @throws les refus de `assertTerms`.
   */
  revise(terms: PromotionTerms): Promotion {
    this.assertNotArchived();
    assertTerms(terms);
    return new Promotion({ ...this.state, ...termsOf(terms) });
  }

  /**
   * **Dit-elle déjà ces termes ?** Une révision identique ne trace rien et
   * n'écrit rien : le journal ne garde que ce qui a changé.
   */
  saysAlready(terms: PromotionTerms): boolean {
    return sameTerms(this.terms, termsOf(terms));
  }

  /**
   * **Suspendre** : elle cesse d'agir et garde sa place — une promotion en
   * pause compte encore au refus de chevauchement (§ 13.2).
   *
   * @throws {ArchivedPromotionIsSealedError} elle est archivée.
   * @throws {PromotionAlreadyPausedError} elle l'est déjà.
   */
  pause(by: string, at: Date): Promotion {
    this.assertNotArchived();
    if (this.state.paused !== null) {
      throw new PromotionAlreadyPausedError(this.state.id);
    }
    return new Promotion({ ...this.state, paused: { at, by } });
  }

  /**
   * **Reprendre.**
   *
   * @throws {ArchivedPromotionIsSealedError} elle est archivée.
   * @throws {PromotionNotPausedError} elle n'était pas suspendue.
   */
  resume(): Promotion {
    this.assertNotArchived();
    if (this.state.paused === null) {
      throw new PromotionNotPausedError(this.state.id);
    }
    return new Promotion({ ...this.state, paused: null });
  }

  /**
   * **Archiver** — terminal, motif obligatoire. Rien ne s'efface : une
   * promotion a facturé, et la retirer effacerait « pourquoi ce prix ». Une
   * promotion en pause s'archive aussi ; sa pause reste écrite.
   *
   * @throws {ArchivedPromotionIsSealedError} elle l'est déjà.
   * @throws {PromotionArchiveReasonMissingError} sans motif.
   */
  archive(by: string, at: Date, reason: string): Promotion {
    this.assertNotArchived();
    if (reason.trim() === "") {
      throw new PromotionArchiveReasonMissingError();
    }
    return new Promotion({ ...this.state, archived: { at, by, reason } });
  }

  private assertNotArchived(): void {
    if (this.state.archived !== null) {
      throw new ArchivedPromotionIsSealedError(this.state.id);
    }
  }
}

/**
 * Les seuls termes — sans quoi une révision pourrait réécrire l'identité —,
 * en forme canonique : points et zones triés (`promotions.md`, § 2.14).
 */
function termsOf(terms: PromotionTerms): PromotionTerms {
  return {
    internalName: terms.internalName,
    description: terms.description,
    label: terms.label,
    audienceLabels: terms.audienceLabels,
    reason: terms.reason,
    effect: terms.effect,
    ownFloor: terms.ownFloor,
    cumulative: terms.cumulative,
    validFrom: terms.validFrom,
    validTo: terms.validTo,
    audiences: terms.audiences,
    fulfillment: canonicalFulfillment(terms.fulfillment),
    scope: terms.scope,
    conditions: terms.conditions,
  };
}
