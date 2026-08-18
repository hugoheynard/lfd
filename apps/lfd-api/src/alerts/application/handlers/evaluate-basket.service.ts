import type { AlertKind, AlertRule } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { activeRulesFor, resolveAccountRules } from "../../domain/account-alert-rules.js";
import { resolveGlobalRules } from "../../domain/alert-rules.js";
import type { EvaluatedLine } from "../../domain/detectors/context.js";
import { evaluateOrder, type AlertDraft } from "../../domain/evaluate-order.js";
import { AccountAlertOverridesStore } from "../../domain/ports/account-alert-overrides.store.js";
import { AlertRulesStore } from "../../domain/ports/alert-rules.store.js";
import {
  AccountOrderHistoryReader,
  ProductNormReader,
} from "../../domain/ports/order-history.reader.js";

/** Ce qu'une évaluation rend : ce qui se déclenche, et les règles qui l'ont dit. */
export interface BasketEvaluation {
  readonly drafts: readonly AlertDraft[];
  /** Les règles **effectives** du compte — l'appelant en a besoin pour les canaux. */
  readonly rules: ReadonlyMap<AlertKind, AlertRule>;
}

/**
 * Évaluer **un panier** contre les règles effectives d'un compte : résoudre les
 * règles, lire l'historique, appeler les détecteurs.
 *
 * Extrait au **deuxième** usage réel, pas par anticipation : la commande passée
 * (journal + canaux) et le contrôle de panier (rien d'écrit) partagent
 * exactement cette moitié-là. Deux copies auraient fini par ne plus appliquer les
 * mêmes seuils, et c'est le client qui aurait vu la différence — on lui aurait
 * dit « rien à signaler » avant, puis inscrit une alerte après.
 */
@Injectable()
export class EvaluateBasket {
  constructor(
    private readonly rules: AlertRulesStore,
    private readonly overrides: AccountAlertOverridesStore,
    private readonly history: AccountOrderHistoryReader,
    private readonly norms: ProductNormReader,
  ) {}

  async evaluate(input: {
    readonly companyId: string;
    readonly lines: readonly EvaluatedLine[];
    /** La commande évaluée, exclue de son propre historique — `null` pour un panier. */
    readonly excludeOrderId: string | null;
    readonly now: Date;
  }): Promise<BasketEvaluation> {
    const effective = activeRulesFor(
      resolveAccountRules(
        resolveGlobalRules(await this.rules.readAll()),
        await this.overrides.readForCompany(input.companyId),
      ),
    );
    if (effective.size === 0 || input.lines.length === 0) {
      return { drafts: [], rules: effective };
    }

    const skus = input.lines.map((line) => line.sku);
    const [history, norms] = await Promise.all([
      this.history.read({
        companyId: input.companyId,
        excludeOrderId: input.excludeOrderId,
        skus,
        windowDays: widestWindow(effective),
        maxOrdersPerSku: MAX_BASELINE_ORDERS,
        now: input.now,
      }),
      this.norms.read(skus),
    ]);

    return {
      drafts: evaluateOrder({ lines: input.lines, norms, ...history }, effective),
      rules: effective,
    };
  }
}

/**
 * Le plafond du contrat (`baselineOrders` ≤ 50). On lit large **une fois** plutôt
 * qu'au plus juste par règle : chaque détecteur retaille ensuite ce qui le
 * concerne, et une seule lecture sert toutes les règles.
 */
const MAX_BASELINE_ORDERS = 50;

/**
 * La fenêtre la plus large demandée par une règle active — on lit **une** fois
 * pour toutes les règles, et chacune retaille ensuite ce qui la concerne.
 *
 * Tous les types n'ont pas de fenêtre (`first_order` regarde tout l'historique) :
 * on prend le maximum de celles qui en déclarent une.
 */
function widestWindow(rules: ReadonlyMap<AlertKind, AlertRule>): number {
  let widest = MIN_WINDOW_DAYS;
  for (const rule of rules.values()) {
    if ("windowDays" in rule.params) {
      widest = Math.max(widest, rule.params.windowDays);
    }
  }
  return widest;
}

const MIN_WINDOW_DAYS = 30;
