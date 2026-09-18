# TODO — annuler une commande

**Ouvert le 2026-09-17.** Le plan existe
([`plan-annulation-de-commande.md`](plan-annulation-de-commande.md)) et il a été
**contredit par `vitruve` le jour même : 4 BLOQUANT, 7 SÉRIEUX.** Rien n'est
bâti, et **rien ne se bâtit avant la refonte du plan**, qui attend quatre
décisions de Hugo (§3).

## 1. Ce qui est acquis

- **`cancelled` existe dans l'énuméré, et aucun chemin ne l'écrit** (vérifié le
  2026-09-17). Une commande ne peut pas être annulée aujourd'hui.
- **Décidé par Hugo** :
  - une commande s'annule **tant qu'elle n'est pas dans le plan de
    production** ;
  - une annulation ne va pas dans le plan de production du jour ;
  - un **courriel de confirmation d'annulation** part au client ;
  - **une route client et une route admin**, toutes deux **journalisées**
    (`order.cancelled`).
- **Tous les lecteurs savent déjà écarter une commande annulée** : plan du
  soir, dossier du jour, colisage, retrait, chiffre d'affaires, volumes du
  tarif, prélèvement, frise client (liste au §1 du plan).
- **L'expiration des commandes impayées** en dépend
  ([règlement, §4.1](architecture-reglement-et-compte-de-production.md)).

## 2. Ce qui ne tient pas dans le plan actuel

| #      | Le problème                                                                                                                                                                                                                                                                                                                 | La direction proposée                                                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** | **`placed` ne veut pas dire « pas encore au fournil ».** La clôture enregistre l'instantané du fournil PUIS le commerce passe `confirmed`, dans un abonné ; le retirage inscrit des `placed` sans rien publier ; un abonné tombé laisse des `placed` sur une journée close. Annuler là = fabriquer une commande remboursée. | Critère : **le fournil ne l'a pas inscrite**, lu chez lui par un port, et tenu contre la clôture et le retirage par un **verrou de journée**.                    |
| **B2** | Stripe échoue après l'écriture en base : intention vivante ou argent non rendu, le rejeu rend un succès, ni courriel ni journal.                                                                                                                                                                                            | L'argent à rendre devient un **état persisté**, écrit avec l'annulation ; le fait est publié tout de suite ; un écran **« à régulariser »** permet de reprendre. |
| **B3** | Le filet « payé alors qu'annulée → rembourser » tourne en tâche de fond, dont les échecs sont avalés ; le webhook ne rejouera plus.                                                                                                                                                                                         | Même réponse que B2 : pas de filet invisible, un état qu'on voit.                                                                                                |
| **B4** | Paiement en vol au moment d'annuler : double remboursement, état final `cancelled` + `paid`, et l'accusé « votre commande entre dans la fournée » part à une commande annulée.                                                                                                                                              | Croire Stripe : écrire `pending → paid` nous-mêmes avant de rembourser ; **tout accusé refuse une commande annulée**.                                            |
| **S1** | Un retrait au comptoir peut écraser une annulation (`markFulfilled` sans condition de statut).                                                                                                                                                                                                                              | `markFulfilled` conditionné sur `status <> cancelled`, test de course.                                                                                           |
| **S2** | Le mur client laisse **tout membre** d'une société annuler — et se faire rembourser — la commande d'un collègue.                                                                                                                                                                                                            | À trancher (§3).                                                                                                                                                 |
| **S3** | Stripe a plus de deux issues (`processing`, déjà annulée) ; aucune clé d'idempotence sur le remboursement.                                                                                                                                                                                                                  | Gérer `processing` ; clé `refund:<orderId>` ; rembourser le montant **encaissé**.                                                                                |
| **S5** | La croissance compte `order.placed` sans le soustraire ; aucune trace comptable du remboursement ; une commande au compte déjà prélevée ; un onglet ouvert casse sur `voided`.                                                                                                                                              | `refundedAt` + identifiant de remboursement ; refuser ou traiter à part le déjà-prélevé ; déployer les fronts avant `voided`.                                    |
| **S6** | Un invité sans identité de connexion ne peut pas annuler.                                                                                                                                                                                                                                                                   | Assumé en V1 : il passe par le formulaire de demande (`order.cancel` existe déjà), l'équipe annule.                                                              |
| **S7** | `ALTER TYPE … ADD VALUE` ne se retire pas.                                                                                                                                                                                                                                                                                  | Le dire ; `IF NOT EXISTS` ; ne pas utiliser `voided` dans la même migration.                                                                                     |

Le détail, fichier par fichier : §9 du plan.

## 3. À trancher par Hugo avant la refonte

1. **Le critère d'annulation.** « Le fournil ne l'a pas inscrite » (B1) : une
   commande prise par un retirage ne s'annule plus, même encore `placed`.
   D'accord ?
2. **Qui, dans une société, peut annuler** (S2) : tout membre, l'auteur seul,
   ou les rôles qui peuvent commander au nom de la société ?
3. **Le remboursement** : automatique, ou déclenché par l'équipe depuis l'écran
   « à régulariser » ? B2 et B3 rendent la seconde option moins coûteuse
   qu'elle n'en avait l'air.
4. **Une borne horaire** en plus du critère ? (question déjà ouverte au §5 du
   plan)

## 4. Ensuite

1. Refondre le plan sur les réponses du §3 et les directions du §2.
2. Le repasser à `vitruve` — il touche toujours à l'argent.
3. Réaligner le §4.1 du règlement (l'expiration) sur la forme retenue.
4. Bâtir par lots (plan, §4).
