import { ArchivedMercurialeIsSealedError, ReversedValidityWindowError } from "../pricing-errors.js";
import { normalizeGrid, type PricingGridLine } from "../pricing-grid.js";
import { IN_FORCE, closingWindowAt, statusOf, suspendedFromOf } from "../rule-lifecycle.js";
import type { RuleLifecycle, RuleStatus } from "../rule-lifecycle.js";
import type { PriceRule, PricingContext } from "../price-rule.js";
import type {
  LineSegment,
  MercurialeAmendment,
  MercurialeAmendmentDraft,
} from "./mercuriale-amendment.js";
import {
  MERCURIALE_REFUSALS,
  assertNoDoubleNegotiation,
  checkedAmendment,
} from "./mercuriale-amendment-checks.js";
import { carryOverDraft, type CarryOver } from "./mercuriale-carry-over.js";
import { mercurialeMissesTier, mercurialeRuleFor, segmentFor } from "./mercuriale-rule.js";
import { allSegments, linesAt } from "./mercuriale-segments.js";

export type { CarryOver } from "./mercuriale-carry-over.js";
export type {
  AmendmentOrigin,
  LineSegment,
  MercurialeAmendment,
  MercurialeAmendmentDraft,
} from "./mercuriale-amendment.js";

/** Une ligne accordée : un article, ses paliers. Pas de `plannedVolume` — cf. la classe. */
export type MercurialeLine = PricingGridLine;

/** Ce qu'un appelant apporte pour poser : l'intention, pas l'état. */
export interface CompanyMercurialeDraft {
  /** Identifiant **opaque** de la société. Aucune clé étrangère ne traverse. */
  readonly companyId: string;
  readonly label: string;
  readonly lines: readonly MercurialeLine[];
  /** Borne basse **incluse**. */
  readonly validFrom: Date;
  /** Borne haute **exclue**. `null` = sans terme. */
  readonly validTo: Date | null;
}

export interface CompanyMercurialeState extends CompanyMercurialeDraft {
  readonly id: string;
  readonly createdBy: string;
  readonly lifecycle: RuleLifecycle;
  /**
   * Les avenants datés, **dans l'ordre d'écriture** — chargés dans l'agrégat,
   * parce que c'est lui qui refuse un doublon entre la grille et un avenant.
   */
  readonly amendments: readonly MercurialeAmendment[];
}

/**
 * **La mercuriale d'un client, en tant qu'agrégat.**
 *
 * Le tarif négocié d'UNE société : des prix fermes en euros, par article, sur
 * une période datée, qui remplacent le tarif catalogue et **ferment la chaîne
 * des remises**. La définition complète est dans
 * `documentation/pricing/mercuriales/comprendre-une-mercuriale.md`.
 *
 * ## Pourquoi un objet, et pas N règles
 *
 * Elle l'a été : poser écrivait une règle indépendante par article et par
 * palier, et rien ne les reliait. « Mercuriale 2027 » n'existait alors que
 * comme une déduction — les règles qui partagent un libellé et une fenêtre —
 * avec ce que ça implique : clore, c'était archiver N lignes ; renommer, en
 * réécrire N sous transaction ; et deux mercuriales homonymes se confondaient.
 *
 * ## Ce qu'elle refuse, et que N règles ne pouvaient pas voir
 *
 * Une grille **qui monte** — « 0,80 € puis 0,85 € à partir de 5 000 » — est
 * parfaitement saisissable palier par palier et parfaitement absurde. Chaque
 * palier pris seul est valide ; l'incohérence n'apparaît qu'une fois la grille
 * réunie en **une** décision. C'est ce refus qui justifie l'agrégat, pas le
 * confort de lecture.
 *
 * Même chose pour **deux fois le même article** (le prix dépendrait de l'ordre
 * de lecture) et pour la **grille vide** (un tarif sans contenu, dont personne
 * ne sait s'il est une saisie ratée ou un choix).
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
 * Décision du 2026-09-08 : on la pose entière, on la clôt entière, et la
 * grille posée n'est jamais réécrite — seul le **libellé** se corrige
 * (cf. {@link rename}). Depuis le 2026-10-29, un **avenant** daté ajoute une
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
   * @throws {EmptyMercurialeError} aucune ligne, ou une ligne sans palier.
   * @throws {DuplicateMercurialeSkuError} deux lignes sur le même article.
   * @throws {NonDecreasingMercurialeTiersError} une grille où commander plus
   *   coûte plus cher, ou deux paliers au même seuil.
   * @throws {ReversedValidityWindowError} fenêtre qui se ferme avant de s'ouvrir.
   */
  static pose(id: string, draft: CompanyMercurialeDraft, createdBy: string): CompanyMercuriale {
    if (draft.validTo !== null && draft.validTo.getTime() <= draft.validFrom.getTime()) {
      throw new ReversedValidityWindowError(draft.validFrom, draft.validTo);
    }
    return new CompanyMercuriale({
      ...draft,
      lines: normalizeGrid(draft.lines, MERCURIALE_REFUSALS),
      id,
      createdBy,
      lifecycle: IN_FORCE,
      amendments: [],
    });
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

  get status(): RuleStatus {
    return statusOf(this.state.lifecycle);
  }

  /** L'instant où elle a cessé d'agir, ou `null`. Pause et clôture confondues. */
  get suspendedFrom(): Date | null {
    return suspendedFromOf(this.state.lifecycle);
  }

  /**
   * **Renommer** — la seule retouche du document lui-même : le libellé ne
   * participe à aucun calcul. Un prix, un article ou une borne se changent par
   * un avenant ou en closant et reposant, jamais en réécrivant la grille.
   *
   * @throws {ArchivedMercurialeIsSealedError} elle est close.
   */
  rename(label: string): CompanyMercuriale {
    this.assertNotArchived();
    return new CompanyMercuriale({ ...this.state, label });
  }

  /**
   * **Amender** : ajouter un avenant daté (`plan-tarif-date-sur-une-reference.md`).
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
    const amendment: MercurialeAmendment = {
      ...checkedAmendment(this.state, draft, now),
      id,
      createdBy: by,
      createdAt: now,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    };
    const amended = { ...this.state, amendments: [...this.state.amendments, amendment] };
    assertNoDoubleNegotiation(amended, amendment);
    return new CompanyMercuriale(amended);
  }

  /**
   * **Reporter** sur la référence née d'un détachement le prix que l'ancienne
   * porte ici — un avenant dont l'origine est dite (cf. {@link carryOverDraft}).
   *
   * @throws {NoNegotiatedLineToCarryError} l'ancienne référence n'a plus de prix ici.
   * @throws les refus de {@link amend}, dont le doublon.
   */
  carryOver(id: string, carry: CarryOver, by: string, now: Date): CompanyMercuriale {
    return this.amend(id, carryOverDraft(this.state, carry, now), by, now);
  }

  /**
   * **Clore.** Terminal : elle cesse d'agir et **rend sa place**.
   *
   * Rendre sa place est le point : c'est la condition pour en reposer une sur la
   * même période, et c'est ce que la contrainte d'exclusion partielle
   * (`WHERE archived_at IS NULL`) traduit en base.
   *
   * Rien n'est effacé — une lecture datée d'avant la clôture la retrouve, et ce
   * qu'elle a facturé est figé sur les commandes.
   *
   * 🔴 Fausse jusqu'au 2026-09-09 (R17) : les lecteurs filtrent
   * `archived_at IS NULL`, et clore la faisait disparaître du passé. Clore
   * écrit donc **aussi** la fin dans la fenêtre, où le domaine la lit ;
   * `archived_at` garde son rôle — rendre sa place pour qu'on puisse reposer.
   *
   * {@link closingWindowAt} porte les quatre cas — dont les **trois** où ne rien
   * borner est la bonne réponse.
   *
   * @throws {ArchivedMercurialeIsSealedError} elle l'est déjà.
   */
  close(by: string, at: Date, reason: string | null): CompanyMercuriale {
    this.assertNotArchived();
    const closedAt = closingWindowAt(this.state, suspendedFromOf(this.state.lifecycle), at);
    return new CompanyMercuriale({
      ...this.state,
      ...(closedAt === null ? {} : { validTo: closedAt }),
      // Ses avenants sont rangés avec elle, au même instant et pour le même
      // motif. Leur fenêtre n'est pas réécrite : elle est coupée à la lecture
      // par celle du document, que `closedAt` vient de borner.
      amendments: this.state.amendments.map((amendment) =>
        amendment.archivedAt === null
          ? { ...amendment, archivedAt: at, archivedBy: by, archiveReason: reason }
          : amendment,
      ),
      lifecycle: {
        ...this.state.lifecycle,
        archivedAt: at,
        archivedBy: by,
        archiveReason: reason,
      },
    });
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
