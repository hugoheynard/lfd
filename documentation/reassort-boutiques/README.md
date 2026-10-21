# Le réassort des boutiques

> **État : 🟡 partiel, 2026-10-21.** La **réception** au comptoir est bâtie
> (commit `558b376c8`) ; la **commande** au fournil aussi (lot R1, 2026-10-21),
> mais le fournil ne fait encore que la LIRE : elle n'entre ni au plan figé, ni
> au colisage, ni au transfert (R3). Les **ruptures et stocks faibles** du
> comptoir aussi (lot R1b, 2026-10-21), sans effet encore sur la boutique. La
> **demande en cours** est enregistrée depuis le lot R1c (2026-10-21). Ce document décrit ce qui existe, vérifié
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

Les deux existent depuis le 2026-10-21, sans lien encore : la demande ne
pré-remplit pas la réception (lot R2).

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
- **L'heure limite** : `place()` refuse une visée `tomorrow` après l'heure
  limite générale de sa journée (borne incluse, rattrapage non compris) quand
  `resupply_subject_to_cutoff` est vrai — **le réglage a désormais un
  effet**. `asap` n'en a jamais. La règle est celle du commerce
  (`OrderCutoffsInForce` + `orderCutoffInstant`), lue par le port
  `ResupplyCutoff` (`apps/lfd-api/src/b2b/resupply/infrastructure/general-resupply-cutoff.ts`).
- **Annuler** : un réassort passé s'annule, une fois ; rien en aval ne le
  tient encore. Une annulation est un état, jamais une suppression.
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
- **Le `POST :siteId` de R1** est gardé — le bouton « Lancer un réassort au
  plus tôt » du fournil l'emploie — et passe par la demande en cours : ses
  lignes s'ajoutent à la demande de la visée, puis la demande ENTIÈRE part,
  avec ce que le comptoir y avait mis. Un seul réassort « au plus tôt » à la
  fois, jamais deux demandes parallèles.
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
  A --> F["Fournil › Réassorts à produire<br/>« Village : rupture — Croissant »<br/>« Lancer un réassort au plus tôt »"]
  R["Réception d'une ligne de l'article<br/>au point (ResupplyReceipt)"] -->|"même transaction"| A
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
  (`apps/lfd-api/src/b2b/resupply/application/lift-stock-alert-on-receipt.ts`), appelé par
  `ReceiveResupplyLineHandler` dans l'unité de travail de la réception. C'est
  le seul chemin ; R2 (la réception en un geste) s'y branchera. Corriger ou
  retirer une ligne ne lève rien.
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
  (`production/reassorts-a-produire/live-stock-alerts-card/`). « Lancer un
  réassort au plus tôt » ajoute l'article à la demande `asap` du point et
  l'envoie (R1c), par la route du comptoir : il n'apparaît qu'à qui tient
  `handover_counter:write` — aucun droit du fournil ne couvre cette route.
- **Aucun effet sur la boutique ni sur la passation** : une rupture ne bloque
  encore rien, un stock faible n'avertit aucun client (lot J2). L'écran du
  comptoir le dit.

## Ce qui est bâti : la réception au comptoir

```mermaid
flowchart LR
  F["Fournil<br/>(commande de réassort : NON bâtie)"] -.-> V["Vitrine du site"]
  V --> C["Comptoir : page Réassort<br/>saisit ce qui est reçu"]
  C --> R["ResupplyReceipt<br/>(site, jour) → lignes SKU × quantité"]
  R --> S["Stock estimé<br/>= reçu (aujourd'hui)"]
```

- **Le code** : `apps/lfd-api/src/b2b/resupply/`. L'agrégat
  `ResupplyReceipt` (`domain/resupply-receipt.ts`) tient, pour **un site et
  une journée**, la liste des articles reçus : `receive`, `correct`,
  `withdraw`. Il ne connaît ni prix ni commande.
- **Les invariants** : un article au plus une fois — une seconde saisie du
  même SKU est **refusée** (`ReceiptLineAlreadyPresentError`, « corrigez sa
  quantité ») plutôt qu'additionnée ; des quantités entières ≥ 0 ; une journée
  `AAAA-MM-JJ` ; un auteur sur chaque geste.
- **Le verrou optimiste** : la réception porte une `version` ; l'adaptateur
  réécrit sous la version lue, et deux postes qui corrigent en même temps
  font refuser le second (`ResupplyReceiptChangedMeanwhileError`).
- **Les articles proposés** : le catalogue publié aux particuliers, lu par
  `CatalogReader` (SKU produit, aucun prix).
- **Les tables** : `resupply_receipt` (unique par site et jour) et
  `resupply_receipt_line` (unique par réception et SKU), schéma `public`
  (`apps/lfd-api/prisma/schema/public/resupply.prisma`).
- **Les routes** : `admin/resupply-receipts` sous la surface
  `handover_counter` — lecture `handover_counter:read` (articles, liste du
  jour), écriture `handover_counter:write` (ajouter, corriger, retirer une
  ligne).
- **L'écran** : `apps/lfd-backoffice-frontend/src/app/comptoir/reassort-boutique-page/`,
  route `reassort` de l'espace comptoir.

### Le stock estimé

`estimateStock` (`domain/estimated-stock.ts`) calcule, à la lecture, reçu −
ce que les commandes « jour même sur stock » ont pris. Ce circuit n'existe pas
(lot J2), donc **le stock estimé est le reçu**. Les commandes déjà passées
pour ce jour ne se soustraient pas : passées la veille avant l'heure limite,
elles sont dans le plan du fournil et ne puisent pas dans la vitrine.

## Le réglage : « réassort soumis à l'heure limite / sans limite »

`order_cutoff_settings.resupply_subject_to_cutoff` (oui par défaut), sur la
page de l'heure limite du back-office (`resupply-cutoff-card`). Depuis le lot
R1 (2026-10-21), il s'applique à la commande « Pour demain » ; « Au plus tôt »
n'y est jamais soumis. Voir
[`../limites-de-commande/schema-des-reglages.md`](../limites-de-commande/schema-des-reglages.md).

## Ce qui reste

- **La réception en un geste** (R2) : un reçu par réassort, pré-rempli de la
  quantité demandée.
- **Le branchement de la commande** (R3, R4) : produite au plan figé, colisée,
  portée par le transfert interne
  ([`../livraisons/transferts/plan-transfert-interne.md`](../livraisons/transferts/plan-transfert-interne.md)) —
  lots du [plan](plan-reapprovisionnement.md).
- **Le jour même sur stock** (J2) : les commandes qui puisent dans la vitrine,
  leur décompte dans le stock estimé, et l'effet des alertes de R1b (une
  rupture bloque la vente en ligne du jour, un stock faible avertit) —
  [`../limites-de-commande/plan-jour-meme-sur-stock.md`](../limites-de-commande/plan-jour-meme-sur-stock.md).
