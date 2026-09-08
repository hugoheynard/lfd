import {
  ArchivedMercurialeIsSealedError,
  DuplicateMercurialeSkuError,
  EmptyMercurialeError,
  NonDecreasingMercurialeTiersError,
  ReversedValidityWindowError,
} from "../pricing-errors.js";
import {
  normalizeGrid,
  type GridRefusals,
  type PricingGridLine,
  type PricingTier,
} from "../pricing-grid.js";
import { IN_FORCE, statusOf, suspendedFromOf } from "../rule-lifecycle.js";
import type { RuleLifecycle, RuleStatus } from "../rule-lifecycle.js";
import { volumeQuantityOf } from "../price-rule.js";
import type { PriceRule, PricingContext } from "../price-rule.js";

/**
 * Les trois refus d'une grille, **dits en mercuriale**. Le contrôle est partagé
 * (`pricing-grid.ts`) ; les phrases ne le sont pas — un commercial sur la fiche
 * d'un client ne doit pas lire un message qui parle de gabarit.
 */
const REFUSALS: GridRefusals = {
  empty: () => new EmptyMercurialeError(),
  duplicateSku: (sku) => new DuplicateMercurialeSkuError(sku),
  nonDecreasing: (sku, minQuantity) => new NonDecreasingMercurialeTiersError(sku, minQuantity),
};

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
 * ## Elle se prend en bloc
 *
 * Décision du 2026-09-08 : on la pose entière, on la clôt entière. Une ligne n'a
 * pas de cycle de vie propre — pas de palier qu'on suspend, pas d'article qu'on
 * retire. Si un prix est faux, on clôt et on repose, ce qui laisse les deux
 * décisions visibles côte à côte au lieu de réécrire l'explication d'une facture
 * déjà payée.
 *
 * La seule exception est le **libellé** (cf. {@link rename}).
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
      lines: normalizeGrid(draft.lines, REFUSALS),
      id,
      createdBy,
      lifecycle: IN_FORCE,
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

  get status(): RuleStatus {
    return statusOf(this.state.lifecycle);
  }

  /** L'instant où elle a cessé d'agir, ou `null`. Pause et clôture confondues. */
  get suspendedFrom(): Date | null {
    return suspendedFromOf(this.state.lifecycle);
  }

  /**
   * **Renommer** — la seule modification qu'une mercuriale accepte.
   *
   * Le libellé ne participe à aucun calcul : il n'a qu'un rôle, être lu.
   * Corriger une faute de frappe ne devrait pas coûter une décision close.
   *
   * Tout le reste — un prix, un article, une borne — se change en **closant et
   * reposant**. Retoucher une grille qui a déjà facturé réécrirait
   * l'explication de factures payées : la trace figée sur la commande garderait
   * l'ancien montant, et le journal raconterait autre chose.
   *
   * @throws {ArchivedMercurialeIsSealedError} elle est close.
   */
  rename(label: string): CompanyMercuriale {
    this.assertNotArchived();
    return new CompanyMercuriale({ ...this.state, label });
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
   * @throws {ArchivedMercurialeIsSealedError} elle l'est déjà.
   */
  close(by: string, at: Date, reason: string | null): CompanyMercuriale {
    this.assertNotArchived();
    return this.withLifecycle({ archivedAt: at, archivedBy: by, archiveReason: reason });
  }

  /**
   * **La mercuriale vue comme la règle de son étage**, pour CET article et à la
   * mesure de CE contexte. `null` quand elle ne porte pas l'article, ou quand la
   * mesure n'atteint aucun palier — l'étage est alors transparent, exactement
   * comme lorsqu'aucune règle ne s'applique.
   *
   * ## Pourquoi ici, et pas dans le lecteur
   *
   * Parce qu'il faut la **mesure**, et qu'un lecteur ne l'a pas : il charge une
   * fois pour tout un panier, dont chaque ligne a sa propre quantité. C'est la
   * décision qu'a prise le barème de volume avant nous — `ladderAsRule` n'est
   * appelé par aucun lecteur, chaque appelant convertit au moment où il connaît
   * la quantité.
   *
   * Et ce n'est pas une préférence : convertir trop tôt ne casse pas, ça
   * **ment**. La projection charge ses candidats une fois puis résout à N
   * quantités ; une mercuriale figée au premier palier y rendrait une courbe
   * plate, et une courbe plate se lit comme une réponse.
   *
   * ## 🔴 Au plus UNE règle
   *
   * Toutes les règles issues d'une mercuriale portent `id = mercuriale.id`. En
   * rendre deux — deux paliers du même article — recréerait l'ambiguïté qui a
   * déjà coûté un 400 sur une commande de 20 à l'étage volume. Le palier est
   * donc choisi ici, pas laissé à la résolution.
   *
   * ## La mesure est le CUMUL, pas la commande
   *
   * `volumeQuantityOf` rend `cumulativeQuantity ?? quantity`, et c'est ce que
   * `applies` mesure pour cet étage. Un client sous engagement obtient donc le
   * palier qu'il a négocié dès sa première commande — c'est tout l'objet de
   * l'engagement.
   */
  asRuleFor(context: PricingContext): PriceRule | null {
    // La portée d'une mercuriale est l'ARTICLE, comme `templateToRules` l'écrit.
    // `pricingContextFor` renseigne `productSku` et `variantSku` avec le même
    // sku ; lire l'un des deux suffit et dit lequel fait foi.
    const line = this.state.lines.find((candidate) => candidate.sku === context.productSku);
    if (line === undefined) {
      return null;
    }
    const measured = volumeQuantityOf(context);
    // Le PLUS HAUT palier atteint gagne — les paliers sont triés croissants par
    // l'agrégat, donc le dernier qui passe est le bon.
    let tier: PricingTier | null = null;
    for (const candidate of line.tiers) {
      if (measured >= candidate.minQuantity) {
        tier = candidate;
      }
    }
    if (tier === null) {
      return null;
    }
    return {
      id: this.state.id,
      stage: "mercuriale",
      scope: { type: "product", id: line.sku },
      audience: { type: "company", id: this.state.companyId },
      minQuantity: tier.minQuantity,
      validFrom: this.state.validFrom,
      validTo: this.state.validTo,
      suspendedFrom: suspendedFromOf(this.state.lifecycle),
      label: this.state.label,
      // Une mercuriale ne franchit pas son propre scellement — l'agrégat des
      // règles le refuse, et le dire ici évite qu'on se demande.
      stacksOverMercuriale: false,
      nature: "replace",
      amountMillicents: tier.unitPriceMillicents,
    };
  }

  toPersistence(): CompanyMercurialeState {
    return this.state;
  }

  private withLifecycle(change: Partial<RuleLifecycle>): CompanyMercuriale {
    return new CompanyMercuriale({
      ...this.state,
      lifecycle: { ...this.state.lifecycle, ...change },
    });
  }

  private assertNotArchived(): void {
    if (this.state.lifecycle.archivedAt !== null) {
      throw new ArchivedMercurialeIsSealedError(this.state.id);
    }
  }
}
