import type { PriceFloorView, PriceRuleView } from "@lfd/contracts";

import type { ReferenceArticle } from "../floor-reference.js";
import type { PriceRule, ScopedPriceFloor } from "../../domain/price-rule.js";

/** Une règle lue une fois, sous ses deux formes : celle qui calcule, celle qui s'affiche. */
export interface LoadedRule {
  readonly rule: PriceRule;
  readonly view: PriceRuleView;
}

export interface LoadedFloor {
  readonly floor: ScopedPriceFloor;
  readonly view: PriceFloorView;
}

/** Ce qu'un écran de tarification a besoin de savoir des décisions posées. */
export interface LoadedDecisions {
  readonly rules: readonly LoadedRule[];
  readonly floors: readonly LoadedFloor[];
}

/**
 * **Port de lecture des DÉCISIONS, pour un écran.**
 *
 * ## Pourquoi il ne se confond pas avec la porte du prix
 *
 * `Pricer` répond à « qu'est-ce qui **s'applique** » ; un écran demande
 * « qu'est-ce qu'on a **décidé** ». Ce ne sont pas deux formulations de la même
 * question, et les confondre a été l'erreur du premier plan de R21 :
 *
 * - la porte lit par `inScopes`, qui passe par `inForceFor` — donc écarte ce qui
 *   est **hors fenêtre**, **suspendu**, ou **hors audience**. Or c'est
 *   précisément ce qu'un écran de paramétrage montre, avec son statut : une
 *   règle programmée, une règle en pause, une règle expirée. Le port des règles
 *   le dit déjà de lui-même — « une règle expirée n'est candidate nulle part et
 *   doit pourtant rester visible » ;
 * - sur le tableau général, lu sans client, l'audience effacerait **toutes** les
 *   règles de mercuriale. L'écran les montre exprès : sa question est « qu'est-ce
 *   qui joue sur ce prix », toutes audiences confondues.
 *
 * Les prix n'auraient pas bougé ; l'écran aurait perdu des lignes en silence, et
 * aucun test de prix n'aurait rougi (vérifié le 2026-09-09).
 *
 * ## Ce que ce port ferme, lui
 *
 * Les deux écrans lisaient ces tables **chacun de son côté**, en Prisma direct —
 * dont un dans une query d'application, ce que `CLAUDE.md` §4 interdit. Deux
 * clauses `where` sur les mêmes lignes, et elles avaient déjà divergé : depuis
 * que les planchers sont versionnés (R17), la fiche client montrait la limite
 * d'AVANT une re-pose, faute de la fenêtre que le tableau général portait.
 *
 * Une seule lecture, donc une seule occasion de se tromper.
 *
 * ## 🔴 Il prend les ARTICLES, et c'est ce qui le garde honnête
 *
 * Une vue de plancher porte l'écart au tarif de référence, donc a besoin du
 * catalogue — **repris à la date lue** quand la lecture est datée. Le faire lire
 * ici obligerait `pricing` à relire un catalogue que ses deux appelants ont déjà,
 * et ferait dépendre ce port de `catalog` : le cycle que `lint:import-cycles` a
 * refusé à la porte du prix le 2026-09-09, pour la même raison.
 *
 * **Déclaré dans `application/` et non dans `domain/`**, comme
 * `PricingBoardReader` et pour son motif : il se contractualise en
 * `PriceRuleView` / `PriceFloorView`, des types du **fil**.
 */
export abstract class PricingDecisionsReader {
  /**
   * Les décisions **telles qu'elles étaient à `at`**, appariées à leur vue.
   *
   * @param companyId Restreint l'audience aux règles ouvertes à tous et à celles
   *   qui visent nommément ce client — la lecture d'une fiche compte. `null`
   *   rend **tout**, ce que le tableau général veut : il montre ce qui joue sur
   *   un prix, y compris les tarifs négociés d'autres comptes.
   * @param articles Le catalogue de l'appelant, au tarif de `at`. Il sert le
   *   tarif de référence des vues de plancher, et rien d'autre.
   */
  abstract decisionsAt(
    at: Date,
    audience: { readonly companyId: string | null },
    articles: readonly ReferenceArticle[],
  ): Promise<LoadedDecisions>;
}
