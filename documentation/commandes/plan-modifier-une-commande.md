# Plan — modifier une commande passée

> **Doc-first, 2026-10-23.** Hugo : « on peut annuler mais pas modifier ».
> Décisions de Hugo du jour, reprises de
> [`architecture-commande-immuable-avenants.md`](architecture-commande-immuable-avenants.md) :
> le client modifie seul jusqu'à l'heure limite, le staff jusqu'à la
> préparation ; **tout** se modifie (quantités, articles, date, créneau, point
> de retrait, retrait ↔ livraison) ; une ligne déjà présente garde son prix
> d'origine, une ligne nouvelle prend le prix du jour ; le client voit **une
> seule commande, corrigée** ; après l'heure limite il **demande**, le staff
> commercial répond ; un retrait payé par carte se rembourse **à la remise**.
>
> Hugo a confié le reste à l'assistant (« tu trouves les meilleures solutions
> seul ») : chaque choix ci-dessous porte sa raison. Touche **l'argent** :
> contredit par `vitruve` avant d'être bâti (§9).

## 0. Ce qui existe (inventaire du 2026-10-23, chemins sous `apps/lfd-api/src/b2b/orders/`)

- **Aucune modification n'existe.** L'agrégat `Order` (`domain/entities/order.ts`)
  n'a que `draft()` (création), `payByCard`, `deferPayment`, `receiveOffPlan`.
  Le dépôt n'a que `place` (création) et des écritures d'état conditionnées.
  Aucune colonne de version sur `orders`.
- **La frontière de la préparation est déjà écrite**, par l'annulation :
  `cancellationOf` (`domain/services/order-cancellation.ts`) refuse dès que la
  commande n'est plus `placed` **ou** qu'elle est inscrite à une journée du
  fournil. L'inscription a lieu à la clôture de la journée
  (`on-production-day-closed.handler.ts` → `absorbIntoPlan`, statut
  `confirmed`).
- **Avant l'inscription, le fournil lit les commandes en direct**
  (`sited-day-orders.service.ts`, `producibleFor`) : il ne détient aucune copie
  à corriger. Le colisage ne voit une commande qu'après. La livraison, elle,
  rattache une commande à un transfert prévu ; son seul abonné à l'annulation
  (`delivery/application/handlers/detach-on-order-cancelled.handler.ts`) la
  détache.
- **Le bon PDF** est archivé sous une clé qui porte déjà une **révision**
  (`bon-de-commande-r<revision>-d<drawing>.pdf`), constante à 0 aujourd'hui
  (`domain/services/order-sheet.ts`).
- **La carte est débitée tout de suite** : l'intention Stripe est créée sans
  `capture_method`, donc capturée automatiquement
  (`b2b/payments/infrastructure/stripe-payment-gateway.ts`). Le
  remboursement est une demande persistée, exécutée après coup
  (`order-refund-request.ts`, `sweep-order-refunds`, `order-refund-dispatch.ts`).
- **La facture** lit les lignes figées de la commande au mois de sa
  livraison : une commande non livrée n'est sur aucune facture.
- **Le calcul de la passation** (prix, remise de retrait, frais, surtaxe, bon
  de fidélité, TVA) vit dans `order-drafting.service.ts` et `Order.draft()`,
  et ne sert qu'à la création.

## 1. Le choix central : une révision, pas un avenant

Le document d'août proposait des **avenants** (ajout, retrait, geste
commercial), chacun avec ses lignes et son règlement, la commande restant
figée. Hugo veut que le client voie **une seule commande corrigée**, et la
modification s'arrête **avant la préparation** — là où rien n'est encore
figé ailleurs.

**Choix : une modification produit une nouvelle RÉVISION de la commande.**
La commande garde son identifiant et son numéro ; ses lignes, son
acheminement et ses montants sont remplacés par ceux de la révision ; la
révision précédente est **conservée en entier** dans une table d'historique.

Pourquoi pas les avenants :

- tout ce qui lit une commande (fournil en direct, bon, facture, prélèvement,
  « Mes commandes », dossier de facturation) lit **une** commande ; des
  avenants obligeraient chacun à additionner commande + avenants — dix
  lecteurs à changer, et dix façons de se tromper ;
- la modification n'existe qu'avant la préparation : aucun four, aucun bac,
  aucune facture n'a encore consommé l'ancienne version ;
- l'historique reste complet et daté (qui, quand, quoi), ce qui était la vraie
  raison d'être des avenants.

Le **geste commercial après livraison** (l'avoir) reste un objet à part : c'est
le lot ZB de la facturation, pas une modification de commande.

## 2. Les règles

- **R1 — Qui et jusqu'à quand.** Le client : tant que la commande est
  `placed`, non inscrite, et **avant l'heure limite** de sa date
  d'acheminement (actuelle ET nouvelle si la date change), comme à la
  passation. Le staff : tant que la commande est `placed` et non inscrite,
  heure limite ignorée — la même frontière que l'annulation. **Les mêmes
  refus que l'annulation s'appliquent aux deux** (`cancellationOf`, vérifié le
  2026-10-23) : un remboursement en cours, et pour une commande au compte un
  engagement comptable (facturée, dans un lot de prélèvement, prélevée).
- **R2 — Ce qui se modifie.** Tout ce que la passation choisit : lignes et
  quantités, date d'acheminement, créneau, mode (retrait / livraison), point
  de retrait, adresse de livraison, note. Le payeur, la société et la
  clientèle ne changent pas.
- **R3 — Les prix.** Une ligne dont le SKU était dans la révision précédente
  garde son **prix unitaire figé** (et son taux de TVA), quelle que soit la
  quantité ; une ligne nouvelle est tarifée **au jour de la modification**,
  par le même chemin que la passation. Un SKU retiré puis remis dans une
  révision ultérieure est une ligne nouvelle : prix du jour. _(Raison : la
  règle de Hugo s'applique à « déjà présente » ; le plus simple vérifiable
  est la révision précédente.)_
- **R4 — Tout le reste se recalcule** comme à la passation, sur la nouvelle
  composition : remise de retrait (point, clientèle, exclusions), frais de
  livraison (zone), TVA, éligibilité figée par ligne. La **surtaxe tardive**
  est celle de la commande d'origine, inchangée : une modification n'en crée
  ni n'en retire. Le **bon de fidélité** déjà imputé reste imputé, borné au
  nouveau total (comme `voucherImputationCents`).
- **R5 — La journée du fournil.** Si la date change, la nouvelle journée doit
  être ouverte (`ensureDayOpen`), comme à la passation.
- **R6 — Une modification qui ne change rien est refusée** (message clair) :
  elle ne crée pas de révision vide.
- **R7 — Concurrence.** La modification porte la révision qu'elle corrige ; si
  elle a changé entre-temps, refus 409 « la commande a été modifiée ailleurs,
  rechargez ». Écriture conditionnée sur `revision` ET sur l'état (`placed`,
  non inscrite), sous le verrou de la journée comme l'annulation.

## 3. L'argent

| Règlement de la commande                           | Le total baisse                                                                  | Le total monte                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| Au compte (terme différé)                          | rien : la facture lira la révision                                               | rien : idem                              |
| Carte, **pas encore payée** (intention en attente) | l'intention est fermée et recréée au nouveau montant                             | idem                                     |
| Carte, **payée**                                   | une **demande de remboursement** de la différence, **différée à la remise** (R8) | un **complément** à payer par carte (R9) |
| Total nul                                          | rien                                                                             | comme une carte non payée                |

- **R8 — Rembourser à la remise** (décision de Hugo). La différence est
  enregistrée comme une demande de remboursement en attente, que la remise
  (`mark-order-fulfilled`) libère vers l'exécuteur existant. Plusieurs baisses
  s'additionnent ; une hausse ultérieure payée vient en déduction. Si la
  commande est annulée entre-temps, l'annulation rembourse ce qui a été payé
  et la demande différée disparaît (pas de double remboursement).
- **R9 — Le complément d'une carte payée.** _(Choix de l'assistant.)_ La
  révision qui fait monter le total d'une commande payée par carte est
  **appliquée tout de suite** et ouvre une intention de paiement pour la
  différence, payable par le même parcours que la passation (lien de
  paiement). Tant qu'il n'est pas payé, la commande est « complément à
  régler » : visible au client et au staff, et rappelée. _(Raison : retenir la
  modification en attente de paiement laisserait le fournil travailler sur
  l'ancienne version sans le dire ; l'appliquer et réclamer le complément
  suit ce que fait déjà une commande carte non payée.)_ Une baisse ultérieure
  réduit d'abord le complément non payé.
- **R10 — Le prélèvement** ne bouge pas : il suit la facture, qui lira la
  dernière révision.

## 4. Après l'heure limite : la demande

- Le client qui a passé l'heure limite (mais dont la commande n'est pas encore
  au plan) peut **demander** une modification : il compose la commande
  voulue comme il la modifierait, et l'envoie.
- La demande est une **demande client** de la boîte existante
  (`b2b/contact`, `CustomerRequest`), d'un nouveau type `order_change`, qui
  porte la composition demandée.
- Le **staff commercial** l'ouvre et **applique** (la modification se fait au
  nom du staff, R1 staff) ou **refuse** avec un mot. Le client est prévenu
  par courriel dans les deux cas.
- Une demande devenue impossible (commande inscrite au plan entre-temps) ne
  peut plus être appliquée : l'écran le dit.

## 5. Les autres blocs

- **Fournil** : rien à faire avant l'inscription — il lit en direct. Un fait
  durable `commerce.order_revised` est publié pour ceux qui gardent une trace
  (et pour le journal).
- **Livraison** : un abonné à `commerce.order_revised`, sur le modèle de
  `detach-on-order-cancelled` : si la commande quitte la livraison, change de
  date ou de point d'arrivée, elle est détachée du transfert prévu ; la
  composition suivante la reprend.
- **Colisage** : rien, il ne voit la commande qu'après l'inscription.
- **Bon PDF** : la révision monte, la clé d'archive aussi ; le nouveau bon est
  produit à la demande et joint au courriel de modification.
- **Journal** : un fait `order.revised` (auteur, révision, ce qui a changé en
  résumé, écart de total), ses libellés côté back-office (la clôture du
  journal l'exige).

## 6. Les écrans

- **Client, « Mes commandes »** : un bouton « Modifier » à côté
  d'« Annuler », visible quand la règle R1 client le permet (le serveur
  dit si c'est possible, comme `cancellable`). Il ouvre la commande dans le
  parcours du panier, prérempli, avec un devis qui montre l'écart (« + 4,20 € à
  régler » / « 3,10 € remboursés à la remise »). Après l'heure limite, le même
  bouton devient « Demander une modification ».
- **Staff, fiche commande** : « Modifier » à côté d'« Annuler », même
  condition que l'annulation ; même parcours que la saisie par l'équipe,
  prérempli. La boîte des demandes montre les `order_change` avec
  « Appliquer » / « Refuser ».
- **L'historique** des révisions se lit sur la fiche staff (qui, quand, écart).
  Le client ne voit que la commande actuelle (décision 4).

## 7. Les lots

| Lot    | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Bloc             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| **M1** | Révision côté serveur, commandes **au compte et à total nul** (§9) : table d'historique (migration additive), `revision` sur `orders`, calcul de la passation extrait pour servir aussi la révision, `Order.revise()`, règles R1-R7, R3 des prix, garde du fournil sous le verrou de journée et relecture à la clôture, fait `order.revised` et libellés, livraison (détacher, rattacher, géocoder), encaissement au compte recalculé, bon r+1. Commande `ReviseOrder` (client et staff), devis de révision. | serveur          |
| **M2** | **À concevoir** : l'argent d'une commande carte en plusieurs morceaux (§3, §9 points 2 à 5).                                                                                                                                                                                                                                                                                                                                                                                                                 | serveur          |
| **M3** | Écrans client et staff (§6), historique.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | fronts           |
| **M4** | La demande après l'heure limite (§4) : type `order_change`, appliquer / refuser, courriels.                                                                                                                                                                                                                                                                                                                                                                                                                  | serveur + fronts |

## 8. Ce qui n'est pas fait ici

- Modifier une commande inscrite au plan (après la clôture de la journée) :
  hors périmètre, comme l'annulation.
- Le geste commercial après livraison : l'avoir, lot ZB.

## 9. Contredit par `vitruve` (2026-10-23) — et ce qui change

Cinq objections bloquantes, toutes reprises. Ce qui suit **prime** sur les
sections au-dessus quand elles se contredisent.

1. **Le fournil a une copie, au moment de la clôture.** La clôture lit les
   commandes AVANT de prendre le verrou de la journée
   (`production/channels/commerce/order-withdrawal.desk.ts`) : une révision
   validée entre les deux serait inscrite dans son ancienne composition. Le §0
   et le §5 avaient tort. **Correction (M1)** : `orders.revision` est lu par le
   fournil avec la commande ; la révision passe, sous le verrou de la journée
   (des DEUX journées si la date change, dans l'ordre de leurs dates, la plus
   ancienne d'abord), par un geste du fournil sur le modèle de
   `OrderWithdrawalDesk` : il refuse si la commande est inscrite, et note la
   révision. Sous son verrou, la clôture compare la révision lue à la révision
   notée et **relit** la commande si elle a changé. Une révision n'est jamais
   inscrite dans une ancienne composition.
2. **Une seule demande de remboursement par commande**
   (`order-refund.prisma`, `orderId @id`), et `cancellationOf` refuse quand un
   remboursement est en vol.
3. **La facture d'une commande payée par carte** est acquittée du payé, et
   chaque remboursement porte un avoir : une baisse serait comptée deux fois.
4. **Une seule intention Stripe par commande** (`orders.stripe_payment_intent_id`),
   que `markPaid` et le remboursement lisent.
5. **Recréer l'intention d'une carte non payée** court contre le client qui
   paie l'ancienne page.

**Les points 2 à 5 sont tous la carte.** _(Choix de l'assistant.)_ **M1 ne
modifie pas une commande payable par carte** — payée, ou intention en
attente : refus clair, « commande réglée par carte : annulez-la et
recommandez, ou demandez au commerce ». M1 sert les commandes **au compte**
et **à total nul**, qui n'ont ni intention ni remboursement. **M2 devient une
conception à part** : l'argent d'une commande carte en plusieurs morceaux
(intentions et remboursements multiples, facture et avoirs) — c'est
exactement là que les avenants avaient l'avantage, et vitruve a raison de le
dire.

Les objections sérieuses, et leur réponse dans M1 :

- **Livraison** : à la passation, la commande est **rattachée** à un transfert
  (`AttachOnOrderPlaced`) et son adresse **géocodée** (`LocateOnOrderPlaced`).
  L'abonné à `commerce.order_revised` détache ET refait les deux, quand le
  mode, la date, le point ou l'adresse changent ; la feuille de départ lit la
  commande à jour.
- **Les déclencheurs `order_day_change`** surveillent `orders`, pas
  `order_lines` (justification datée : les lignes ne s'écrivaient qu'à la
  création). Chaque révision **met à jour `orders`** (au moins `revision`), ce
  qui marque l'ancien et le nouveau jour ; le commentaire de la migration et
  `test/day-change-triggers.e2e-spec.ts` sont mis à jour.
- **Les lignes** (`@@unique([orderId, sku])`) : remplacées en bloc dans la
  transaction de la révision. Ce n'est pas une suppression d'agrégat : la
  composition précédente est conservée **en entier** dans l'historique des
  révisions, qui seul fait foi du passé.
- **Le compte** : `order_collection.amount_cents` est recalculé dans la même
  transaction, par le port d'engagement comptable, et seulement si
  l'encaissement n'est pas engagé (sinon refus, comme l'annulation).
- **Le bon de fidélité** : M1 **refuse** une révision qui ferait passer le
  total sous le montant du bon imputé (« retirez moins d'articles, ou annulez
  et recommandez »). La restitution partielle d'un bon viendra si le besoin
  se présente.
- **Les points de fidélité** se calculent à la remise sur la commande telle
  qu'elle est alors : la dernière révision.
- **Le bon PDF** : la constante `REVISION_WITHOUT_AMENDMENTS` devient la
  révision de la commande ; la clé `r<n>` désigne désormais une révision.
  Choix assumé : il n'y aura pas d'avenants de commande.
