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
