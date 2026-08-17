import { DomainError, TechnicalError } from "../../shared/errors/app-error.js";

/**
 * Deux règles applicables **strictement aussi spécifiques** dans le même étage.
 *
 * Ce n'est pas un cas à arbitrer, c'est une erreur de saisie : le résultat
 * dépendrait de l'ordre de tri, donc du hasard, et deux passations identiques
 * pourraient facturer deux prix. La base l'interdit par une contrainte
 * d'exclusion ; ceci est la seconde barrière, celle qui tient quand les données
 * ne viennent pas de la base (un test, un import, une migration).
 */
export class AmbiguousPriceRulesError extends DomainError {
  constructor(
    readonly stage: string,
    readonly firstRuleId: string,
    readonly secondRuleId: string,
  ) {
    super(
      "pricing.rules.ambiguous",
      `Deux règles de l'étage « ${stage} » sont également spécifiques (${firstRuleId}, ${secondRuleId}) : le prix ne peut pas être déterminé.`,
    );
  }
}

/**
 * Deux planchers de **même portée** visent le même article.
 *
 * Même nature de faute que pour les règles, et même double barrière : un index
 * unique en base, cette vérification dans le domaine. La différence est qu'ici
 * le résultat serait *plus* insidieux — un plancher tiré au hasard entre deux ne
 * se voit que le jour où le mauvais laisse passer un prix trop bas.
 */
export class AmbiguousPriceFloorsError extends DomainError {
  constructor(
    readonly firstFloorId: string,
    readonly secondFloorId: string,
  ) {
    super(
      "pricing.floors.ambiguous",
      `Deux planchers de même portée s'appliquent (${firstFloorId}, ${secondFloorId}) : la limite ne peut pas être déterminée.`,
    );
  }
}

/**
 * Une grandeur d'altération négative ou nulle.
 *
 * La grandeur est **toujours positive** — le sens vit dans `direction`. Un
 * `bp: -2000` avec `direction: 'increase'` n'a aucune lecture évidente, et
 * accepter les deux écritures garantit qu'elles finiront par se contredire.
 */
export class InvalidAlterationError extends DomainError {
  constructor(readonly value: number) {
    super(
      "pricing.alteration.invalid",
      `Une altération porte une grandeur strictement positive (reçu : ${String(value)}).`,
    );
  }
}

/**
 * Un prix canonique **négatif**, ou non entier.
 *
 * Zéro passe : un article offert est un cas réel, et le contrat de fil l'accepte
 * déjà. Le négatif, lui, n'a aucune lecture — ce serait une dette envers le
 * client déguisée en ligne de commande.
 */
export class InvalidCanonicalPriceError extends DomainError {
  constructor(readonly priceCents: number) {
    super(
      "pricing.canonical.invalid",
      `Le prix canonique doit être un entier positif ou nul (reçu : ${String(priceCents)} centimes).`,
    );
  }
}

/**
 * Une ligne de `price_rules` que le domaine ne sait pas lire.
 *
 * Les discriminants sont des `String` en base (contrainte d'exclusion GiST) :
 * rien n'empêche techniquement une valeur inattendue d'y entrer par une
 * migration ou un import. Lever plutôt que se rabattre sur un défaut est le seul
 * choix tenable — une règle illisible qu'on ignorerait facturerait un prix que
 * personne n'a décidé, et sans trace.
 */
export class CorruptedPriceRuleError extends TechnicalError {
  constructor(
    readonly ruleId: string,
    readonly reason: string,
  ) {
    super("pricing.rule.corrupted", `Règle tarifaire « ${ruleId} » illisible : ${reason}.`);
  }
}

/**
 * Une ligne de `price_floors` que le domaine ne sait pas lire.
 *
 * Même raisonnement que pour une règle illisible, en plus tranché : ignorer un
 * plancher retirerait la protection exactement là où quelqu'un avait jugé
 * qu'elle était nécessaire — et sans que rien ne le dise.
 */
export class CorruptedPriceFloorError extends TechnicalError {
  constructor(
    readonly floorId: string,
    readonly reason: string,
  ) {
    super("pricing.floor.corrupted", `Plancher « ${floorId} » illisible : ${reason}.`);
  }
}
