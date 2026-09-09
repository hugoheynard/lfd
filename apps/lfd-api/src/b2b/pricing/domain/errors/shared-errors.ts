/**
 * **Les refus qui n'appartiennent à AUCUN agrégat.**
 *
 * Fenêtres à l'envers, portées inconnues, instants illisibles : ce que plusieurs
 * familles refusent de la même façon, et qu'il serait faux de ranger chez l'une
 * d'elles.
 */

import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Un prix canonique **négatif**, ou non entier.
 *
 * Zéro passe : un article offert est un cas réel, et le contrat de fil l'accepte
 * déjà. Le négatif, lui, n'a aucune lecture — ce serait une dette envers le
 * client déguisée en ligne de commande.
 */
export class InvalidCanonicalPriceError extends DomainError {
  constructor(readonly priceMillicents: number) {
    super(
      "pricing.canonical.invalid",
      `Le prix canonique doit être un entier positif ou nul (reçu : ${String(priceMillicents)} centimes).`,
    );
  }
}

/**
 * Deux marqueurs de comparaison dans le désordre, ou confondus.
 *
 * Une fenêtre qui se ferme avant de s'ouvrir n'a pas de volume à mesurer, et sa
 * fenêtre miroir irait vers le futur. Refusé à la frontière plutôt que renvoyé
 * vide : un tableau vide se lit « rien n'a bougé », ce qui est un mensonge.
 */
export class ReversedComparisonWindowError extends DomainError {
  constructor(
    readonly from: Date,
    readonly to: Date,
  ) {
    super(
      "pricing.comparison.reversed_window",
      "Le second marqueur doit être postérieur au premier : une fenêtre qui se ferme avant de s'ouvrir n'a rien à mesurer.",
    );
  }
}

/**
 * Une date de lecture illisible.
 *
 * Refusée à la frontière, pendant que c'est encore explicable : une date
 * invalide deviendrait `Invalid Date`, traverserait toutes les comparaisons en
 * rendant `false`, et l'écran afficherait un catalogue vide sans dire pourquoi.
 */
export class InvalidPricingInstantError extends DomainError {
  constructor(readonly value: string) {
    super(
      "pricing.instant.invalid",
      `« ${value} » n'est pas une date lisible : l'écran daté a besoin d'un instant ISO.`,
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

/** Un sujet de journal qui n'existe pas — même raisonnement que pour une portée. */
export class UnknownPricingSubjectError extends DomainError {
  constructor(readonly value: string) {
    super("pricing.subject.unknown", `Sujet de journal inconnu « ${value} ».`);
  }
}

/**
 * **La société visée n'existe pas.**
 *
 * Un 404 et non un tableau vide, et c'est ce qui compte : la tarification d'un
 * client est une lecture FILTRÉE par audience, et un identifiant inconnu ne
 * filtre rien — il rend le catalogue entier au tarif de liste, c'est-à-dire un
 * écran parfaitement plausible qui affirme « ce client paie le tarif public ».
 * Il n'y a aucun moyen de distinguer ce mensonge d'une vérité, sauf ici.
 */
export class PricedCompanyNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super("pricing.company.not_found", `Aucune société « ${companyId} ».`);
  }
}

/**
 * **Cette période a déjà FACTURÉ, sous une mercuriale close.**
 *
 * Un **409**, comme {@link RunningMercurialeError}, et pour une raison plus
 * lourde : la mercuriale qui couvrait ces dates n'est plus en cours, mais des
 * factures la citent. Poser par-dessus donnerait deux tarifs à la même date —
 * celui qui a été payé, figé sur la commande, et celui qu'une relecture rendrait.
 *
 * 🔴 **Le refus vise « a facturé », pas « est passé ».** Une mercuriale close
 * sans qu'aucune commande ne l'ait citée ne bloque rien : la reposer sur sa
 * période est le geste ordinaire « je me suis trompé, je recommence », et le
 * refuser aurait supprimé un usage réel pour protéger un cas qui ne se produit
 * pas. C'est le port `PricedDecisionsReader` qui fait cette différence, et c'est
 * toute sa raison d'être.
 *
 * La sortie n'est pas de clore quoi que ce soit — c'est déjà fait. Elle est de
 * **poser après**, ou d'assumer une correction qui passe par ailleurs. Le
 * message le dit, parce qu'un refus qui ne nomme pas la sortie fait rouvrir le
 * même ticket trois fois.
 */
/**
 * Ce qu'on tentait de poser, **dit avec le mot du métier** et accordé.
 *
 * Une table plutôt que des ternaires dans le message : le genre grammatical
 * n'est pas une règle qu'on recalcule, et un message lu sous pression par du
 * personnel qui n'a pas le code sous les yeux mérite d'être lisible dans le
 * fichier aussi.
 */
const SEALED_SUBJECTS = {
  mercuriale: { rangee: "une mercuriale rangée", posez: "la nouvelle mercuriale" },
  règle: { rangee: "une règle rangée", posez: "la nouvelle règle" },
  barème: { rangee: "un barème rangé", posez: "le nouveau barème" },
  engagement: { rangee: "un engagement rangé", posez: "le nouvel engagement" },
} as const;

export type SealedSubject = keyof typeof SEALED_SUBJECTS;

export class PricedPeriodIsSealedError extends BusinessError {
  constructor(
    readonly subject: SealedSubject,
    readonly validFrom: Date,
  ) {
    const words = SEALED_SUBJECTS[subject];
    super(
      "pricing.priced_period_sealed",
      `Cette période a déjà été facturée sous ${words.rangee} depuis le ` +
        `${validFrom.toISOString().slice(0, 10)}. On ne repose pas par-dessus : ` +
        `une facture citerait un tarif, la relecture en rendrait un autre. ` +
        `Posez ${words.posez} à partir d'aujourd'hui.`,
    );
  }
}

/**
 * **Le même article demandé deux fois** dans un seul appel au `Pricer`.
 *
 * Refusé, et non fusionné. La question est réellement ambiguë : deux lignes de
 * 5 sont-elles un panier de 10 — ce que la caisse en fait, parce qu'un palier
 * de volume se juge sur le total commandé — ou deux demandes indépendantes ?
 * Les deux lectures sont défendables, elles donnent des prix différents dès
 * qu'un barème est posé, et la façade n'a aucun moyen de trancher.
 *
 * Fusionner en silence aurait rendu le tableau de sortie plus court que celui
 * demandé, ce que §4 du document d'architecture refuse pour une raison plus
 * simple encore : personne ne compte les lignes d'un écran.
 */
export class DuplicateArticleError extends DomainError {
  constructor(readonly sku: string) {
    super(
      "pricing.request.duplicate-article",
      `L'article « ${sku} » est demandé deux fois : fusionner les quantités ou poser deux appels, mais la demande telle quelle n'a pas de prix unique.`,
    );
  }
}
