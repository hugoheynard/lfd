import type { OrderStatus, PaymentStatus } from "@lfd/contracts";

/**
 * La règle du **plan du soir** : quelles commandes une journée absorbe.
 *
 * ## Ce que « le plan absorbe » veut dire
 *
 * À la clôture, l'équipe arrête de prendre des commandes pour le lendemain et
 * lance la nuit. Les commandes de cette journée-là entrent dans le compte à
 * produire : elles cessent d'être « passées » pour devenir « confirmées ».
 *
 * **Personne ne décide commande par commande** — c'est tout l'intérêt. Une
 * journée bascule d'un coup, et aucune main ne se pose sur une ligne en
 * particulier. C'est pour ça que la colonne ne porte pas d'auteur.
 *
 * ## Pourquoi une fonction pure plutôt qu'un `where` en dur
 *
 * La condition tient en un mot aujourd'hui (`placed`). Écrite ici, elle se lit,
 * se teste sans base, et surtout **elle se nomme** : le jour où un état
 * s'ajoute, on vient le classer ici plutôt que de deviner ce qu'un `where`
 * voulait dire.
 */

/**
 * Cette commande entre-t-elle dans le plan ?
 *
 * 🔴 **Seules les `placed`.** Une commande déjà `in_production`, `ready` ou
 * `fulfilled` a dépassé le stade : la reconfirmer la ferait **reculer**, et les
 * états ne reculent jamais. Une `cancelled` n'est plus à produire, et une
 * `draft` n'existe pas encore — aucune des deux n'a sa place dans un compte de
 * fournil.
 *
 * Conséquence heureuse : clore deux fois la même journée absorbe zéro la
 * seconde fois. La clôture est **idempotente par sa règle**, pas par un garde
 * ajouté après coup.
 *
 * ## 🔴 Le RÈGLEMENT entre dans la règle (2026-09-17, Hugo)
 *
 * Le statut de commande ne suffisait plus. `status` et `paymentStatus` sont
 * deux colonnes indépendantes : une commande payée par carte naît `placed` **et**
 * `pending`, et le plan ne regardait que la première. Un paiement explicitement
 * refusé laissait donc une commande que le fournil fabriquait quand même.
 *
 * C'était inoffensif tant que le tunnel était PRO — un client au compte est
 * `not_required`, et il doit être produit. La boutique publique le rend courant :
 * c'est le premier flux où « commande passée » et « commande payée » se séparent
 * en masse, parce que tout le monde y paie par carte.
 *
 * 🔴 **`pending` N'EST PAS ABSORBÉ, pour PERSONNE** — décidé par Hugo le
 * 2026-09-17 pour le public, étendu au pro le 2026-09-22 (D2,
 * `documentation/order/plan-abandon-du-reglement.md`).
 *
 * **On ne produit que ce qui est payé, ou ce qui n'a pas à l'être.** Un
 * règlement encore en vol ne donne droit à aucune fabrication : une carte
 * simplement ABANDONNÉE ne produit aucun événement Stripe, sa commande resterait
 * `pending` pour toujours, et le fournil la fabriquerait toutes les nuits sans
 * que rien ne le démente.
 *
 * ⚠️ **Le prix de cette règle, et il est réel** : un paiement dont le webhook
 * arrive APRÈS la clôture laisse une commande payée hors du plan. La clôture
 * l'épargne quand Stripe dit l'argent pris ou en route, et annule le reste ;
 * un encaissement sur une commande annulée sonne « à rembourser »
 * (`pending-settlement-sweep.service.ts`, `ring-refund-due.handler.ts`,
 * vérifié le 2026-09-26). Une commande `paid` restée `placed` après une
 * clôture reste une anomalie à trancher à la main, pas un cas normal.
 *
 * Le sens du choix est celui-ci : produire pour rien coûte de la marchandise
 * tous les jours, tandis qu'un webhook en retard est un incident rare et
 * visible.
 */
export function absorbedByPlan(status: OrderStatus, payment: PaymentStatus): boolean {
  return status === STATUS_IN_PLAN && settlementAllowsProduction(payment);
}

/**
 * 🔴 **L'ARGENT seul, sans le statut** (2026-09-17, Hugo : « sur l'impression du
 * dossier à arrêt de production »).
 *
 * ## Pourquoi cette moitié existe séparément
 *
 * Le plan du soir pose DEUX conditions — un statut (`placed`) et un règlement —
 * et `absorbedByPlan` les porte ensemble. Mais le **dossier du jour**, la liasse
 * qu'on tire une fois la journée arrêtée, n'a pas la même condition de statut :
 * il garde délibérément les commandes déjà prêtes ou déjà remises, parce que sa
 * pile numérotée sert de preuve qu'il ne manque pas une feuille. Lui appliquer
 * `absorbedByPlan` entier le viderait à la seconde où la journée bascule en
 * `confirmed` — c'est-à-dire exactement au moment où on l'imprime.
 *
 * Il ne partageait donc RIEN, et écartait les seules annulées : le fournil
 * recevait des bons pour des commandes que le plan avait refusées — un règlement
 * mort, ou un visiteur dont la carte est restée en l'air. Mesuré le 2026-09-17
 * sur la base de développement : **9 bons au dossier du lendemain contre 0 au
 * compte à produire**.
 *
 * La moitié « argent » est ce que les deux ont en commun. Le statut, lui, reste
 * propre à chacun — et c'est une différence qui se dit, pas un oubli.
 */
export function settlementAllowsProduction(payment: PaymentStatus): boolean {
  return !PAYMENTS_REFUSED.includes(payment) && !PAYMENTS_AWAITING.includes(payment);
}

/**
 * **Les règlements MORTS** — jamais produits, pour personne.
 *
 * Un paiement refusé ou remboursé ne donne droit à aucune fabrication, qu'il
 * vienne d'un pro ou d'un visiteur. C'est l'étage qui ne se discute pas.
 */
export const PAYMENTS_REFUSED: readonly PaymentStatus[] = ["failed", "refunded"];

/**
 * 🔴 **Le règlement EN VOL — jamais produit, pour PERSONNE** (D2, Hugo,
 * 2026-09-22 ; `documentation/order/plan-abandon-du-reglement.md`).
 *
 * `pending` veut dire « Stripe n'a pas encore répondu ». Jusqu'au 2026-09-22,
 * seul le visiteur en était exclu : le pro restait produit parce qu'il « a un
 * compte et quelqu'un à appeler », et `null` était traité comme « pas public ».
 * Cette exception laissait ouvert le cas d'un pro qui abandonne sa carte — une
 * carte abandonnée n'émet AUCUN événement Stripe, et sa commande aurait été
 * fabriquée toutes les nuits. La clientèle ne compte donc plus ici : on ne
 * produit que ce qui est payé, ou ce qui n'a pas à l'être (`not_required`).
 *
 * ⚠️ Le prix, assumé : un pro dont le webhook arrive après la clôture n'est pas
 * produit. C'est la clôture qui tranche le sort des règlements en vol, en les
 * balayant avant de compter (`PendingSettlementSweep`, lots 3 à 6 bâtis le
 * 2026-09-26) — pas une exception ici.
 */
export const PAYMENTS_AWAITING: readonly PaymentStatus[] = ["pending"];

/**
 * **Le statut de commande qui entre au plan**, et le seul.
 *
 * Exporté pour que les adaptateurs le LISENT au lieu de le réécrire — cf.
 * {@link PAYMENTS_AWAITING}, qui porte la raison de cette exportation.
 */
export const STATUS_IN_PLAN: OrderStatus = "placed";

/**
 * 🔴 **Ces constantes sont la source UNIQUE de ce qui se fabrique**
 * (2026-09-17, Hugo : « rassemble les règles »).
 *
 * La règle était nommée ici — « écrite ici, elle se lit, se teste, et surtout
 * elle se nomme » — et appliquée **nulle part** : quatre adaptateurs posaient
 * chacun son `where` à la main, et rien ne les empêchait de diverger. Le dépôt
 * l'avait même écrit noir sur blanc au-dessus du compteur de contrôle : « la
 * condition est la MÊME que celle du `where` d'`absorbIntoPlan` [...] si les
 * deux divergeaient, le compteur mentirait dans le sens rassurant ». Elles ont
 * divergé le jour où l'une des deux a gagné le règlement.
 *
 * Les quatre surfaces de PRODUCTION — la clôture, la fiche du fournil, le
 * prévisionnel et le compteur de contrôle — lisent maintenant un seul fragment,
 * `planWhere()`, qui n'est que la traduction Prisma de {@link absorbedByPlan}.
 * Changer d'avis sur ce qui se fabrique tient en une ligne, ici.
 *
 * ⚠️ **Il y en avait une CINQUIÈME**, oubliée du rassemblement le jour même : le
 * **dossier du jour**, la liasse de bons qu'on tire une fois la journée arrêtée.
 * Elle n'a pas la même condition de STATUT — elle garde ce qui est déjà prêt ou
 * remis — et c'est ce qui l'avait fait passer pour étrangère à la règle. Elle ne
 * l'était que pour moitié : elle partage {@link settlementAllowsProduction}.
 *
 * ⚠️ **La file du COMPTOIR n'en fait pas partie**, et c'est un choix. Elle
 * montre ce qu'elle écarterait — une commande annulée y reste, « la seule façon
 * que l'équipe puisse dire à quelqu'un qui se présente pourquoi on ne lui donne
 * rien ». Le sort d'une commande refusée y dépend d'un courriel qui la prévient,
 * et ce courriel reste à écrire (2026-09-17).
 */
