/**
 * **Les refus d'une RÈGLE de prix.**
 *
 * Posée, suspendue, reprise, rangée : c'est l'objet du contexte qui a le plus
 * d'états, donc le plus de refus. La catégorie suit la nature du refus, pas
 * l'agrégat — un recouvrement est un **conflit** (409), une alteration mal formée
 * est une **saisie** (400).
 */

import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

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
 * Une règle **aussi spécifique** couvre déjà tout ou partie de cette fenêtre.
 *
 * C'est la contrainte d'exclusion qui parle. Elle est traduite plutôt qu'avalée :
 * sans ça, le staff obtiendrait un 500 sans rapport visible avec ce qu'il vient
 * de saisir, alors que le refus est parfaitement explicable — deux règles
 * également spécifiques au même moment rendraient le prix dépendant de l'ordre
 * de tri, donc du hasard.
 */
export class OverlappingPriceRuleError extends BusinessError {
  constructor(
    readonly stage: string,
    cause?: unknown,
  ) {
    super(
      "pricing.rule.overlaps",
      `Une règle de l'étage « ${stage} », aussi spécifique que celle-ci, est déjà en vigueur sur cette période. Fermez-la ou décalez sa fin avant d'en poser une autre.`,
      cause,
    );
  }
}

/**
 * La règle visée n'existe plus.
 *
 * Un **404** et non un silence : deux personnes peuvent avoir le même écran
 * ouvert, et celle qui arrive seconde mérite de savoir que son geste n'a rien
 * fait plutôt que de croire qu'il a marché.
 */
export class PriceRuleNotFoundError extends ResourceNotFoundError {
  constructor(readonly ruleId: string) {
    super("pricing.rule.not_found", `Aucune règle tarifaire « ${ruleId} ».`);
  }
}

/**
 * Un geste sur une règle **archivée**.
 *
 * L'archivage est terminal, et c'est ce qui lui donne sa valeur : une décision
 * archivée est une décision close, dont l'écran et le journal disent la même
 * chose pour toujours. La rouvrir en la reprenant ferait de l'archive un simple
 * masquage — et personne ne saurait plus si une règle archivée a pu facturer
 * après sa date de fin.
 *
 * Reposer la même règle est évidemment permis : c'est alors une **nouvelle**
 * décision, avec son auteur et sa date, ce qu'elle est réellement.
 */
export class ArchivedPriceRuleIsSealedError extends BusinessError {
  constructor(readonly ruleId: string) {
    super(
      "pricing.rule.archived_is_sealed",
      "Cette règle est archivée : une décision close ne se rouvre pas. Posez-en une nouvelle — elle portera votre nom et sa date, ce qui est plus honnête qu'une reprise.",
    );
  }
}

/**
 * Mettre en pause une règle **déjà en pause**.
 *
 * Un refus, et pas un silence complaisant : deux personnes peuvent avoir le même
 * écran ouvert, et celle qui arrive seconde doit apprendre que quelqu'un l'a
 * précédée. Accepter en ne faisant rien lui ferait croire que c'est SON geste
 * qui a arrêté la promotion — et le journal, lui, nommerait l'autre.
 */
export class PriceRuleAlreadyPausedError extends BusinessError {
  constructor(
    readonly ruleId: string,
    readonly pausedAt: Date,
  ) {
    super(
      "pricing.rule.already_paused",
      `Cette règle est déjà en pause depuis le ${pausedAt.toISOString()} : quelqu'un vous a précédé.`,
    );
  }
}

/** Reprendre une règle qui n'est pas en pause. Même raisonnement, en miroir. */
export class PriceRuleNotPausedError extends BusinessError {
  constructor(readonly ruleId: string) {
    super("pricing.rule.not_paused", "Cette règle n'est pas en pause : il n'y a rien à reprendre.");
  }
}

/**
 * Suspendre ou reprendre une règle dont la **fenêtre est déjà close**.
 *
 * Le geste n'aurait aucun effet — la règle ne s'applique plus depuis sa date de
 * fin — mais il en aurait l'**apparence** : l'écran afficherait « en pause », et
 * quelqu'un croirait avoir arrêté une promotion qui s'était arrêtée toute seule.
 * Un geste qui rassure à tort est pire qu'un refus.
 *
 * Une règle qui n'a **pas encore commencé** se met, elle, très bien en pause :
 * c'est même le cas le plus utile — désamorcer une promotion programmée avant
 * qu'elle ne parte.
 */
export class ClosedPriceRuleWindowError extends BusinessError {
  constructor(
    readonly ruleId: string,
    readonly validTo: Date,
  ) {
    super(
      "pricing.rule.window_closed",
      `Cette règle est terminée depuis le ${validTo.toISOString()} : la suspendre ne changerait rien, sinon l'affichage.`,
    );
  }
}
