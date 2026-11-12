import { admissionAt, type PromotionAdmission } from "./mercuriale-promotion-policy.js";
import { ArchivedMercurialeIsSealedError } from "../pricing-errors.js";
import { statusOf, suspendedFromOf } from "../rule-lifecycle.js";
import { closedState } from "./mercuriale-closing.js";
import type { RuleStatus } from "../rule-lifecycle.js";
import type {
  CompanyMercurialeDraft,
  CompanyMercurialeState,
  MercurialeLine,
} from "./company-mercuriale-state.js";
import {
  generalDiscountAt,
  type GeneralDiscount,
  type SpeakingGeneralDiscount,
} from "./general-discount.js";
import type { PriceRule, PricingContext } from "../price-rule.js";
import type {
  LineSegment,
  MercurialeAmendment,
  MercurialeAmendmentDraft,
} from "./mercuriale-amendment.js";
import { amendedState, assertNotAmendedSince, latestAmendmentIdOf } from "./mercuriale-amending.js";
import { carryOverDraft, type CarryOver } from "./mercuriale-carry-over.js";
import { posedState } from "./mercuriale-posing.js";
import { mercurialeMissesTier, mercurialeRuleFor, segmentFor } from "./mercuriale-rule.js";
import { allSegments, linesAt } from "./mercuriale-segments.js";
import { correctedWindowState } from "./mercuriale-window-correction.js";

export type { CarryOver } from "./mercuriale-carry-over.js";
export type {
  AmendmentOrigin,
  LineSegment,
  MercurialeAmendment,
  MercurialeAmendmentDraft,
} from "./mercuriale-amendment.js";
export type {
  CompanyMercurialeDraft,
  CompanyMercurialeState,
  MercurialeLine,
} from "./company-mercuriale-state.js";
export type {
  GeneralDiscount,
  GeneralDiscountChange,
  GeneralDiscountRule,
} from "./general-discount.js";

/** L'identifiant provisoire sous lequel un report est jugé avant d'être tiré. */
const JUDGED_CARRY_OVER_ID = "carry-over-being-judged";

/**
 * **La mercuriale d'un client, en tant qu'agrégat.**
 *
 * Le tarif négocié d'UNE société : des prix fermes en euros, par article, et
 * une remise générale facultative sur le reste, sur une période datée, qui
 * remplacent le tarif catalogue et **ferment la chaîne des remises**. La définition complète est dans
 * `documentation/pricing/mercuriales/comprendre-une-mercuriale.md`.
 *
 * ## Ce qu'elle refuse, et que N règles indépendantes ne verraient pas
 *
 * Une grille **qui monte** — « 0,80 € puis 0,85 € à partir de 5 000 » — est
 * parfaitement saisissable palier par palier et parfaitement absurde. Chaque
 * palier pris seul est valide ; l'incohérence n'apparaît qu'une fois la grille
 * réunie en **une** décision. C'est ce refus qui justifie l'agrégat, pas le
 * confort de lecture.
 *
 * Même chose pour **deux fois le même article** (le prix dépendrait de l'ordre
 * de lecture) et pour la **grille vide** (un tarif sans contenu, dont personne
 * ne sait s'il est une saisie ratée ou un choix) — une mercuriale qui ne
 * porte qu'une remise générale n'est pas vide (D5).
 *
 * ## Ce qu'elle NE refuse pas, parce que ce n'est pas à elle
 *
 * Le **chevauchement** de deux mercuriales chez le même client. L'agrégat n'en
 * voit qu'une à la fois ; la garantie est en base, par contrainte d'exclusion,
 * donc elle tient même contre deux commerciaux qui écrivent au même instant.
 *
 * L'**audience** : une mercuriale vise une société nommée par construction —
 * `companyId` est un champ, pas un choix.
 *
 * ## La grille ne se réécrit pas — elle s'amende
 *
 * On la pose entière, on la clôt entière, et la grille posée n'est jamais
 * réécrite (décidé par Hugo le 2026-09-08) — le **libellé** se corrige
 * (cf. {@link rename}), et les **dates** tant qu'elle n'a pas commencé
 * (cf. {@link correctWindow}). Un **avenant** daté ajoute une
 * ligne, ou en arrête une à une date (changer un prix = arrêter puis ouvrir),
 * sans toucher la grille (cf. {@link amend}, `mercuriale-amendment.ts`) : ce
 * qu'une facture passée explique reste intact.
 *
 * ## Pas de `plannedVolume`
 *
 * Un gabarit le porte comme hypothèse de négociation. Une mercuriale posée est
 * la négociation **terminée** : l'hypothèse a servi, elle ne se transporte pas.
 */
export class CompanyMercuriale {
  private constructor(private readonly state: CompanyMercurialeState) {}

  /**
   * **Poser.** La factory nomme l'intention : on ne « crée » pas une
   * mercuriale, on la pose chez quelqu'un.
   *
   * @throws {EmptyMercurialeError} ni ligne ni remise générale, ou une ligne sans palier.
   * @throws les refus de `checkedGeneralDiscount`.
   * @throws {DuplicateMercurialeSkuError} deux lignes sur le même article.
   * @throws {NonDecreasingMercurialeTiersError} une grille où commander plus
   *   coûte plus cher, ou deux paliers au même seuil.
   * @throws {ReversedValidityWindowError} fenêtre qui se ferme avant de s'ouvrir.
   */
  static pose(id: string, draft: CompanyMercurialeDraft, createdBy: string): CompanyMercuriale {
    return new CompanyMercuriale(posedState(id, draft, createdBy));
  }

  /** Reconstruit sans revérifier : ce qui est en base y est déjà passé. */
  static reconstitute(state: CompanyMercurialeState): CompanyMercuriale {
    return new CompanyMercuriale(state);
  }

  get id(): string {
    return this.state.id;
  }

  get companyId(): string {
    return this.state.companyId;
  }

  get label(): string {
    return this.state.label;
  }

  get lines(): readonly MercurialeLine[] {
    return this.state.lines;
  }

  get amendments(): readonly MercurialeAmendment[] {
    return this.state.amendments;
  }

  /** La politique de départ, posée avec le document. */
  get promotionPolicy(): PromotionAdmission {
    return this.state.promotionPolicy;
  }

  /** La politique de promotions en vigueur à cette date — document, puis avenants. */
  promotionPolicyAt(at: Date): PromotionAdmission {
    return admissionAt(this.state, at);
  }

  /** La remise générale de départ, posée avec le document. */
  get generalDiscount(): GeneralDiscount | null {
    return this.state.generalDiscount;
  }

  /** La remise générale qui parle à cette date, sur sa fenêtre (cf. {@link generalDiscountAt}). */
  generalDiscountAt(at: Date): SpeakingGeneralDiscount | null {
    return generalDiscountAt(this.state, at);
  }

  get status(): RuleStatus {
    return statusOf(this.state.lifecycle);
  }

  /** L'instant où elle a cessé d'agir, ou `null`. Pause et clôture confondues. */
  get suspendedFrom(): Date | null {
    return suspendedFromOf(this.state.lifecycle);
  }

  /**
   * **Renommer** — la seule retouche du document lui-même : le libellé ne
   * participe à aucun calcul. Un prix ou un article se change par un avenant
   * ou en closant et reposant, jamais en réécrivant la grille ; une borne, par
   * {@link correctWindow} tant qu'elle n'a pas commencé.
   *
   * @throws {ArchivedMercurialeIsSealedError} elle est close.
   */
  rename(label: string): CompanyMercuriale {
    this.assertNotArchived();
    return new CompanyMercuriale({ ...this.state, label });
  }

  /**
   * **Amender** : ajouter un avenant daté (`documentation/pricing/mercuriales/l-avenant-date.md`).
   *
   * Jamais rétroactif (Q2) : `now` est l'horloge du handler, et un avenant qui
   * part avant ne changerait pas ce qui a été payé mais ce qu'une relecture en
   * rend. Une mercuriale en pause s'amende ; ses avenants sont suspendus avec
   * elle (Q3), puisque la règle rendue porte la pause du document.
   *
   * @throws {ArchivedMercurialeIsSealedError} elle est close.
   * @throws les refus de `checkedAmendment` et `assertNoDoubleNegotiation`.
   */
  amend(id: string, draft: MercurialeAmendmentDraft, by: string, now: Date): CompanyMercuriale {
    this.assertNotArchived();
    return new CompanyMercuriale(amendedState(this.state, id, draft, by, now));
  }

  /**
   * Le dernier avenant écrit et non rangé, ou `null` — ce qu'un écran annonce
   * avoir vu quand il amende (cf. {@link assertNotAmendedSince}).
   */
  get latestAmendmentId(): string | null {
    return latestAmendmentIdOf(this.state);
  }

  /**
   * Refuse si un avenant a été écrit depuis celui que l'appelant a vu : son
   * écart serait calculé sur un état périmé. À appeler sous le verrou.
   *
   * @throws {MercurialeAmendedMeanwhileError} le dernier avenant n'est pas celui annoncé.
   */
  assertNotAmendedSince(basedOnAmendmentId: string | null): void {
    assertNotAmendedSince(this.state, basedOnAmendmentId);
  }

  /**
   * **Reporter** sur la référence née d'un détachement le prix que l'ancienne
   * porte ici — un avenant dont l'origine est dite (cf. {@link carryOverDraft}).
   *
   * L'avenant est d'abord jugé sous un identifiant provisoire — comme
   * l'aperçu d'un avenant —, et `nextId` n'est tiré qu'une fois tous les
   * refus passés : un report rejoué (le doublon) ne tire rien. Le jugement est
   * pur, la seconde passe rend le même état sous le vrai identifiant.
   *
   * @throws {NoNegotiatedLineToCarryError} l'ancienne référence n'a plus de prix ici.
   * @throws les refus de {@link amend}, dont le doublon.
   */
  carryOver(nextId: () => string, carry: CarryOver, by: string, now: Date): CompanyMercuriale {
    const draft = carryOverDraft(this.state, carry, now);
    this.amend(JUDGED_CARRY_OVER_ID, draft, by, now);
    return this.amend(nextId(), draft, by, now);
  }

  /**
   * **Corriger les dates**, tant qu'elle n'a pas commencé — le pourquoi et
   * les refus sont sur {@link correctedWindowState}. `now` est l'horloge du
   * handler, lue sous le verrou du document.
   *
   * @throws {ArchivedMercurialeIsSealedError} elle est close.
   */
  correctWindow(validFrom: Date, validTo: Date | null, now: Date): CompanyMercuriale {
    this.assertNotArchived();
    return new CompanyMercuriale(correctedWindowState(this.state, validFrom, validTo, now));
  }

  /**
   * **Clore.** Terminal : elle cesse d'agir et **rend sa place** — le pourquoi
   * est sur {@link closedState}.
   *
   * @throws {ArchivedMercurialeIsSealedError} elle l'est déjà.
   */
  close(by: string, at: Date, reason: string | null): CompanyMercuriale {
    this.assertNotArchived();
    return new CompanyMercuriale(closedState(this.state, by, at, reason));
  }

  /**
   * **La mercuriale vue comme la règle de son étage**, pour CET article et à la
   * mesure de CE contexte — `null` quand elle ne porte pas l'article ou qu'aucun
   * palier n'est atteint. Le pourquoi est sur {@link mercurialeRuleFor}.
   */
  asRuleFor(context: PricingContext): PriceRule | null {
    return mercurialeRuleFor(this.state, context);
  }

  /** L'article est négocié mais aucun palier n'est atteint (cf. {@link mercurialeMissesTier}). */
  missesTierFor(context: PricingContext): boolean {
    return mercurialeMissesTier(this.state, context);
  }

  toPersistence(): CompanyMercurialeState {
    return this.state;
  }

  /**
   * Chaque ligne négociée sur sa fenêtre réelle — grille et avenants non
   * rangés, arrêts compris. Pour le dossier staff, qui montre aussi ce qui
   * est à venir ou terminé.
   */
  get segments(): readonly LineSegment[] {
    return allSegments(this.state);
  }

  /** Les lignes qui font un prix à cet instant — grille et avenants, arrêts compris. */
  linesAt(at: Date): readonly MercurialeLine[] {
    return linesAt(this.state, at);
  }

  /**
   * La ligne (grille ou avenant) qui parle pour l'article du contexte à son
   * instant, ou `null`. Pour les lecteurs qui ont besoin des PALIERS — les
   * seuils de la projection —, sans recopier la recherche.
   */
  lineFor(context: PricingContext): MercurialeLine | null {
    return segmentFor(this.state, context)?.line ?? null;
  }

  private assertNotArchived(): void {
    if (this.state.lifecycle.archivedAt !== null) {
      throw new ArchivedMercurialeIsSealedError(this.state.id);
    }
  }
}
