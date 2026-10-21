# Le réassort des boutiques

> **État : 🟡 partiel, 2026-10-21.** La **réception** au comptoir est bâtie
> (commit `558b376c8`), et se fait en **un geste par réassort** depuis le lot
> R2 (2026-10-21) ; la **commande** au fournil aussi (lot R1, 2026-10-21),
> mais le fournil ne fait encore que la LIRE : elle n'entre ni au plan figé, ni
> au colisage, ni au transfert (R3). Les **ruptures et stocks faibles** du
> comptoir aussi (lot R1b, 2026-10-21), sans effet encore sur la boutique. La
> **demande en cours** est enregistrée depuis le lot R1c (2026-10-21). Le
> **fournil envoie ses propres réassorts**, à part, depuis le lot R1d
> (2026-10-21). L'écran du comptoir est **une table de tous les produits**
> depuis le lot R1e (2026-10-21). Ce document décrit ce qui existe, vérifié
> dans le code le 2026-10-21. La conception
> complète, lots et questions ouvertes compris, est dans
> [`plan-reapprovisionnement.md`](plan-reapprovisionnement.md).

Le réassort, c'est ce qu'une vitrine (un point de retrait approvisionné) reçoit
du fournil pour vendre au comptoir dans la journée.

## Le modèle : B, un `SiteResupply` à part

Décidé par Hugo le 2026-10-21. Le réassort d'un site n'est **jamais une
commande** : il ne porte ni prix, ni TVA, ni chiffre d'affaires. C'est un
agrégat à part, `SiteResupply`, qui demandera au fournil ; ce qui arrive en
vitrine est un second agrégat, la **réception**, parce que demander et
recevoir ont deux auteurs et deux moments — ce qui arrive n'est pas toujours
ce qui a été demandé, et le comptoir corrige ce qu'il voit.

Les deux existent depuis le 2026-10-21, liés depuis le lot R2 : un réassort
envoyé attend son reçu, pré-rempli de la quantité demandée.

## Ce qui est bâti : commander le réassort (lot R1, 2026-10-21)

```mermaid
flowchart LR
  C["Comptoir › Réassort<br/>(point du bandeau)<br/>« Pour demain » / « Au plus tôt »"] --> S["SiteResupply<br/>placé → annulé"]
  S --> F["Fournil › Réassorts à produire<br/>(lecture : par jour, par point, cumul)"]
  S -.->|"R3, non bâti"| P["plan figé · colisage · transfert"]
```

- **Le code** : `apps/lfd-api/src/b2b/resupply/`, à côté de la réception.
  L'agrégat `SiteResupply` (`apps/lfd-api/src/b2b/resupply/domain/site-resupply.ts`) : un point, une
  **visée** — `tomorrow` (le soir pour demain, journée = demain) ou `asap`
  (« au plus tôt », journée = aujourd'hui), journée déduite de l'instant du
  geste à l'heure de Paris, jamais saisie —, des lignes (SKU, libellé figé du
  catalogue publié, quantité entière > 0, un article une fois, au moins une),
  l'état brouillon → passé → annulé, l'auteur et l'instant de chaque geste.
  Aucun prix, aucune dépendance à `Order`.
- **La demande en cours** (lot R1c, 2026-10-21) : le brouillon se
  persiste — voir la section suivante. `PlaceSiteResupplyHandler`, le geste
  d'un seul tenant de R1, passe désormais par elle.
- **L'heure limite** (révisée au lot R3a, 2026-10-21) : `place()` refuse une
  visée `tomorrow` après **l'heure du réassort** (« la veille, HH:MM »,
  `order_cutoff_settings.resupply_cutoff_time`, 20:00 par défaut ; borne
  incluse), ou sur un plan déjà arrêté. `asap` n'en a jamais. Lue par le port
  `ResupplyCutoff` (`apps/lfd-api/src/b2b/resupply/infrastructure/settings-resupply-cutoff.ts`).
  L'ancien interrupteur `resupply_subject_to_cutoff` reste en base, mort.
- **Le plan figé** (lot R3a) : l'envoi et l'annulation « pour demain » passent
  par le guichet d'admission du plan sous le verrou de la journée
  (`ResupplyPlanGate`) ; l'arrêt du fournil fige les réassorts envoyés
  (`DayResuppliesReader`, implémenté par `ProductionDayResupplies`) et les
  compte au total. Détail : [`../production/arret-du-plan.md`](../production/arret-du-plan.md).
- **Annuler** : un réassort passé s'annule, une fois — sauf réceptionné (R1d)
  ou, pour demain, figé dans un plan arrêté (R3a, 409 « réceptionnez avec un
  écart »). Une annulation est un état, jamais une suppression.
- **Réassorts à produire** : depuis R3a, un « pour demain » d'un plan arrêté
  n'y est plus (il est dans la feuille du fournil).
- **Les tables** : `site_resupply` et `site_resupply_line` (unique par
  réassort et SKU, quantité > 0 en CHECK), schéma `public`, migration
  `20261021170000_le_reassort_commande_par_un_point` (additive), puis
  `20261021210000_la_demande_de_reassort_en_cours` (R1c, additive).
- **Les routes** : `admin/site-resupplies/sites/:siteId` sous
  `handover_counter` — lecture (les réassorts du point pour aujourd'hui et
  demain, et jusqu'à quand « Pour demain » passe), écriture (passer,
  `…/:resupplyId/cancel`) ; depuis R1c, les gestes de la demande en cours
  (section suivante). Le point est dans chaque `where` : un réassort
  d'un autre point est introuvable (404).
  `admin/site-resupplies/to-produce` sous `production_worksheet:read` **ou**
  `production_plan:read` : aujourd'hui puis demain, par point, les réassorts
  passés et le cumul par article.
- **Les écrans** : au comptoir, la carte « Commander au fournil »
  (`comptoir/reassort-boutique-page/resupply-order-card/`) au-dessus de la
  réception, qui n'a pas changé ; au fournil, **Réassorts à produire**
  (`production/reassorts-a-produire/`, route `/reassorts-a-produire`, au rail
  et aux tuiles sous le Fournil), en lecture, distinct des commandes client.
- **Pourquoi pas de canal du fournil en R1** : l'écran du fournil lit la route
  du commerce depuis le navigateur ; aucun bloc serveur ne traverse
  (`production → b2b` reste interdit). Le canal viendra quand le réassort
  entrera au plan figé (R3).

## Ce qui est bâti : la demande en cours, enregistrée (lot R1c, 2026-10-21)

```mermaid
flowchart LR
  A["Comptoir (n'importe quel poste)<br/>« Ajouter à la demande »<br/>ou une alerte : « Ajouter à la demande au plus tôt »"] --> D["SiteResupply en brouillon<br/>une par (point, visée, journée)"]
  D -->|"corriger · retirer<br/>(version vue)"| D
  D -->|"« Envoyer le réassort »"| S["SiteResupply envoyé"]
  S --> F["Fournil › Réassorts à produire"]
  S -.->|"prochain ajout"| N["nouvelle demande en cours"]
```

- **Le modèle** : la demande en cours est l'état `draft` de `SiteResupply`,
  persisté. Une seule par (point, visée, journée) : index unique PARTIEL
  `site_resupply_open_draft_key (site_id, target, service_day) WHERE
placed_at IS NULL` ; deux postes qui l'ouvrent au même instant, le second
  est refusé en 409 (`resupply.order.draft_opened_meanwhile`) et refait son
  geste. Les colonnes `placed_*` sont nullables depuis la migration
  `20261021210000_la_demande_de_reassort_en_cours` (CHECK : un envoi est
  entier ; seul un réassort envoyé s'annule).
- **Les gestes** : ajouter (`addLine`) — un article déjà présent voit sa
  quantité **s'additionner** ; corriger (`correctLine`, entier ≥ 1) ;
  retirer (`withdrawLine`, la demande peut rester vide) ; envoyer
  (`place`, les règles de R1 : heure limite pour « pour demain » si le
  réassort y est soumis). Une demande vide ne part pas (400).
- **Le verrou de version** : corriger, retirer et envoyer portent la
  version que le poste a vue ; un poste qui ne l'a plus est refusé en 409
  (`resupply.order.changed_meanwhile`) plutôt que d'écraser l'autre. Ajouter
  n'en porte pas : deux ajouts se cumulent, ils ne s'écrasent jamais.
- **Une journée passée** : une demande « pour demain » restée sans envoi
  garde sa journée. Le matin de cette journée, elle s'affiche encore et
  part si l'heure limite ne s'y oppose pas ; une fois la journée passée,
  elle **quitte l'écran** (le comptoir ne lit que aujourd'hui et demain) et
  son envoi est refusé (409, `resupply.order.day_passed`). Elle reste en
  base, jamais supprimée ; le prochain ajout ouvre la demande de la journée
  en cours, à côté. Même règle pour « au plus tôt » de la veille.
- **Les routes**, sous `admin/site-resupplies/sites/:siteId`,
  `handover_counter:write` : `POST drafts/:target/lines` (ajouter),
  `PATCH :resupplyId/lines/:sku` (corriger), `POST
:resupplyId/lines/:sku/withdraw` (retirer), `POST :resupplyId/send`
  (envoyer). La lecture sert `drafts` à côté de `resupplies` (envoyés).
- **Le `POST :siteId` de R1 est retiré** (lot R1d, 2026-10-21) : il
  ajoutait ses lignes à la demande « au plus tôt » DU COMPTOIR et l'envoyait
  entière ; son seul appelant, le bouton « Lancer un réassort au plus tôt »
  du fournil, est retiré avec lui.
- **L'écran** : la carte « Commander au fournil » montre la demande en
  cours de chaque visée, quantités corrigibles, « Envoyer le réassort » ;
  elle relit après chaque geste, toutes les 15 s onglet visible, et dès
  qu'on revient sur l'onglet (`refreshWhileVisible`). L'état est partagé par
  `SiteResuppliesStore` (fourni par la page) avec la proposition « Ajouter à
  la demande au plus tôt » de chaque alerte de stock
  (`comptoir/reassort-boutique-page/asap-draft-adder/`).
- **Le fournil ne voit jamais une demande non envoyée.**

## Ce qui est bâti : rupture et stock faible au comptoir (lot R1b, 2026-10-21)

```mermaid
flowchart LR
  C["Comptoir › Réassort<br/>« Rupture » / « Stock faible »<br/>(une ligne reçue ou le catalogue)"] --> A["StockAlert<br/>vivante → levée"]
  A --> F["Fournil › Réassorts à produire<br/>« Village : rupture — Croissant »<br/>(pour information)"]
  R["« Réceptionner » un réassort, ou une ligne<br/>sans commande, de l'article au point"] -->|"même transaction"| A
  C -->|"« Lever »"| A
```

- **Le code** : `apps/lfd-api/src/b2b/resupply/domain/stock-alert.ts`. Une
  alerte par (point, SKU) : niveau `out_of_stock` (rupture) ou `low` (stock
  faible), libellé figé du catalogue publié, auteur et instant de la DERNIÈRE
  déclaration. Redéclarer l'alerte vivante change son niveau (le handler la
  recharge plutôt que d'en ouvrir une seconde). Une alerte levée ne se rouvre
  ni ne se relève : on en déclare une nouvelle.
- **Sa durée** : aucune échéance. Elle tient jusqu'à ce que le comptoir la
  lève (`manual`) ou qu'une ligne de l'article soit reçue au point avec une
  quantité > 0 (`receipt`) — jamais d'elle-même le lendemain.
- **La levée par la réception** : `liftStockAlertOnReceipt`
  (`apps/lfd-api/src/b2b/resupply/application/lift-stock-alert-on-receipt.ts`), appelé dans
  l'unité de travail de la réception par `ReceiveSiteResupplyHandler`
  (« Réceptionner », une fois par ligne reçue > 0, lot R2) et par
  `ReceiveResupplyLineHandler` (le réassort sans commande). C'est le seul
  chemin. Corriger ou retirer une ligne ne lève rien.
- **La table** : `site_stock_alert`, schéma `public`, migration
  `20261021190000_les_alertes_de_stock_du_comptoir` (additive). Index unique
  PARTIEL `(site_id, sku) WHERE lifted_at IS NULL` : une seule alerte vivante,
  la course entre deux postes est refusée en 409. Pas de suppression : une
  levée garde qui, quand et pourquoi (`lift_reason`).
- **Les routes** : `admin/site-stock-alerts/sites/:siteId` sous
  `handover_counter` — lecture (les alertes vivantes du point), déclarer
  (`POST`, `{ sku, level }`), lever (`…/:alertId/lift`) ; le point est dans
  chaque `where`. `admin/site-stock-alerts/live` sous
  `production_worksheet:read` **ou** `production_plan:read` : les alertes
  vivantes de tous les points.
- **Les écrans** : au comptoir, la carte « Ruptures et stocks faibles » en
  tête de la page Réassort (`comptoir/reassort-boutique-page/stock-alerts-card/`),
  et les gestes sur chaque ligne reçue ; au fournil, « Alertes des points » en
  tête de « Réassorts à produire »
  (`production/reassorts-a-produire/live-stock-alerts-card/`), **pour
  information** depuis le lot R1d : le bouton « Lancer un réassort au plus
  tôt », qui envoyait la demande du comptoir, est retiré. Pour répondre, le
  fournil envoie son propre réassort (section suivante).
- **Aucun effet sur la boutique ni sur la passation** : une rupture ne bloque
  encore rien, un stock faible n'avertit aucun client (lot J2). L'écran du
  comptoir le dit.

## Ce qui est bâti : le fournil envoie un réassort (lot R1d, 2026-10-21)

« Je t'envoie ça » — quand un point le demande au téléphone, le fournil
entre la demande lui-même, à part de celle du comptoir.

```mermaid
flowchart LR
  F["Fournil › Réassorts à produire<br/>« Envoyer un réassort »<br/>point · visée · articles"] -->|"production_resupply:write"| S["SiteResupply<br/>origin = bakehouse<br/>créé ET envoyé"]
  D["Demande en cours du comptoir<br/>origin = counter, brouillon"] -.->|"jamais touchée"| S
  S --> R["Comptoir › Réceptionner les réassorts<br/>« Envoyé par le fournil »"]
```

- **L'origine** : `SiteResupply.origin` — `counter` (le comptoir, par sa
  demande en cours) ou `bakehouse` (le fournil). `SiteResupply.sentByBakehouse`
  crée le réassort avec ses lignes (un article donné deux fois s'additionne)
  et l'envoie d'un geste, avec les règles du comptoir : au moins une ligne,
  libellés lus au catalogue publié, l'heure limite de sa journée pour « pour
  demain » si le réassort y est soumis, jamais pour « au plus tôt ». Il n'a
  jamais de brouillon : `SendBakehouseResupplyHandler` ne consulte pas la
  demande en cours.
- **La table** : `site_resupply.origin` (`TEXT NOT NULL DEFAULT 'counter'`),
  migration additive `20261022000100_l_origine_du_reassort` ; CHECK
  `site_resupply_origin_known` et `site_resupply_bakehouse_placed` (un
  réassort du fournil a toujours un `placed_at`). L'index unique partiel des
  demandes en cours (`WHERE placed_at IS NULL`) ne change pas : un réassort
  du fournil n'y entre jamais.
- **Le droit** : `production_resupply` (« Production — Envoi de réassort »),
  ajouté à `StaffResource` par `20261022000000_le_droit_du_reassort_du_fournil`
  sans être accordé à personne ; il s'accorde à l'écran des rôles (la graine
  le donne au seul administrateur). Distinct de `handover_counter` : ni le
  comptoir ni la fournée n'envoient au nom du fournil.
- **Les routes** : `admin/bakehouse-resupplies` sous `production_resupply` —
  `GET articles` (le catalogue publié, `:read`) et `POST sites/:siteId`
  (`{ target, lines }`, `:write`, rend `{ id }`). Les points proposés se
  lisent sur `GET /admin/pickup-addresses`, ouvert à
  `production_resupply:read`.
- **Les écrans** : au fournil, la carte « Envoyer un réassort »
  (`production/reassorts-a-produire/bakehouse-resupply-card/`), composée à
  l'écran puis envoyée, sous `production_resupply:write` ; dans la liste du
  jour, « Envoyé par le fournil ». Au comptoir, la carte « Réceptionner les
  réassorts » le marque de même ; il se réceptionne en un geste comme les
  autres, et le comptoir peut l'annuler tant qu'il n'est pas réceptionné.

## Ce qui est bâti : la réception au comptoir (refaite au lot R2, 2026-10-21)

```mermaid
flowchart LR
  S["SiteResupply envoyé<br/>(pour la journée)"] --> E["Reçu attendu<br/>attendu = quantité demandée"]
  E -->|"« Réceptionner » (un geste)"| R["Reçu réceptionné<br/>reçu = attendu"]
  R -->|"un écart, par ligne"| R
  U["Réassort sans commande<br/>(saisie ligne par ligne)"] --> T
  R --> T["Stock estimé du jour<br/>= somme des reçus"]
```

Décisions de Hugo (2026-10-21) : « personne ne fera du ligne par ligne en
plein service » ; un reçu par réassort ; la saisie de secours devient un
« réassort sans commande » ; le stock du jour additionne les reçus.

- **Le code** : `apps/lfd-api/src/b2b/resupply/`. L'agrégat
  `ResupplyReceipt` (`domain/resupply-receipt.ts`) a deux sortes, un seul
  modèle — la règle qui compte au stock est la même (seul le reçu compte) :
  - **le reçu d'un réassort envoyé** (`resupplyId`) : `expecting` le fait
    naître attendu des lignes du réassort (attendu = quantité DEMANDÉE ; R3 y
    mettra la quantité emballée), `receiveAll` recopie l'attendu en reçu, d'un
    geste. Une ligne ne se corrige (`correct`) qu'**après** ; on n'y ajoute ni
    n'en retire d'article. Un second « Réceptionner » est refusé (409), il
    n'est jamais rejoué en silence. Seul un réassort envoyé et non annulé se
    réceptionne, et pas avant sa journée à l'heure de Paris (409
    `resupply.receipt.day_not_yet_come`, lot R1d) ;
  - **le réassort sans commande** (`resupplyId` nul) : `receive`, `correct`,
    `withdraw`, ligne par ligne, chaque ligne reçue dès sa saisie ; un même
    article deux fois est refusé (« corrigez sa quantité »).
- **Le reçu n'est écrit qu'une fois reçu** : avant « Réceptionner », l'attendu
  se lit du réassort lui-même. Le stock ne monte qu'à la réception, jamais à
  l'envoi.
- **Un réassort réceptionné ne s'annule plus** (lot R1d) : l'annulation lit
  sa réception par le port `ResupplyReceptions` et `SiteResupply.cancel` la
  refuse (409 `resupply.order.already_received`, « déjà réceptionné par X à
  HH:MM »).
- **Le verrou optimiste** : un reçu porte une `version` ; deux postes qui
  corrigent en même temps font refuser le second
  (`ResupplyReceiptChangedMeanwhileError`).
- **Les tables** : `resupply_receipt` (`resupply_id` unique et clé vers
  `site_resupply` ; au plus un sans commande par (point, journée), index
  unique partiel `resupply_receipt_unordered_key` ; `received_*` : le geste)
  et `resupply_receipt_line` (`expected_quantity` nul sans commande,
  `quantity` = le reçu), schéma `public`. Migration
  `20261021230000_un_recu_par_reassort`, **non additive** (elle retire
  l'unicité (site, journée) d'une table jamais déployée).
- **Les routes** : `admin/resupply-receipts` sous `handover_counter` —
  lecture `:read` (`GET :siteId/:day` : les réassorts envoyés de la journée
  avec leur réception, le sans commande, le stock), écriture `:write` :
  `POST :siteId/resupplies/:resupplyId/receive` (« Réceptionner »),
  `PATCH :siteId/resupplies/:resupplyId/lines/:sku` (un écart),
  `POST|PATCH|DELETE :siteId/:day/lines…` (le sans commande). Le point est
  dans chaque `where` : un réassort d'un autre point est introuvable (404).
- **L'écran** (refait au lot R1e, 2026-10-21, « pense comptoir, un clic ») :
  `apps/lfd-backoffice-frontend/src/app/comptoir/reassort-boutique-page/`,
  pour le point et la journée du bandeau, sans titre propre (l'onglet le
  dit). En tête, seulement s'il y en a, « Réceptionner les réassorts »
  (`resupply-receptions-card/` : les réassorts envoyés qui visent la journée,
  un bouton chacun, puis « Réceptionné par X à HH:MM » et l'écart par ligne).
  Puis UNE table de tous les produits publiés (`resupply-stock-table/`) :
  stock du jour (somme des reçus réceptionnés), état OK · Faible · Rupture
  en un clic (ligne rouge ou orange, en tête du tri, une rupture place le
  curseur dans « Au plus tôt »), « Au plus tôt » et « Pour demain » saisis
  dans la case (la demande en cours de R1c) avec des pas +1/+5/+10,
  « Envoyer au plus tôt (N) » / « Envoyer pour demain (N) », et le reçu sans
  commande dans le menu de la ligne. Au-dessus, des puces de famille
  (« Tout » par défaut, une par famille présente au catalogue publié, un
  clic filtre), combinées à la recherche ; la famille (`categoryId`,
  `categoryName`) arrive avec chaque article de
  `admin/resupply-receipts/articles`.

### Le stock estimé

`estimateStock` (`domain/estimated-stock.ts`) additionne, à la lecture, les
reçus **réceptionnés** du jour au point — réassorts et sans commande —, moins
ce que les commandes « jour même sur stock » ont pris. Ce circuit n'existe pas
(lot J2), donc **le stock estimé est la somme des reçus**. Les commandes déjà
passées pour ce jour ne se soustraient pas : passées la veille avant l'heure
limite, elles sont dans le plan du fournil et ne puisent pas dans la vitrine.

## Le réglage : « réassort soumis à l'heure limite / sans limite »

`order_cutoff_settings.resupply_subject_to_cutoff` (oui par défaut), sur la
page de l'heure limite du back-office (`resupply-cutoff-card`). Depuis le lot
R1 (2026-10-21), il s'applique à la commande « Pour demain » ; « Au plus tôt »
n'y est jamais soumis. Voir
[`../limites-de-commande/schema-des-reglages.md`](../limites-de-commande/schema-des-reglages.md).

## Ce qui reste

- **La quantité emballée** comme attendu (R3) : l'attendu est encore la
  quantité demandée.
- **La course annuler / réceptionner** : l'annulation lit la réception puis
  écrit le réassort ; « Réceptionner » ne touche pas la version du réassort.
  Deux postes qui annulent et réceptionnent à la même seconde peuvent encore
  laisser un réassort annulé ET réceptionné (le reçu reste et compte au
  stock). Fermé seulement si la réception passe un jour par l'agrégat.
- **Le branchement de la commande** (R3, R4) : produite au plan figé, colisée,
  portée par le transfert interne
  ([`../livraisons/transferts/plan-transfert-interne.md`](../livraisons/transferts/plan-transfert-interne.md)) —
  lots du [plan](plan-reapprovisionnement.md).
- **Le jour même sur stock** (J2) : les commandes qui puisent dans la vitrine,
  leur décompte dans le stock estimé, et l'effet des alertes de R1b (une
  rupture bloque la vente en ligne du jour, un stock faible avertit) —
  [`../limites-de-commande/plan-jour-meme-sur-stock.md`](../limites-de-commande/plan-jour-meme-sur-stock.md).
