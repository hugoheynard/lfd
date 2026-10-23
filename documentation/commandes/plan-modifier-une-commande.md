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

| Lot                                     | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Bloc             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| **M1** ✅ _bâti le 2026-10-23, cf. §10_ | Révision côté serveur, commandes **au compte et à total nul** (§9) : table d'historique (migration additive), `revision` sur `orders`, calcul de la passation extrait pour servir aussi la révision, `Order.revise()`, règles R1-R7, R3 des prix, garde du fournil sous le verrou de journée et relecture à la clôture, fait `order.revised` et libellés, livraison (détacher, rattacher, géocoder), encaissement au compte recalculé, bon r+1. Commande `ReviseOrder` (client et staff), devis de révision. | serveur          |
| **M2**                                  | **À concevoir** : l'argent d'une commande carte, [`plan-modifier-une-commande-payee-par-carte.md`](plan-modifier-une-commande-payee-par-carte.md), contredit le 2026-10-23, en attente d'une décision de Hugo.                                                                                                                                                                                                                                                                                               | serveur          |
| **M3**                                  | Écrans client et staff (§6), historique — back-office bâti le 2026-10-23, cf. §11 ; boutique bâtie le 2026-10-23, cf. §12 ; modificabilité, point et historique le 2026-10-23, cf. §13.                                                                                                                                                                                                                                                                                                                      | fronts           |
| **M4** ✅ _bâti le 2026-10-23, cf. §14_ | La demande après l'heure limite (§4) : type `order_change`, appliquer / refuser, courriels.                                                                                                                                                                                                                                                                                                                                                                                                                  | serveur + fronts |

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

## 10. M1 bâti (2026-10-23) — ce qui existe, et où il s'écarte du texte

Chemins sous `apps/lfd-api/src/` sauf mention.

- **Migration** `20261023100000_la_revision_de_commande` (additive) :
  `orders.revision` (défaut `0`), `orders.revised_at`, `public.order_revision`
  (une ligne par modification : composition remplacée EN ENTIER, telle
  qu'écrite, colonnes et lignes ; changements ; totaux avant/après ; auteur
  client ou fiche staff, tenu par un CHECK) et `production.order_revision_notice`.
- **Calcul partagé** : `b2b/orders/application/services/order-composition.service.ts`
  (prix, remise de retrait, frais de zone, éligibilité, acheminement convenu)
  et `order-cutoff-gate.service.ts` (heure limite), extraits d'`OrderDrafting`
  sans changer la passation ; `OrderDrafting` garde son contrat d'injection.
- **Agrégat** : `Order.revise()` / `Order.recompose()` (`domain/entities/order.ts`)
  et les règles pures de `domain/entities/order-revision.ts` — M1 (carte
  refusée), R3 (prix figés tenus), §9 bon imputé couvert, R6.
  `domain/services/revised-lines.ts` trie les lignes figées et nouvelles (R3).
- **Recomposition** : `application/services/order-revising.service.ts` — R1
  (frontière `cancellationOf`, heure limite ancienne ET nouvelle date pour le
  client, sans dérogation), R2 (payeur, principal, CGV, langue relus), R4,
  R5. Geste : `ReviseOrderCommand`/`ReviseOrderHandler` ; devis :
  `QuoteOrderRevisionQuery`/`…Handler`.
- **Routes** : `POST /orders/:id/revisions` et `…/revisions/quote` (client,
  mur de `GET /orders/:id`) ; `POST /admin/orders/:id/revisions` et
  `…/revisions/quote` (équipe). Contrats : `packages/contracts/src/order-revision.ts`.
- **Garde du fournil (§9.1)** : `production/channels/commerce/order-revision.desk.ts`
  (déclaré et implémenté par le fournil, relié par `ProductionDeskFeedModule`),
  `production/application/services/fresh-day-orders.ts` lu par la clôture ET
  le retirage.
- **Compte** : `AccountOrderRevaluation` (port de la commande) →
  `b2b/accounting/application/services/account-order-revaluing.ts` →
  `OrderCollection.revalue()` (ligne `due`/`excluded` seulement).
- **Faits** : `order.revised` (journal, `OnOrderRevised`, libellés du
  back-office) et `commerce.order_revised` (livraison :
  `ReconcileOnOrderRevised` réutilise `TransferMembership`,
  `LocateOnOrderRevised` réutilise `DayStopsLocator`, quand mode, date, point
  ou adresse changent).
- **Bon** : la révision de la commande et son instant (`OwnedOrder.revision`)
  remplacent `REVISION_WITHOUT_AMENDMENTS` ; la clé `r<n>` suit.
- **Tests** : domaine, application (doubles écrits à la main), et
  `apps/lfd-api/test/order-revision.e2e-spec.ts` (lignes, prix figé / du jour,
  retrait → livraison, refus carte, R7, heure limite client / équipe,
  inscrite, mur, course avec la clôture, devis).

Écarts et choix faits au bâti — à relire :

1. **La garde du fournil compare un repère par journée**, pas la révision de
   chaque commande : la clôture lit le plus grand numéro de note du jour
   AVANT les commandes et le relit SOUS le verrou ; s'il a bougé, elle relit
   les commandes. Même garantie, sans faire porter une révision à
   `ProducibleOrder` (une quarantaine de suites du fournil le construisent).
   Le retirage reçoit la même garde : il lit lui aussi avant son verrou.
   La relecture est la seule lecture du commerce faite sous le verrou d'une
   journée, et elle n'a lieu que dans ce cas.
2. **Droit de l'équipe** : `b2b_place_order:write` (la saisie pour un client),
   faute de droit nommé par le plan. Aucune migration de droit.
3. **Surtaxe tardive** (R4, « inchangée ») : son ajustement figé est
   réappliqué au nouveau sous-total — un pourcentage suit donc le panier ;
   aucune surtaxe n'est créée ni retirée.
4. **TVA du port** : recalculée selon le mode figé à la passation (V3), le
   réglage du jour seulement pour une commande d'avant le réglage.
5. **Refus ajoutés**, chacun avec sa phrase : une commande gratuite qui
   deviendrait payante (une carte, donc M2) ; une commande au compte qui
   tomberait à zéro (sa ligne d'encaissement ne sait se fermer que par
   l'annulation) ; un déplacement vers une journée dont le plan est arrêté,
   équipe comprise (pas de révision « hors plan »).
6. **Non fait** : le courriel de modification avec le nouveau bon joint
   (§5) — aucun lot ne le porte explicitement ; le bon r+1 se produit à la
   demande.

## 11. M3, back-office bâti (2026-10-23) — ce qui existe, et ce qui manque

Chemins sous `apps/lfd-backoffice-frontend/src/app/commandes/`. Non commité à
l'écriture de ces lignes.

- **Fiche commande** : `order-revise-action/` pose « Modifier la commande » à
  côté d'« Annuler » (`order-view.html`, slot `actions`). Absent sans
  `b2b_place_order:write` ; ouvert à la même condition que l'annulation
  (`cancellability`) ; désactivé sinon, la raison écrite seulement si le
  bouton d'annulation (absent sans son droit) ne l'écrit pas déjà.
- **Parcours** : route `commandes/:orderId/modifier` (pleine page, garde
  `b2b_place_order:write`), `modifier-commande/modifier-commande-page/`. Il
  réutilise la saisie par l'équipe — `SourceProduits`, `CartStore`,
  `DraftStore`, `AcheminementCommande`, `lfd-cart-row` —, préremplie par
  `apps/lfd-backoffice-frontend/src/app/commandes/modifier-commande/revision-draft.ts` (lignes au prix figé, mode, point,
  adresse, date, créneau, note). Sans interlocuteur ni règlement (R2).
- **Devis puis validation** : « Calculer le devis » (`…/revisions/quote`)
  montre total actuel, nouveau total, écart signé et ce qui change ; tout
  changement de la saisie efface le devis ; « Valider » envoie
  `expectedRevision` = la révision du devis. `409 stale_revision` : la phrase
  du serveur et « Relire la commande » ; tout autre refus : sa phrase. Après
  validation, retour à la fiche, qui se relit.
- **Contact et signature** ne se saisissent pas : renvoyés quand la commande
  les porte en `override`, omis sinon (le réglage se relit).
- **Historique** : déjà là. Le fait `order.revised` (auteur, instant,
  changements, totaux avant/après) s'affiche dans la carte « Historique » de
  la fiche (`order-history-card`), avec ses libellés posés en M1. Aucune
  route ne sert la **composition remplacée** (`public.order_revision`) : la
  montrer demanderait une lecture serveur (`GET /admin/orders/:id/revisions`)
  et son contrat — non inventés ici.

Ce qui manque côté serveur, relevé au bâti — les trois points sont faits le
2026-10-23 (§13), comme l'historique des compositions remplacées :

1. `OrderView` ne porte pas l'**identifiant du point de retrait**, seulement
   son adresse figée : le préremplissage le rapproche par rue + code postal.
   Point introuvable ⇒ présélection de la saisie, et le devis le dit
   (« Point de retrait » parmi les changements).
2. `AdminOrderView` ne porte pas la **révision courante** : l'écran la tient
   du devis, ce qui suffit à R7.
3. Les commandes réglées par carte ouvrent le parcours (même condition que
   l'annulation, §6) et le serveur les refuse au devis (§9, M1) avec sa
   phrase. Un `revisability` sur la vue permettrait de griser le bouton.

## 12. M3, boutique bâtie (2026-10-23) — ce qui existe, et ce qui manque

Chemins sous `apps/lfc-ecommerce-frontend/src/app/client/`.

- **Le tiroir** de « Mes commandes » (`mes-commandes/order-detail`) porte
  `order-revision/order-revise-section`, au-dessus de l'annulation : le lien
  « Modifier ma commande » pour une commande reçue (`placed`) au compte ou à
  total nul ; pour une commande carte, la phrase « annulez-la et recommandez,
  ou demandez-nous » à la place du bouton (choix : dire pourquoi plutôt que
  cacher).
- **L'écran** `/mes-commandes/modifier/:id` (`order-revision/order-revision-page`,
  chargé à la demande) : les lignes (quantité, corbeille, « prix d'origine »
  / « prix du jour » selon le devis), l'ajout d'un article de la boutique
  (`fold-combobox` en ajouteur), le retrait ou la livraison par les MÊMES
  dialogues que la boutique — `OrderDoors.askChoice` / `askTime` rendent un
  choix sans écrire celui du panier —, puis le devis (`revision-quote` :
  nouveau total TTC, total actuel, écart « + X € » / « − X € »). Chaque
  changement redemande le devis ; « Valider » envoie la révision du dernier
  devis ; un 409 `orders.revise.stale_revision` propose de recharger ; tout
  refus se dit par la phrase du serveur. Après validation, retour au tiroir de
  la commande, relu au serveur.
- **Le panier envoyé** (`apps/lfc-ecommerce-frontend/src/app/client/order-revision/revision-draft.ts`) réutilise
  `serviceContentOf` (extrait de la passation, `client-orders.service.ts`) ;
  la note, le contact et la signature figés repartent tels quels tant que le
  mode et l'adresse livrée ne changent pas (R6).
- **Textes** : `orders.revision.*` (fr/en/it) dans `copy/screens/orders.copy.ts`,
  libellés au glossaire du back-office (`apps/lfd-backoffice-frontend/src/app/textes-boutique/rules/glossary/glossary-order-revision.ts`).

Ce que la vue client ne dit pas, et que l'écran contourne — les points 1 et 2
sont faits le 2026-10-23 (§13) :

1. **`CustomerOrderView` ne dit pas si la commande se modifie** (ni
   `revisability` comme `cancellability`, ni `revision`). Le bouton du tiroir
   est donc une indication (statut reçu + régime) ; l'heure limite,
   l'inscription au plan et la comptabilité ne se disent qu'à l'ouverture de
   l'écran, par le refus du premier devis.
2. **`CustomerOrderView` ne porte pas `pickupAddressId`**, seulement l'adresse
   figée du point. L'écran retrouve le point parmi ceux servis par son adresse
   exacte, s'il est seul ; sinon il demande de le choisir. Un champ
   `pickupAddressId` dans la vue client supprimerait ce rapprochement.
3. **« Demander une modification » après l'heure limite** (§6) appartient à M4 :
   l'écran affiche le refus du devis, sans bouton de demande.

## 13. Suite de M3 (2026-10-23) — la vue dit si la commande se modifie, l'historique se lit

Ce qui manquait aux §11 et §12, bâti le 2026-10-23 (non commité à l'écriture
de ces lignes). Chemins sous `apps/lfd-api/src/b2b/orders/` pour le serveur.

- **Modificabilité, par la règle du geste** : `domain/services/order-revisability.ts`
  (pur) — la frontière commune (`standingBlockOf` : blocage de l'annulation,
  carte, CGV figées) que `OrderRevising.ensureRevisable` lève désormais, puis
  pour le client l'arrêt du plan et l'heure limite de la date actuelle
  (`OrderCutoffGate.decide`, la même `decideStrictestOrderCutoff` que le
  refus, sans dérogation). `OrderRevising.revisabilityOf` l'assemble ;
  `application/services/order-revisability-reading.ts` y ajoute le jour
  d'inscription lu au fournil (`OrderInscriptionReader`).
- **Vues** : `CustomerOrderDetailView.revisability` (`OrderRevisability` :
  `revisable` + `until`, ou un code `ORDER_REVISION_REFUSALS` et l'échéance
  passée pour `too_late`) et `.revision`, par `GetOrderRevisabilityQuery`
  derrière `RevisionWall` ; `AdminOrderView.revisability`
  (`AdminOrderRevisability` : la phrase du serveur) et `.revision`.
- **`pickupAddressId`** sur `OrderView` et `CustomerOrderView` : le `siteId`
  figé dans le snapshot du point depuis le lot S2 (`siteIdOf`) — il existait
  déjà en base. `null` en livraison et pour une commande d'avant S2. Les deux
  `revision-draft.ts` le reprennent ; plus aucun rapprochement du point par
  l'adresse (l'adresse livrée du back-office se rapproche encore du carnet).
- **Historique** : `GET /admin/orders/:id/revisions` (`b2b_orders:read`, le
  droit de la fiche), `ListOrderRevisionsQuery`, port de lecture
  `OrderRevisionHistoryReader` (séparé du port d'écriture), adaptateur
  `infrastructure/prisma-order-revision-history.reader.ts` (composition
  validée par zod, `null` si illisible ; client nommé par sa fiche, équipe par
  l'annuaire du staff). Contrat : `packages/contracts/src/order-revision-history.ts`.
- **Boutique** : `order-revise-section` relit `GET /orders/:id` à l'ouverture
  du tiroir et dit le bouton (avec « Modifiable jusqu'au … »), ou la phrase du
  code (`order-revision/revision-wording.ts`, textes `orders.revision.refused*`).
- **Back-office** : `order-revise-action` lit `revisability` (bouton grisé
  avec la raison ; tue quand l'annulation, bloquée elle aussi, la dit déjà) ;
  carte `commandes/order-revisions-card/` « Versions précédentes », posée
  quand `revision > 0`, la composition remplacée dans un `fold-disclosure`.
- **Tests** : domaine (`order-revisability.spec.ts`), application
  (`get-order-revisability`, `list-order-revisions`, détail staff), e2e
  `apps/lfd-api/test/order-revision-views.e2e-spec.ts`, specs des composants.

Reste : le tiroir de la boutique lit `GET /orders/:id` deux fois (annulation
et modification), une lecture partagée l'éviterait. « Demander une
modification » après l'heure limite : bâti, §14.

## 14. M4 bâti (2026-10-23) — la demande après l'heure limite

Non commité à l'écriture de ces lignes. Chemins sous `apps/lfd-api/src/b2b/contact/`
pour le serveur.

- **Migrations** (additives) : `20261023220000_la_demande_de_modification_type`
  (la valeur `order_change` de `RequestKind`, seule : une valeur d'enum ne
  s'emploie pas dans la transaction qui l'ajoute) et
  `20261023220100_la_demande_de_modification` — `customer_request.change_base_revision`,
  `change_content` (JSON, le corps d'une révision), `change_applied_revision`,
  `change_refusal` ; deux CHECK (colonnes réservées au type, forme et réponse
  unique) ; un index unique partiel : **une seule demande en attente par
  commande**. Registre RGPD : `change_content` et `change_refusal` purgés à
  l'anonymisation, les deux révisions en exclusion.
- **Contrat** : `orderChangeRequestPayloadSchema` = `{ change, message }`, où
  `change` est **exactement** `orderRevisionPayloadSchema` (la commande voulue
  et la révision sur laquelle elle a été composée) ; la composition rangée se
  relit par `orderRevisionQuotePayloadSchema` (illisible → `null`, « Appliquer »
  refuse). `OrderChangeDetailsView`, `OrderChangeRequestStatusView`,
  `orderChangeRefusalPayloadSchema` (`packages/contracts/src/contact*.ts`).
- **Agrégat** : `CustomerRequest.orderChange()`, `pendingOrderChange()`,
  `recordChangeApplied()`, `refuseChange()` (mot obligatoire) ;
  `markHandled()` **refuse** une demande de modification — le client attend
  une réponse. Anonymisée : commande, composition et mot du refus vidés.
- **Demander** (`POST /me/orders/:id/change-request`, débit 3 / 10 min par
  compte) : `RequestOrderChangeHandler` — mur et règle de la commande par
  `ChangeableOrderReader` (adaptateur : la règle d'accès du signalement + la
  requête `GetOrderRevisabilityQuery` par le bus) ; **seul `too_late` est
  admis** (modifiable → « utilisez Modifier ma commande » ; close → « nous
  écrire ») ; révision vue = révision courante ; une seule en attente ; le
  motif est le premier motif `order_change` proposé à ce public, par rang.
  Fait `order.change_requested`, courriel à l'équipe et cloche comme toute
  demande. Lecture : `GET /me/orders/:id/change-request` (la dernière).
- **Répondre** (`/admin/customer-requests/:id/order-change/{quote,apply,refuse}`,
  `b2b_contact`) : le devis est `QuoteOrderRevisionQuery` au nom de l'équipe ;
  **appliquer est `ReviseOrderCommand` au nom de l'équipe** (port
  `OrderChangeApplier`, par le bus), sur la révision de départ — elle rejuge
  tout (inscrite, R7, carte…) et son refus remonte avec sa phrase, la demande
  restant en attente. Faits `order.change_applied` / `order.change_refused`,
  libellés du journal (`contact-phrases.ts`).
- **Boutique** : le tiroir (`order-revise-section`) propose « Demander une
  modification » après l'heure limite, dit « en attente », puis la réponse ;
  l'écran de modification, en mode demande, ne demande pas de devis et envoie
  par `change-request-card/`. Textes `orders.revision.request.*`
  (`apps/lfc-ecommerce-frontend/src/app/client/copy/screens/order-change-request.copy.ts`).
- **Back-office** : un onglet de motifs « Demander une modification » (par
  `REQUEST_KINDS`), un filtre de type, `demandes/order-change-details/` (l'écart
  du devis, la phrase du refus à la place quand la commande ne se modifie
  plus, « Appliquer » / « Refuser… » avec un mot) ; « Marquer traité » n'est
  pas proposé à ce type.
- **Tests** : domaine (`apps/lfd-api/src/b2b/contact/domain/__tests__/order-change-request.spec.ts`), application (demander,
  appliquer, refuser, lectures — doubles écrits à la main), e2e
  `apps/lfd-api/test/order-change-request.e2e-spec.ts`, specs des composants.

Écarts et choix faits au bâti — à relire :

1. **Une seule transaction pour « Appliquer »** : la ligne de la demande est
   verrouillée, la révision (qui rejoint l'unité de travail) et la réponse
   partent ensemble. La recomposition de la révision tient donc la
   transaction le temps de ses lectures — un geste rare, à la main ; en
   échange, jamais de commande modifiée sous une demande « en attente ».
2. ~~**Pas de devis côté client** après l'heure limite.~~ **Revu le
   2026-10-23, décision de Hugo : « oui montre le nouveau total au client ».**
   `POST /orders/:id/revisions/change-request-quote` (`QuoteOrderChangeRequestQuery`,
   `apps/lfd-api/src/b2b/orders/application/queries/`) : le mur du client
   (`RevisionWall`, hors mur → `404`), puis LA règle de la modification lue
   pour le client — la même que `ChangeableOrderReader` réduit pour
   `RequestOrderChange` : seul `past_cutoff` (« trop tard ») est admis ;
   encore modifiable ou au plan → `409` `orders.change_quote.*`, blocage
   commun (carte, engagée, inscrite…) → l'erreur du geste, avec sa phrase.
   Puis la MÊME recomposition (`OrderRevising.compose`, option `rulesOf:
"staff"`) : prix d'origine pour une ligne déjà présente, prix du jour pour
   une nouvelle, aux règles de l'équipe parce que c'est elle qui appliquera.
   Rien n'est écrit, et **la demande ne range toujours aucun montant** :
   l'équipe recalcule à l'application. La boutique montre le nouveau total et
   l'écart dans `change-request-card/`, marqués indicatifs
   (`orders.revision.request.requestQuoteIndicative`, fr/en/it). Le courriel
   de réponse, lui, ne porte toujours pas de montant.
3. **Mise en service** : sans motif `order_change` actif, la demande est
   refusée avec une phrase qui dit à l'équipe quoi créer (Demandes clients ›
   Motifs › « Demander une modification »). Aucun motif n'est semé par
   migration (son adresse de destination est un choix).
4. **Les courriels** au client (`customer.order-change-applied` /
   `…-refused`, langue de repli, abonnés en mémoire comme le courriel d'une
   demande) : textes fr/en/it en famille à part (`copy/*/order-change-mails.*.ts`),
   rendu `order-change-answer-mail.ts`, sections, exemples, empreintes de
   rendu (cas neufs) — le registre compte désormais 30 e-mails.
