import type { NegotiationRoom, PricingItemView } from "@lfd/contracts";

import type { CatalogArticle } from "../../catalog/domain/catalogue-article.js";
import type { LoadedFloor, LoadedRule } from "./ports/pricing-decisions.reader.js";
import { LoadedPricer } from "../domain/loaded-pricer.js";
import { pricerOver } from "./pricer-over.js";
import { resolveScopedFloor } from "../domain/resolve-floor.js";
import { applies, winnerOf } from "../domain/specificity.js";
import type { CompanyMercuriale } from "../domain/entities/company-mercuriale.js";
import {
  PRICE_STAGES,
  type PriceRule,
  type PriceScope,
  type PriceStage,
  type PricingContext,
  type ScopedPriceFloor,
} from "../domain/price-rule.js";
import type { VolumeLadder } from "../domain/volume-ladder.js";

/**
 * **Ce qui ne dépend pas de l'article, calculé une seule fois par lecture.**
 *
 * Chaque nœud de l'écran a besoin des mêmes trois choses : la liste nue des
 * règles, celle des planchers, et les règles rangées par étage. Les reconstruire
 * article par article coûtait, sur quatre-vingt-douze articles, quatre-vingt-
 * douze copies de chacune — pour un contenu strictement identique à chaque fois.
 *
 * Ce n'est pas une micro-optimisation de confort : le coût suit le **produit**
 * articles × règles, et c'est le catalogue comme le nombre de décisions qui
 * grandissent. Le jour où le PIM en pousse quelques milliers, la différence
 * n'est plus mesurée en millisecondes.
 */
export interface BoardMaterials {
  readonly rules: readonly PriceRule[];
  readonly floors: readonly ScopedPriceFloor[];
  /** Les règles par étage — l'axe sur lequel l'éviction se joue. */
  readonly byStage: ReadonlyMap<PriceStage, readonly PriceRule[]>;
  /**
   * La mercuriale du client lu, ou `null`. **En objet, jamais convertie** :
   * elle vise un article et une mesure, donc sa règle se dérive par article,
   * dans `itemView`. Cf. `CompanyMercuriale.asRuleFor`.
   */
  readonly mercuriale: CompanyMercuriale | null;
  /**
   * 🔴 **Le tarificateur du tableau** — construit une fois pour tout l'écran.
   *
   * L'écran calculait son prix lui-même : contexte, plancher, porte, assemblage.
   * C'est comme ça qu'il a annoncé 1,83924 € quand la caisse facturait
   * 1,65532 € — il recevait les barèmes en paramètre et ne les passait pas.
   *
   * Il ne calcule plus : il demande. La seule différence assumée avec la caisse
   * est le jeu de preuves — `NO_EVIDENCE`, donc la porte d'un plancher dynamique
   * reste FERMÉE, ce qui est la lecture juste : la vitrine ne remplit pas les
   * conditions qu'une commande remplit.
   */
  readonly pricer: LoadedPricer;
}

export async function boardMaterials(
  loadedRules: readonly LoadedRule[],
  loadedFloors: readonly LoadedFloor[],
  /**
   * L'instant de lecture. **Obligatoire, et sans valeur par défaut** : une
   * fenêtre de règle se juge contre lui, et un défaut ferait rendre un tableau
   * plausible à l'appelant qui l'oublie. C'est le mode de défaillance que
   * `floorViewFromRow(now = new Date())` a déjà coûté au dépôt.
   */
  at: Date,
  mercuriale: CompanyMercuriale | null = null,
  ladders: readonly VolumeLadder[] = [],
  /**
   * Le client dont on lit le tableau. `null` = le tableau général, qui montre
   * ce que voit un compte sans tarif négocié.
   */
  companyId: string | null = null,
): Promise<BoardMaterials> {
  const rules = loadedRules.map((entry) => entry.rule);
  const floors = loadedFloors.map((entry) => entry.floor);
  const byStage = new Map<PriceStage, readonly PriceRule[]>(
    PRICE_STAGES.map((stage) => [stage, rules.filter((rule) => rule.stage === stage)]),
  );
  return {
    rules,
    floors,
    byStage,
    mercuriale,
    // 🔴 **La fabrique commune, sous la lentille `unproven`.** Cette ligne
    // montait `commitments: []` et `NO_EVIDENCE` à la main : c'était le
    // troisième encodage recensé par `price-lens.ts`, celui que la lentille
    // n'avait pas fermé. La lentille le dit maintenant, et sa signature refuse
    // les engagements — ce n'est plus « le tableau pense à ne pas en passer ».
    //
    // Le sens est inchangé : le tableau montre un prix de vitrine, et un
    // engagement ouvrirait un palier que la vitrine ne promet pas.
    pricer: await pricerOver(
      { rules, floors, ladders, mercuriale, lens: "unproven" },
      { companyId },
      at,
    ),
  };
}

/**
 * **Un article du tableau** — son prix résolu, sa trace, ses paliers, sa limite.
 *
 * Le prix vient de `resolvePrice`, **la fonction qui facture**. Aucune
 * arithmétique d'affichage n'est écrite ici : un écran qui recalcule à sa façon
 * finit par annoncer autre chose que la facture, et c'est précisément ce qu'un
 * client conteste.
 */
export function itemView(
  /**
   * 🔴 **Un article SCELLÉ**, pas un littéral de même forme. Ses deux appelants
   * passaient déjà l'article du catalogue ; la signature, elle, acceptait
   * n'importe quel objet — donc n'importe quel `canonicalMillicents`. C'était la
   * porte structurelle la plus proche encore ouverte après le lot 2, relevée par
   * la batterie et fermée le même jour.
   */
  article: CatalogArticle,
  context: PricingContext,
  materials: BoardMaterials,
  loaded: { rules: readonly LoadedRule[]; floors: readonly LoadedFloor[] },
): PricingItemView {
  const item = {
    sku: article.sku,
    name: article.name,
    category: article.category,
    canonicalMillicents: article.canonicalMillicents,
  };
  // 🔴 **L'écran ne calcule plus son prix : il le demande.** La même méthode que
  // la caisse, sur les mêmes matériaux — barèmes et mercuriale compris. C'est ce
  // qui rend l'oubli d'un étage inexprimable plutôt qu'improbable.
  const priced = materials.pricer.price(item, context.quantity);
  const mercuriale = materials.mercuriale?.asRuleFor(context) ?? null;

  return {
    sku: article.sku,
    name: article.name,
    canonicalMillicents: article.canonicalMillicents,
    ownFloor:
      loaded.floors.find((entry) => targetsArticle(entry.floor.scope, article.sku))?.view ?? null,
    // La grille du barème : chaque ligne est une RÉSOLUTION COMPLÈTE à la
    // quantité du palier — un prix « canonique × (1 − remise) » mentirait dès
    // qu'une promotion compose avec le palier, ou qu'un plancher le relève.
    volumeTiers: materials.pricer.tiers(item, context.quantity),
    effectiveFloor:
      loaded.floors.find((entry) => entry.floor.id === floorIdOf(materials, context))?.view ?? null,
    rules: loaded.rules
      .filter((entry) => targetsArticle(entry.rule.scope, article.sku))
      .map((entry) => entry.view),
    supersededRuleIds: supersededIn(materials.byStage, context, mercuriale),
    sealedByRuleId: priced.sealedByRuleId,
    sealedRuleIds: priced.sealedRuleIds,
    steps: priced.steps.map((step) => ({ ...step })),
    floored: priced.floored,
    clampedToZero: priced.clampedToZero,
    finalMillicents: priced.finalMillicents,
    negotiationRoom: negotiationRoom(priced.finalMillicents, priced.floorMillicents),
    // Posée à `null` ici, remplie par la passe de mesure : la résolution d'un
    // prix ne consulte pas l'historique des ventes, et ne doit pas commencer.
    elasticity: null,
  };
}

/** Le plancher qui **vise** l'article, pour retrouver sa vue. */
function floorIdOf(materials: BoardMaterials, context: PricingContext): string | null {
  return resolveScopedFloor(materials.floors, context)?.id ?? null;
}

/** La portée vise-t-elle **cet article nommément** (et pas sa famille, ni tout le catalogue) ? */
export function targetsArticle(scope: PriceScope, sku: string): boolean {
  return (scope.type === "product" || scope.type === "variant") && scope.id === sku;
}

/**
 * Les règles qui **s'appliquaient** à cet article sans gagner leur étage.
 *
 * Sans ce champ, l'écran alignerait une altération de famille et une altération
 * de produit et laisserait croire qu'elles s'enchaînent — alors que la plus
 * spécifique REMPLACE l'autre à l'intérieur d'un étage. Le lecteur additionnerait
 * deux remises dont une seule a produit un effet, sans aucun moyen de s'en
 * apercevoir : les deux nombres seraient là, et le total ne collerait pas.
 */
function supersededIn(
  byStage: ReadonlyMap<PriceStage, readonly PriceRule[]>,
  context: PricingContext,
  /**
   * La règle de la mercuriale pour CET article, déjà dérivée. Elle n'est pas
   * dans `byStage` — ce groupement est calculé une fois pour tout le tableau,
   * alors qu'elle dépend de l'article.
   */
  mercuriale: PriceRule | null,
): string[] {
  const evicted: string[] = [];
  for (const stage of PRICE_STAGES) {
    const inStage = byStage.get(stage) ?? [];
    const candidates =
      stage === "mercuriale" && mercuriale !== null ? [...inStage, mercuriale] : inStage;
    const applicable = candidates.filter((rule) => applies(rule, context));
    if (applicable.length < 2) {
      continue;
    }
    const winner = winnerOf(applicable, context);
    evicted.push(...applicable.filter((rule) => rule.id !== winner?.id).map((rule) => rule.id));
  }
  return evicted;
}

/**
 * **Ce qu'un commercial peut encore lâcher** sans franchir la limite.
 *
 * Sans limite posée, il n'y a pas de marge définie : rendre `null` plutôt qu'un
 * nombre évite d'annoncer une latitude que personne n'a décidée. Un article déjà
 * relevé au plancher rend `0` — ce qui est une information, et pas la même.
 *
 * Bornée à zéro : un prix passé sous son plancher (donné par une mercuriale, que
 * le plancher relève ensuite) donnerait une marge négative, c'est-à-dire une
 * hausse déguisée en remise dans la colonne où on lit les remises.
 */
function negotiationRoom(
  finalMillicents: number,
  floorMillicents: number | null,
): NegotiationRoom | null {
  if (floorMillicents === null) {
    return null;
  }
  const room = Math.max(0, finalMillicents - floorMillicents);
  return {
    floorMillicents,
    maxDiscountMillicents: room,
    // En points de base du prix FINAL : c'est sur ce prix-là que le commercial
    // annonce « je te fais 5 % », pas sur le canonique que le client n'a jamais vu.
    maxDiscountBp: finalMillicents <= 0 ? 0 : Math.round((room / finalMillicents) * 10_000),
  };
}
