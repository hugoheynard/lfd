import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../shared/errors/app-error.js";

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

/**
 * Une **mercuriale** exprimée autrement qu'en euros.
 *
 * Le piège central du modèle, et la raison pour laquelle `replace` et `alter`
 * sont deux natures distinctes. Un tarif négocié saisi en « −13 % » suit le prix
 * de liste : le jour où le PIM augmente, le prix du client augmente avec lui.
 * Ce n'est pas ce qu'on lui a promis — un engagement se stocke en euros.
 *
 * Les autres étages n'ont pas cette contrainte : « 100+ à 1,80 € fixe » et « cet
 * article offert » sont des gestes réels, et rien ne se casse à les autoriser.
 */
export class MercurialeMustPoseAPriceError extends DomainError {
  constructor() {
    super(
      "pricing.mercuriale.must_pose_a_price",
      "Une mercuriale pose un PRIX en euros, jamais un pourcentage : saisie en pourcentage, elle suivrait les hausses du tarif de liste, ce qui n'est pas ce qui a été négocié.",
    );
  }
}

/**
 * Un identifiant de portée (ou d'audience) qui contredit son type.
 *
 * Les deux sens sont refusés : une portée « famille » sans famille ne vise rien,
 * et une portée « tout le catalogue » qui nomme une famille dit deux choses à la
 * fois. Laisser passer l'un ou l'autre donnerait une règle dont personne ne peut
 * dire ce qu'elle vise sans lire le code qui la lit.
 */
export class ScopeIdMismatchError extends DomainError {
  constructor(
    readonly axis: string,
    readonly isWidest: boolean,
    readonly id: string | null,
  ) {
    super(
      "pricing.scope.id_mismatch",
      isWidest
        ? `La ${axis} la plus large ne désigne rien en particulier : « ${String(id)} » est de trop.`
        : `Cette ${axis} doit désigner une cible, et aucune n'est fournie.`,
    );
  }
}

/** Une fenêtre de validité qui se ferme avant de s'ouvrir. */
export class ReversedValidityWindowError extends DomainError {
  constructor(
    readonly validFrom: Date,
    readonly validTo: Date,
  ) {
    super(
      "pricing.window.reversed",
      `La fin de validité (${validTo.toISOString()}) précède ou égale son début (${validFrom.toISOString()}).`,
    );
  }
}

/**
 * Un plancher fixé **au-dessus** du prix canonique.
 *
 * Il ne planchérait rien : il relèverait tous les prix, y compris ceux
 * qu'aucune règle n'a touchés. Ce serait une hausse tarifaire déguisée en
 * garde-fou, saisie dans l'écran qui protège des hausses — et personne ne
 * penserait à la chercher là.
 */
export class FloorAboveCanonicalError extends DomainError {
  constructor(readonly bp: number) {
    super(
      "pricing.floor.above_canonical",
      `Un plancher à ${String(bp / 100)} % du prix canonique le dépasse : il relèverait les prix au lieu de les protéger.`,
    );
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

/** Aucun plancher n'était posé sur cette portée. Même raisonnement. */
export class PriceFloorNotFoundError extends ResourceNotFoundError {
  constructor(
    readonly scopeType: string,
    readonly scopeId: string | null,
  ) {
    super(
      "pricing.floor.not_found",
      `Aucune limite posée sur cette portée (${scopeType}${scopeId === null ? "" : ` : ${scopeId}`}).`,
    );
  }
}

/**
 * Une portée qui n'existe pas, reçue par un segment de chemin.
 *
 * Refusée à la frontière plutôt que laissée descendre : plus bas, elle ne
 * correspondrait à rien et ressortirait en « aucune limite posée » — un 404 qui
 * mentirait sur la cause.
 */
export class UnknownPriceScopeError extends DomainError {
  constructor(readonly value: string) {
    super("pricing.scope.unknown", `Portée inconnue « ${value} ».`);
  }
}

/**
 * Un plancher dynamique **sans condition d'ouverture**.
 *
 * Ce serait un mur plus bas : le plancher dur ne servirait plus à rien, et
 * personne ne verrait qu'il a été contourné — puisque l'écran continuerait de
 * l'afficher.
 */
export class UnlockableDynamicFloorError extends DomainError {
  constructor() {
    super(
      "pricing.floor.dynamic_without_key",
      "Un plancher dynamique doit être déverrouillé par une quantité, un volume, ou les deux : sans condition, il remplacerait purement et simplement le plancher dur.",
    );
  }
}

/**
 * Un plancher dynamique **au-dessus** du plancher dur.
 *
 * Il ne s'ouvrirait sur rien : le mur mordrait d'abord, et l'écran afficherait
 * une condition de volume qui ne change jamais le prix. Refusé à la saisie,
 * pendant que c'est encore une faute de frappe.
 *
 * Comparé seulement à unité égale : « 50 % du tarif » et « 1,20 € » ne se
 * comparent pas sans connaître l'article, et cet agrégat peut porter sur toute
 * une famille.
 */
export class DynamicFloorNotBelowHardError extends DomainError {
  constructor() {
    super(
      "pricing.floor.dynamic_not_below_hard",
      "Le plancher dynamique doit être STRICTEMENT sous le plancher dur : au-dessus, il ne s'ouvrirait sur rien.",
    );
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

/** Un sujet de journal qui n'existe pas — même raisonnement que pour une portée. */
export class UnknownPricingSubjectError extends DomainError {
  constructor(readonly value: string) {
    super("pricing.subject.unknown", `Sujet de journal inconnu « ${value} ».`);
  }
}

/**
 * Une limite **en euros** posée sur une portée qui n'est pas une unité.
 *
 * « Jamais sous 1,50 € » ne veut rien dire sur tout le catalogue, ni sur une
 * famille : le même mur laisserait passer une pièce montée à 1,50 € et
 * relèverait un croissant qui se vend 2,00 €. Le montant ne prend son sens qu'une
 * fois qu'on sait DE QUEL article on parle.
 *
 * Une **fraction**, elle, suit l'article : « jamais sous 60 % du tarif » protège
 * la pièce montée et le croissant de la même façon, chacun à son échelle. C'est
 * la seule forme qu'une portée large peut porter honnêtement.
 */
export class AmountFloorOnBroadScopeError extends DomainError {
  constructor(readonly scopeType: string) {
    super(
      "pricing.floor.amount_on_broad_scope",
      "Une limite en euros ne veut rien dire au-delà d'un article : le même montant relèverait les uns et laisserait passer les autres. Sur tout le catalogue ou sur une famille, la limite s'exprime en pourcentage du tarif.",
    );
  }
}

/** Une échelle de volume **sans palier** : elle ne dit rien. */
export class EmptyVolumeLadderError extends DomainError {
  constructor() {
    super(
      "pricing.ladder.empty",
      "Un barème de volume porte au moins un palier : sans palier, il n'accorde rien et occupe pourtant l'étage volume.",
    );
  }
}

/**
 * Deux paliers à la **même quantité**, ou une quantité nulle.
 *
 * À quantité égale, lequel gagne ? La réponse dépendrait de l'ordre de saisie,
 * donc du hasard — la même faute que deux règles également spécifiques, et le
 * même refus.
 */
export class AmbiguousVolumeTierError extends DomainError {
  constructor(readonly minQuantity: number) {
    super(
      "pricing.ladder.ambiguous_tier",
      `Deux paliers ne peuvent pas partager la même quantité (${String(minQuantity)}), et une quantité de palier est strictement positive.`,
    );
  }
}

/**
 * Un barème où **commander plus rapporte moins**.
 *
 * C'est l'incohérence que des règles indépendantes ne pouvaient pas voir :
 * « 50+ à −10 %, 100+ à −5 % » se compose de deux règles parfaitement valides,
 * et forme pourtant un barème que personne n'a voulu — un client qui passe de 90
 * à 100 pièces verrait sa remise fondre.
 */
export class RegressiveVolumeLadderError extends DomainError {
  constructor(
    readonly minQuantity: number,
    readonly previousMinQuantity: number,
  ) {
    super(
      "pricing.ladder.regressive",
      `Le palier ${String(minQuantity)} accorde moins que le palier ${String(previousMinQuantity)} : commander plus y rapporterait moins.`,
    );
  }
}
