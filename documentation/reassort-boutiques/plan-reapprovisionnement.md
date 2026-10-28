# Plan — le réapprovisionnement d'un site

> **État au 2026-10-21 : partiel.** La **réception** est bâtie (agrégat
> `ResupplyReceipt`, `b2b/resupply/`, et la page Comptoir › Réassort boutique —
> [`plan-jour-meme-sur-stock.md`](../limites-de-commande/plan-jour-meme-sur-stock.md)
> §7), ainsi que le réglage « soumis à l'heure limite / sans limite », stocké
> sans effet. Restent : la **commande au fournil** (`SiteResupply`, lots R1–R5)
> et son branchement aux lecteurs du fournil, du colisage et du transfert ; la
> décision A/B est tranchée en B (§9).
>
> **Doc-first d'origine, 2026-10-14.** Planifié par Hugo
> (« oui planifie le réassort après ») à la suite du transfert interne
> ([`plan-transfert-interne.md`](../livraisons/transferts/plan-transfert-interne.md)), qui lui a déjà
> réservé sa place : l'élément de transfert de genre `resupply`, le cadre
> « Réapprovisionnement » du colisage, le format de ligne du manifeste.
>
> Chaque affirmation sur l'existant est datée et a été ouverte le 2026-10-14 ;
> ce qui ne l'a pas été est marqué « non vérifié ».

## 1. La demande

Hugo, 2026-10-13 : un même transfert porte « des commandes pour le retrait
village **et** le réassort boutique » ; le réassort, « c'est facile, c'est
comme une commande mais au niveau du site, j'imagine pour l'instant avec les
mêmes limites produit pour simplifier ». Vocabulaire tranché le même jour :
**réapprovisionnement** (`resupply`), jamais « réassort » dans le code.

Hugo, 2026-10-14 : voir dans la démo une tournée de début d'après-midi qui
porte du réapprovisionnement.

## 2. Ce qui existe (vérifié le 2026-10-14)

- `delivery_internal_transfer_item` accepte `kind = 'resupply'` avec un
  `resupply_id` **opaque**, sans clé étrangère ; aucun écrivain ne le produit.
- Le manifeste du transfert a une section « réapprovisionnement » au même
  format de ligne (SKU, libellé, quantité) que les commandes ; elle est vide.
- Le colisage a un cadre `replenishment` dans le cadre du transfert
  (`packing-frames.ts`), alimenté par un argument que rien ne fournit.
- La production ne connaît une commande que par un identifiant opaque et un
  snapshot (CLAUDE.md §3) — un réapprovisionnement peut y entrer de la même
  façon.

## 3. La décision structurante : une commande, ou son propre agrégat ?

|                                 | A — une `Order` dont le client est un site                                                                                                            | B — un agrégat `SiteResupply`                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Production, colisage, transfert | gratuits : ils lisent déjà les commandes                                                                                                              | une seconde source à brancher dans chaque lecteur (fournil, colisage, contenu du transfert) |
| Argent                          | une commande porte prix, TVA, règlement, chiffre d'affaires, facturation : il faudrait les neutraliser partout, et chaque oubli compte un faux revenu | aucun : un réapprovisionnement est un mouvement interne                                     |
| Invariants                      | `Order` suppose une société ou une personne, une clientèle `b2b`/`b2c`                                                                                | les siens : un site destinataire, des lignes, un jour                                       |
| Risque                          | **élevé** — touche l'argent à tous les étages                                                                                                         | modéré — touche des lecteurs                                                                |

**Proposé : B.** L'argent est l'endroit où se tromper coûte le plus, et A
demanderait de prouver partout qu'un réapprovisionnement ne compte pas. B
paie en branchements ce que A paierait en exceptions.

## 4. Le modèle proposé (B)

- **Agrégat `SiteResupply`** dans `b2b/resupply/` : `siteId` (un site
  `supply = transfer`), `serviceDay`, lignes `{ sku, label, quantity }`
  copiées du catalogue au moment de la saisie (snapshot, comme une commande),
  état `draft → placed → cancelled`, auteur (staff).
- **Mêmes limites produit que les commandes** (Hugo) : heure limite de la
  journée, quantités et multiples de l'article — lus par les mêmes règles,
  appliqués à la transition `place()`.
- **Aucun prix, aucune TVA, aucun règlement.** Le snapshot ne porte pas de
  champ monétaire (la porte `lint:price-door` le tiendra).
- **Production** : le fournil lit un réapprovisionnement placé comme une
  commande à produire, par son canal (`production/channels/commerce/`) —
  identifiant opaque préfixé, échéance = celle du transfert du site (T0).
- **Transfert** : à la passation (ou à la clôture si la journée est close),
  l'abonné de T2 range le réapprovisionnement dans le transfert prévu du site
  comme il range une commande ; le manifeste lit son contenu.
- **Colisage** : ses colis vont dans les bacs du transfert (Q-T4 révisée) ;
  le cadre `replenishment` reçoit ses éléments.
- **Droit** : une ressource neuve `lfc_site_resupply` (lecture / écriture),
  accordée à l'écran — jamais par migration.
- **Écran** : Réglages ? Non — c'est un geste du jour. Proposé : une entrée
  « Réapprovisionnement » sous Commandes dans le menu principal, une saisie par
  site et par jour, liste d'articles du catalogue avec quantités.

## 5. Lots

| Lot | Taille | Contenu                                                                                                                             | Dépend de           |
| --- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| R1  | M      | agrégat, table `resupply` + lignes (migration additive), ressource `lfc_site_resupply`, commandes placer / annuler, limites produit | —                   |
| R2  | M      | le fournil le produit (canal), le transfert le porte (abonné), le manifeste lit son contenu                                         | R1, transfert T1–T3 |
| R3  | S      | colisage : ses colis au cadre du transfert, dans les bacs du transfert                                                              | R2                  |
| R4  | M      | écran de saisie au back-office                                                                                                      | R1                  |
| R5  | S      | semis : un réapprovisionnement de Val Village l'après-midi de J                                                                     | R2                  |

`vitruve` d'office avant de bâtir : migration et frontière de droits.

## 6. Questions à Hugo

- **Q-R1** — A ou B (§3) ? Proposé : **B**.
- ~~**Q-R2**~~ — ✅ (Hugo, 2026-10-14) : **les deux**. « Le site commande le
  réassort » — c'est le geste normal, fait par l'équipe du site ; « en cas de
  problème, ou si le site appelle, le labo peut enregistrer le réassort pour
  le village ». Conséquence : le réapprovisionnement porte son **auteur** et
  **pour quel site** il est saisi ; l'écran propose d'office le site de qui
  saisit, et laisse le labo choisir le site. **Non vérifié** : le dépôt
  sait-il rattacher un membre du staff à un site ? Si non, R1 commence par un
  droit unique `lfc_site_resupply` (tout détenteur saisit pour tout site), et
  le cloisonnement par site devient une question à part.
- **Q-R3** — Un site servi **sur place** (le Labo) a-t-il du
  réapprovisionnement ? Proposé : non — il se sert au fournil, sans transport.
- **Q-R4** — Un réapprovisionnement récurrent (le même chaque jour), ou saisi
  chaque fois ? Proposé : saisi chaque fois d'abord, gabarit plus tard.
- **Q-R5** — Faut-il en tenir un coût interne (valorisation du stock du
  site) ? Proposé : non pour R1–R5 ; si oui, c'est un plan d'argent à part.

## 7. Contradiction de `vitruve` (2026-10-14) — le §3 est à refaire

L'option B a été chiffrée trop bas. Toute la chaîne aval est **en forme de
commande**, et un réapprovisionnement qui y entre par un identifiant préfixé
en devient un discriminant implicite :

- `ProducibleOrder` exige `fulfillmentMethod` (`pickup` | `delivery`),
  `clientele`, `customerLabel` ;
- `production.day_closed`, `production.packing_list_drawn` et la table
  `packing_order` (clé `(service_day, order_id)`, `fulfillment_method` non
  nul) supposent une commande ;
- `packing.order_packed` → `MarkOrderReadyCommand` lève
  `OrderReferenceNotFoundError` sur un id inconnu : un abonné durable en
  lettre morte à chaque réapprovisionnement colisé ;
- le rangement au transfert lit `TransferOrdersReader` (commandes seulement)
  et part du fait `commerce-order-placed` ; il faut un fait neuf et son
  annulation, et l'ordre des verrous de `OrderWithdrawalDesk` ;
- l'échéance du transfert vit dans `delivery` : le commerce la lirait par un
  port à nommer.

Et deux promesses fausses : les « quantités et multiples » de l'article
**n'existent pas** (`OrderLine` ne vérifie qu'un entier > 0) ; l'heure limite
est indexée par point de retrait et jour de semaine, et la limite par
article se lit par **audience** (`pro` | `public`), qu'un réapprovisionnement
n'a pas. `lint:price-door` ne tiendrait pas l'absence de champ monétaire.

**Suite** : mesurer honnêtement ce que coûterait l'option A (où une commande
compte de l'argent : chiffre d'affaires, facturation, règlement), puis
re-trancher Q-R1 avec un champ `kind` explicite au contrat dans les deux cas.

## 8. L'option A mesurée (2026-10-14)

Lecture du code (exploration, lignes citées dans l'échange du jour) : une
commande touche l'argent ou le client à **20 endroits** — 16 points de
changement, 4 contraintes de l'agrégat. **6** se règlent par un filtre unique
(`revenueWhere`, `billableOrderWhere`, l'écrivain du journal `order.placed`,
le volume par SKU des paliers, `earningFor`, le courriel « prête ») ; **10**
demandent une branche. **10 sont dangereux** : un oubli y compte un faux
chiffre d'affaires, **facture ou prélève réellement** une société
(`billableOrderWhere`), ouvre une intention Stripe (`settleOrder`) ou envoie un
courriel. Et l'agrégat `Order` calcule toujours prix, TVA et total : A exige
une branche dans l'agrégat lui-même.

|                    | A — une commande                                    | B — un agrégat à part                                  |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------ |
| Endroits à toucher | ~20                                                 | ~8 (3 faits durables, 4 abonnés, réception/annulation) |
| Un oubli…          | se tait : faux revenu, vraie facture, vrai courriel | crie : abonné en lettre morte, visible à la santé      |
| Argent             | partout                                             | nulle part                                             |

**Recommandation maintenue : B**, avec un **genre explicite** (`kind:
order | resupply`) au contrat de ce que le fournil produit et dans les faits
`production.*` / `packing.*`, plutôt qu'un identifiant préfixé.

## 9. Décision de Hugo (2026-10-21) : B

« Pas de prix, part sur B. » Le réapprovisionnement d'un site est un **agrégat
à part** (`SiteResupply`), jamais une commande : pas de prix, pas de TVA, pas
de règlement, pas de chiffre d'affaires. Le coût est de le brancher dans les
lecteurs du fournil, du colisage et du transfert (§3), le jour où il sera
commandé au fournil. La **réception** au comptoir (lignes produit, quantités
reçues, stock estimé du jour) est bâtie avant la commande, le 2026-10-21 —
voir [`../limites-de-commande/plan-jour-meme-sur-stock.md`](../limites-de-commande/plan-jour-meme-sur-stock.md).

## 10. Le circuit complet : commander, produire et emballer, réceptionner (Hugo, 2026-10-21) — l'emporte sur les §4–§5

> « La base c'est commander un réassort ; ensuite la prod produit, emballe, et
> donne donc la quantité réelle produite ; le comptoir atteste de la réception
> de cette quantité et ça remplit tout d'un coup. Personne ne fera du ligne par
> ligne en plein service. » — Hugo, 2026-10-21.

```mermaid
flowchart LR
  A["① Commander<br/>le comptoir du point (bandeau : Labo, Village)<br/>lignes + quantités DEMANDÉES pour J<br/>avant l'heure limite (si « soumis »)"] --> B["② Produire<br/>le fournil le met au plan de J<br/>(kind: resupply, sans prix)"]
  B --> C["③ Emballer<br/>le colisage saisit la quantité<br/>RÉELLEMENT emballée par ligne"]
  C --> D["④ Acheminer<br/>Village : dans le transfert du site<br/>Labo : rien à transporter"]
  D --> E["⑤ Réceptionner<br/>le comptoir : UN geste « Réceptionner »<br/>tout pré-rempli des quantités emballées<br/>→ stock du jour"]
```

- **① Commander** (`SiteResupply.place`) : par le comptoir du point choisi dans
  le bandeau (Hugo : « le comptoir ; on verra la granularité du droit plus
  tard ») — un droit unique pour commencer. Soumis à l'heure limite générale
  si le réglage `resupply_subject_to_cutoff` le dit (bâti, sans effet
  jusqu'ici). Aucun prix (décision B, §9).
- **② Produire** : le fournil le lit par son canal avec un **genre explicite**
  `kind: order | resupply` (§8), jamais un identifiant préfixé ; il entre dans
  le plan de J et se fige avec lui à l'heure limite.
- **③ Emballer** : le colisage saisit la quantité RÉELLE emballée par ligne (le
  fournil peut produire moins) ; un fait `packing.resupply_packed` la publie.
- **④ Acheminer** : un point servi par transfert (Village) le reçoit dans le
  transfert de J ; le Labo, servi sur place, n'a rien à transporter (Q-R3 :
  le réassort du Labo EXISTE — Hugo : « réassort Labo si switch Labo »).
- **⑤ Réceptionner** : la page Réassort du comptoir (déjà bâtie pour la saisie,
  2026-10-21, commit 558b376c8) devient l'écran de RÉCEPTION : la liste
  emballée en lecture, un bouton **« Réceptionner »** qui atteste tout d'un
  coup ; une ligne ne se corrige qu'en cas d'écart (bac abîmé, erreur). La
  réception remplit `ResupplyReceipt` (la partie « reçue ») → stock du jour.
  La saisie manuelle actuelle reste le secours (réassort non commandé).

### Lots (remplacent R1–R5)

| Lot    | Contenu                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** | `SiteResupply` (commande : brouillon → placé → annulé), table + lignes, routes sous le droit du comptoir, heure limite si soumis ; écran « Commander le réassort » du point (bandeau) |
| **C2** | Le fournil le produit (canal, `kind: resupply`), le plan le fige à l'heure limite                                                                                                     |
| **C3** | Le colisage : le réassort à la liste à coliser, la quantité réellement emballée, `packing.resupply_packed` ; au transfert pour un point servi par transfert                           |
| **C4** | La réception en un geste : page Réassort pré-remplie, « Réceptionner », écarts par ligne → `ResupplyReceipt`                                                                          |

`vitruve` d'office avant C1 : il déplace des frontières entre blocs (commerce,
fournil, colisage, livraison) et en crée de nouveaux faits durables.

### Questions

- **Q-C1** — Un modèle récurrent (« le réassort habituel du mardi » pré-rempli)
  dès C1, ou plus tard ? (Q-R4 proposait « plus tard ».)
- **Q-C2** — Un écart à la réception (moins reçu qu'emballé) : simple
  correction, ou un signalement au fournil ?

**Décisions de Hugo (2026-10-21)** : Q-C1 — le modèle récurrent, **plus
tard** ; Q-C2 — le signalement d'un écart au fournil, **plus tard** (un écart
se corrige simplement sur la ligne à la réception).

## 11. Le plan live — révision de Hugo après `vitruve` (2026-10-21) — l'emporte sur le §10

`vitruve` a contredit le §10 le 2026-10-21 (quatre BLOQUANTS : bac incomplet,
« sans limite » contre « se fige avec le plan », canal de la quantité emballée,
réception sans « attendu »). Hugo y a répondu en changeant le modèle :

- « Le fournil n'est pas censé être au courant des commandes client du jour J,
  puisqu'elles sont prises sur du stock. » → **pas de concurrence** entre
  clients et réassort : le réassort EST ce qui remplit le stock de la vitrine ;
  les commandes de demain ont leur propre production, dans le plan figé.
- « Les réassorts doivent être un plan parallèle, le plan live. » → **deux
  plans** :

|          | Le plan du lendemain                          | Le plan live (réassort)                           |
| -------- | --------------------------------------------- | ------------------------------------------------- |
| Contient | les commandes client pour demain              | les réassorts des points                          |
| Se ferme | à l'heure limite générale (§ une seule heure) | **jamais figé**                                   |
| Alimente | les retraits et livraisons de demain          | le stock de la vitrine (jour même)                |
| Colisage | tout le dû doit être au bac                   | **la quantité réelle**, un bac incomplet se ferme |

- « Il faut faire les deux : le soir, le point commande pour le lendemain ;
  dans la journée, c'est faire au plus tôt. » → un réassort vise **soit demain**
  (la commande du soir, préparée pour le matin), **soit « au plus tôt »**
  (aujourd'hui, quand la vitrine se vide). Les deux entrent au plan live.
- Le réglage « réassort soumis à l'heure limite / sans limite » **est gardé** :
  soumis, la commande du soir pour demain doit passer avant l'heure limite
  générale ; sans limite, elle peut arriver jusqu'au matin. Le « au plus tôt »
  du jour n'a pas d'heure limite.

### Ce que ça règle dans les objections de `vitruve`

- **Bac incomplet** : le colisage du plan live ferme un bac à la quantité
  réelle — une règle de fermeture propre au réassort, distincte de
  `PackingSheet.seal()` qui exige tout le dû.
- **« Sans limite » contre le gel** : le réassort n'entre pas dans le plan figé ;
  il n'y a plus de contradiction.
- **Priorité clients / réassort** : sans objet.

### Ce qui reste à concevoir (avant de bâtir)

- **Le canal de la quantité emballée** : déclaré par le fournil, publié par le
  colisage, lu par le commerce (le chemin de `PackingOrderPackedEvent`), avec
  une clé versionnée (une réouverture corrigée doit atteindre la réception).
- **L'« attendu » distinct du « reçu »** dans la réception : l'emballé remplit
  l'attendu ; « Réceptionner » le recopie en reçu (le stock ne monte qu'à la
  réception, jamais à l'emballage). Saisie de secours et deux réassorts le
  même jour sur un même article : additionner.
- **Le plan live côté fournil** : un écran « à produire au plus tôt » à côté du
  plan figé ; ce que le fournil produit sans commande de réassort reste hors
  du système (pas de stock réel).
- **Le transfert du Village** : des faits « réassort placé / annulé » et un
  lecteur dans `delivery/channels/commerce/`, le réassort « au plus tôt »
  partant par la prochaine tournée ; le Labo n'a rien à transporter, son bac
  prêt se voit à la page de réception.
- Une union discriminée côté fournil (`kind: order | resupply`) pour ce qu'il
  produit, le réassort ne portant ni clientèle ni mode d'acheminement.

Ce §11 se refait contredire par `vitruve` avant le lot C1.

## 12. Contredit une seconde fois, et tranché (Hugo, 2026-10-21) — l'emporte sur le §11

`vitruve` (2026-10-21) : un plan jamais figé ne s'accroche à rien de
l'existant — le colisage et la composition des tournées ne se déclenchent qu'à
l'arrêt du plan (`production.packing_list_drawn`, `production.day_closed`) ; la
réception bâtie refuse un même article deux fois ; la commande du soir hors
plan figé n'apparaîtrait sur aucune feuille de production.

Décisions de Hugo :

- **La commande du soir pour demain entre dans le plan FIGÉ du lendemain**,
  mais **distinguée** (« dans le plan figé c'est pas mal, mais il faut
  distinguer tout de même ») : genre explicite `kind: resupply`, section à
  part sur la feuille de production, au colisage et au transfert — jamais
  mêlée aux commandes client. Le réglage `resupply_subject_to_cutoff` garde
  ainsi son sens : soumise, elle passe avant l'heure limite.
- **« Au plus tôt » dans la journée** reste le plan live : conçu plus tard (R3,
  R4).
- **Un reçu par réassort** : chaque réassort se réceptionne à part ; le stock
  du jour additionne. La saisie de secours devient un « réassort sans
  commande ».

### Lots (remplacent C1–C4)

| Lot                                         | Contenu                                                                                                                                                                                                                                                  | Touche                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **R1** ✅ (bâti le 2026-10-21, non commité) | `SiteResupply` : commander (le soir pour demain, ou « au plus tôt »), annuler ; écran du comptoir pour le point du bandeau ; écran du fournil « réassorts à produire » EN LECTURE (demain et aujourd'hui, distingués) — état dans le [README](README.md) | commerce, back-office                                       |
| **R2** ✅ (bâti le 2026-10-21, non commité) | Réception en un geste : un reçu par réassort, pré-rempli de la quantité DEMANDÉE, « Réceptionner », écarts par ligne ; la saisie de secours = réassort sans commande ; stock du jour = somme des reçus                                                   | commerce, back-office (migration de la réception : vitruve) |
| **R3**                                      | Le réassort du soir au plan figé : feuille de production, colisage (quantité réelle), transfert du Village — section distincte                                                                                                                           | fournil, colisage, livraison                                |
| **R4**                                      | « Au plus tôt » : le plan live au colisage et aux tournées                                                                                                                                                                                               | à concevoir                                                 |

### R1b ✅ — Rupture et stock faible au comptoir (Hugo, 2026-10-21 ; bâti le 2026-10-21, non commité)

« Au comptoir on devrait pouvoir déclarer une rupture, un stock faible sur un
produit, ce qui permettrait déjà de bloquer les commandes, avertir. » Et : « pas
forcément pour aujourd'hui, dans la mesure où un réassort relève le stock. »

- **Déclarer** « Rupture » ou « Stock faible » sur un produit, pour un point
  (celui du bandeau), depuis la page Réassort.
- **Durée** : jusqu'à la réception d'un réassort de ce produit au point (R2),
  ou jusqu'à ce que le comptoir la lève à la main — jamais levée d'elle-même
  le lendemain.
- **Effets**, en attendant le circuit du jour même :
  - une **alerte** sur l'écran du fournil « Réassorts à produire » (« Village :
    rupture de croissants »), avec « Lancer un réassort au plus tôt » pour ce
    produit ;
  - la mention sur la page Réassort du point.
- **Plus tard (J2, le jour même)** : une rupture bloque la vente EN LIGNE du jour
  sur stock de ce produit au point ; un stock faible avertit le client. Les
  commandes pour demain ne sont jamais bloquées (elles sont produites au plan).

Bâti juste après R1 (même page). ✅ **Bâti le 2026-10-21** : l'agrégat
`StockAlert` (`b2b/resupply/`), la table `site_stock_alert` (migration
additive `20261021190000_les_alertes_de_stock_du_comptoir`), la levée par la
réception branchée dans `ReceiveResupplyLineHandler`, les deux écrans — état
dans le [README](README.md). Le bouton « Lancer un réassort au plus tôt » du
fournil passe par la route du comptoir : il n'apparaît qu'à qui tient
`handover_counter:write`.

### R1c ✅ — La demande en cours, enregistrée (Hugo, 2026-10-21 ; bâti le 2026-10-21, non commité)

« Un état général de la demande de réassort, pré-envoi de la demande, stocké. »
En R1, le brouillon ne vit qu'à l'écran : un rechargement ou un autre poste le
perd. R1c l'enregistre :

- **Une demande ouverte par point et par visée** (« pour demain », « au plus
  tôt ») — l'état `draft` de `SiteResupply`, persisté.
- **Le comptoir y ajoute et en retire des articles au fil du service**, depuis
  n'importe quel poste (verrou de version : deux postes ne s'écrasent pas).
- **« Envoyer le réassort »** la fige (`place`) et la transmet au fournil ; une
  nouvelle demande s'ouvre ensuite pour la même visée.
- **Avec R1b** : déclarer une rupture ou un stock faible propose d'ajouter le
  produit à la demande « au plus tôt » en cours, plutôt que d'ouvrir un
  réassort à part.

Bâti juste après R1b (mêmes écrans, même agrégat).

✅ **Bâti le 2026-10-21** : le brouillon de `SiteResupply` se persiste (les
colonnes `placed_*` deviennent nullables, index unique partiel
`site_resupply_open_draft_key` — migration additive
`20261021210000_la_demande_de_reassort_en_cours`) ; ajouter (la quantité
s'additionne), corriger, retirer, envoyer, sous verrou de version ; une
demande vide ou d'une journée passée ne part pas. Le `POST` d'un seul tenant
de R1 est gardé et passe par la demande en cours (le bouton du fournil
l'ajoute à la demande « au plus tôt » et l'envoie entière). État dans le
[README](README.md).

### R2 ✅ — La réception en un geste (Hugo, 2026-10-21 ; bâti le 2026-10-21, non commité)

« Personne ne fera du ligne par ligne en plein service. » Un reçu par
réassort ; la saisie de secours devient un « réassort sans commande » ; le
stock du jour additionne les reçus.

- **Un reçu par réassort envoyé** : `ResupplyReceipt` porte désormais un
  `resupplyId`, et chaque ligne son **attendu** (la quantité DEMANDÉE, en
  attendant la quantité emballée de R3) et son **reçu**. « Réceptionner »
  recopie l'attendu en reçu pour toutes les lignes, d'un geste ; le reçu ne
  s'écrit en base qu'à ce moment. Le stock ne monte qu'à la réception, jamais
  à l'envoi.
- **La règle de l'écart** : une ligne ne se corrige qu'**après**
  « Réceptionner » (avant, rien n'est reçu : 409
  `resupply.receipt.not_yet_received`). On n'ajoute ni ne retire d'article à
  un reçu de réassort : un article arrivé en plus va au réassort sans
  commande, un manquant se corrige à zéro.
- **Un second « Réceptionner » est refusé** (409
  `resupply.receipt.already_received`, en nommant qui et quand), jamais
  rejoué en silence ; une course entre deux postes bute sur l'index unique
  `resupply_receipt_resupply_id_key`. Seul un réassort envoyé et non annulé se
  réceptionne (409 `resupply.receipt.resupply_not_receivable`) ; celui d'un
  autre point est introuvable (404).
- **Le réassort sans commande** : même agrégat, `resupplyId` nul, au plus un
  par (point, journée) (index unique partiel `resupply_receipt_unordered_key`)
  — la saisie ligne par ligne d'avant, refus du doublon compris.
- **Le stock estimé du jour** = somme des reçus réceptionnés du jour au
  point, tous reçus confondus (`estimateStock`).
- **Les alertes de R1b** se lèvent à « Réceptionner », pour chaque ligne reçue
  > 0, dans la même transaction, et toujours à la saisie sans commande.
- **Migration** `20261021230000_un_recu_par_reassort` — **non additive** :
  elle retire l'index unique (site, journée) de
  `20261021150000_la_reception_du_reapprovisionnement`, jamais déployée
  (absente de `origin/main`, vérifié le 2026-10-21).
- **L'écran** (Comptoir › Réassort) : « Réceptionner les réassorts » (les
  réassorts envoyés pour la journée du bandeau, attendus en lecture, un
  bouton, puis « Réceptionné par X à HH:MM » et l'écart par ligne), le
  tableau « Stock estimé du jour » en somme, et « Réassort sans commande »
  replié en bas. État dans le [README](README.md).

### R1d ✅ — Le fournil envoie un réassort, à part de la demande du comptoir (Hugo, 2026-10-21 ; bâti le 2026-10-21, non commité)

> Le 2026-10-28, la composition peut s'enregistrer comme brouillon et se
> reprendre ailleurs : [`plan-brouillons-du-fournil.md`](plan-brouillons-du-fournil.md).

« Pourquoi le fournil lancerait le réassort [du comptoir] ? Après, je trouve
intéressant la capacité du fournil à dire "je t'envoie ça" — typiquement si le
comptoir demande au téléphone, le fournil peut entrer la demande. C'est une
autre façon de faire. »

- **Corrige R1b/R1c** : sur l'écran du fournil, le bouton d'une alerte
  « Lancer un réassort au plus tôt » envoyait la demande « au plus tôt » DU
  COMPTOIR, avec ce que le comptoir y avait mis. Il disparaît. Les alertes
  restent chez le fournil, pour information.
- **« Envoyer un réassort »** sur l'écran du fournil, par point : le fournil
  choisit articles et quantités et envoie. C'est un réassort À PART, signé
  « par le fournil » (origine), qui ne touche jamais la demande en cours du
  comptoir.
- **Au comptoir**, il arrive dans les réassorts à réceptionner (R2), marqué
  « envoyé par le fournil », et se réceptionne en un geste comme les autres.
- **Droit** : le geste du fournil a son propre droit (à trancher à l'écran des
  rôles), distinct de `handover_counter`.

Bâti juste après R2.

✅ **Bâti le 2026-10-21** : `SiteResupply.origin` (`counter` | `bakehouse`,
migration additive `20261022000100_l_origine_du_reassort`, défaut
`counter`) ; `SiteResupply.sentByBakehouse` crée et envoie d'un geste, sans
brouillon ; la ressource `production_resupply`
(`20261022000000_le_droit_du_reassort_du_fournil`, accordée à l'écran) et
la route `admin/bakehouse-resupplies` ; le `POST :siteId` du comptoir et le
bouton des alertes retirés ; « Envoyé par le fournil » au fournil et à la
réception. Les deux trous de R2 sont fermés : annuler un réassort
réceptionné est refusé (409 `resupply.order.already_received`), réceptionner
avant sa journée aussi (409 `resupply.receipt.day_not_yet_come`). État dans
le [README](README.md).

### R1e ✅ — Une table de tous les produits, pensée « comptoir, un clic » (Hugo, 2026-10-21 ; bâti le 2026-10-21, non commité)

« Au niveau de l'écran, on ferait mieux d'avoir une table avec tous les
produits, avec le stock actuel. » — « Et les boutons de déclaration rupture /
faible. » — « Pense comptoir, un clic ; filtre au-dessus de la table par
catégorie. »

La page Réassort du point (bandeau) remplace ses cartes par :

- **En tête, seulement s'il y en a** : « N réassorts à réceptionner », chacun
  avec son bouton **Réceptionner** (R2).
- **Au-dessus de la table** : des **puces de catégorie** (une par famille du
  catalogue, « Tout » par défaut), un clic filtre ; et une recherche.
- **La table**, tous les produits du catalogue public :

| Produit                              | Stock du jour               | État                            | Au plus tôt | Pour demain |
| ------------------------------------ | --------------------------- | ------------------------------- | ----------- | ----------- |
| somme des reçus réceptionnés du jour | `OK` · `Faible` · `Rupture` | quantité de la demande en cours | idem        |

- **Un clic partout** :
  - l'**État** est un sélecteur à trois positions sur la ligne ; un clic
    déclare (Faible, Rupture) ou lève (OK), sans confirmation — le même clic
    défait ; une rupture passe la ligne en rouge, un stock faible en orange ;
    déclarer une rupture place le curseur dans « Au plus tôt » ;
  - **Au plus tôt / Pour demain** se saisissent dans la case (la demande en
    cours de R1c, enregistrée et partagée) ; des pas rapides (+1, +5, +10)
    à côté de la case ;
  - en bas : **« Envoyer au plus tôt (N) »** et **« Envoyer pour demain (N) »**.
- **Tri par défaut** : ruptures et stocks faibles en tête, puis les produits
  demandés, puis le reste.
- **Le réassort sans commande** devient un geste discret (« + reçu sans
  commande » dans un menu de la ligne), plus une carte.

Aucun changement serveur attendu : tout ce qu'il faut existe (R1–R2). Bâti
juste après R1d (même page).

✅ **Bâti le 2026-10-21**, front seul : `ResupplyStockTable`
(`comptoir/reassort-boutique-page/resupply-stock-table/`) ; le titre
« Réassort <point> » est retiré (l'onglet du bandeau le dit, Hugo) ; la carte
« Réceptionner les réassorts » passe en tête, seulement s'il y en a ; les
cartes « Commander au fournil » et « Réassort sans commande » sont
supprimées (la table les remplace). La recherche est là.
Les **puces de catégorie** sont bâties le 2026-10-21 (R1e-bis, demande de
Hugo, non commité) : `ResupplyArticleView` gagne `categoryId` et
`categoryName` (la tête de la famille, lue sur `CatalogReader` comme le
catalogue publié du commerce — champ ajouté, rien retiré) ; la table
affiche « Tout » puis une puce par famille présente (`fold-view-toggle`),
combinée à la recherche.

## 13. R3 — Le réassort du soir au plan figé (conçu le 2026-10-21, doc-first)

> Décisions de Hugo du 2026-10-21 : Q1 le Labo passe aussi au colisage ;
> Q2 la feuille porte un total par produit (commandes + réassorts) en plus de
> la section à part ; Q3 un réassort figé ne s'annule plus ; Q4 le colisage
> ouvre un lecteur de la quantité emballée, que le commerce lit.

### 13.0 Ce qui existe (ouvert le 2026-10-21)

- **Le fournil ne connaît aucun réassort** : aucun fichier de `src/production`
  ni de `src/packing` ne le nomme. Tout son circuit est en forme de commande :
  `DayOrdersReader.producibleFor(day)` (`production/channels/commerce/day-orders.reader.ts`)
  rend des `ProducibleOrder` avec `fulfillmentMethod: "pickup" | "delivery"`,
  `clientele`, `sheetDetails` (le bon) — des champs qu'un réassort n'a pas.
- **Le plan se fige** dans `close-production-day.handler.ts` (`closeUnderLock`) :
  verrou, `ProductionDay.close(producible, withdrawn, …)`, journal,
  `production.day_closed`, puis un `production.packing_list_drawn` par commande
  (clé `…:<serviceDay>:<orderId>`), dans une seule unité de travail. La
  feuille compte par SKU (`countOf`, `production-count.ts`), les commandes
  restent détaillées (`ProductionOrder`, sans FK vers `public`).
- **Le colisage** tient `PackingOrder` clé `(serviceDay, orderId)`. On peut y
  mettre MOINS que la quantité : la ligne reste « incomplète »
  (`packing-sheet.ts`, `markByAllocation`) ; plus est refusé. Aucune quantité
  « réellement emballée » n'est publiée.
- **Le transfert interne** porte déjà le genre `resupply`
  (`delivery_internal_transfer_item.kind`, `resupply_id` opaque, CHECK
  exclusif, index partiel `…_resupply_key`) et le domaine le connaît
  (`internal-transfer-state.ts`) ; **aucun écrivain**.
- **Le commerce** : `SiteResupply` (`target: tomorrow | asap`, `serviceDay`,
  `placed`, `cancelled`, `origin`), aucun canal exposé à un autre bloc.

### 13.1 Ce qu'on bâtit

```mermaid
flowchart LR
  C["commerce<br/>SiteResupply envoyé<br/>pour demain"] -->|"DayResuppliesReader<br/>(production/channels/commerce)"| F["fournil — arrêt du plan<br/>production_resupply figé<br/>feuille : section Réassorts + total"]
  F -->|"production.resupply_list_drawn"| P["colisage<br/>fiche « Réassort Village »<br/>quantité réellement emballée"]
  F -->|"production.day_closed"| D["livraison<br/>transfert du Village :<br/>élément kind=resupply"]
  P -->|"PackedResuppliesReader<br/>(packing/channels/commerce,<br/>déclaré ET implémenté par le colisage)"| R["commerce — réception<br/>pré-remplie de l'emballé"]
```

1. **Un canal à part** : `apps/lfd-api/src/production/channels/commerce/day-resupplies.reader.ts`
   — `DayResuppliesReader.placedFor(day)` → `{ resupplyId, siteId, siteLabel,
lines: {sku, productName, quantity}[] }[]`, réassorts **pour demain,
   envoyés, non annulés**. Le commerce l'implémente ; `appBootstrap` relie.
   Jamais mêlé à `ProducibleOrder`. Le « au plus tôt » n'y entre pas (R4).
2. **Figé à l'arrêt**, dans la même unité de travail : tables
   `production.production_resupply` + `_line` (clé `(serviceDay, resupplyId)`,
   aucune FK vers `public`). `ProductionDay` porte `resupplies` à côté
   d'`orders`. Un plan vide de commandes mais avec des réassorts n'est **pas
   vide** (`ProductionDayEmptyError` à revoir). Le compte de commandes du
   journal ne change pas.
3. **La feuille de production** : la section « Réassorts » (par point, par
   produit), et un **total par produit commandes + réassorts** (Q2). Le
   retirage (`absorbArrivals`) n'admet pas de réassort : il naît figé.
4. **Q3 — figé, il ne s'annule plus** : `SiteResupply.cancel` refuse un
   réassort pour demain dont la journée est arrêtée (409, « le plan du
   fournil est arrêté : réceptionnez avec un écart »). Le commerce lit l'état
   du plan par le canal existant (`ClosedPlansReader`, à vérifier au lot).
5. **Colisage** : un fait `production.resupply_list_drawn:<serviceDay>:<resupplyId>`
   publié par le fournil (`production/channels/packing/`) ; le colisage tient
   une fiche de réassort **à part** de `PackingOrder` (tables `packing.packing_resupply`
   - `_line`), titrée « Réassort <point> ». Il saisit la quantité **réellement
     emballée** par ligne (≤ demandée, 0 permis), puis clôt la fiche : le
     `packed` par ligne est écrit. Le Labo y passe aussi (Q1).
6. **Le lecteur de l'emballé (Q4)** : `PackedResuppliesReader`, dans
   `packing/channels/commerce/` (à créer, R3b),
   **déclaré et implémenté par le colisage** (forme des lecteurs d'historique
   du 2026-10-08) : `packedOf(resupplyIds)` → quantités emballées par ligne,
   null tant que la fiche n'est pas close. La matrice gagne `b2b → packing :
port uniquement` ; `packing → b2b` reste interdit. La réception (R2) se
   pré-remplit de l'emballé quand il est connu, sinon du demandé.
7. **Transfert du Village** : à `production.day_closed`, la livraison
   attache au transfert du site un élément `kind=resupply` par réassort de
   ce site (lu par son canal commerce existant, `delivery/channels/commerce/`,
   lecteur à ajouter) ; le manifeste et la feuille de tournée l'affichent
   « Réassort ». Un point servi sur place (Labo) : aucun transfert.

### 13.2 Lots

| Lot     | Contenu                                                                                                                       | Touche                               |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **R3a** | Canal `DayResuppliesReader`, gel à l'arrêt, tables du fournil, feuille (section + total), refus d'annuler une fois figé ; e2e | commerce, fournil, migration         |
| **R3b** | Fait `resupply_list_drawn`, fiche de réassort au colisage, quantité emballée, `PackedResuppliesReader`, réception pré-remplie | fournil, colisage, commerce, matrice |
| **R3c** | Élément `resupply` du transfert du Village, manifeste et feuille de tournée                                                   | livraison, commerce                  |
| **R3d** | Back-office : feuille, poste du colisage, manifeste                                                                           | back-office                          |

`vitruve` avant R3a : il déplace des frontières (une arête `b2b → packing`),
crée des faits durables entre blocs (`@DurableHandler`) et porte des
migrations.

### 13.3 Contredit par `vitruve`, et l'heure de l'arrêt (Hugo, 2026-10-21) — l'emporte sur le §13.1 là où ils divergent

`vitruve` (2026-10-21) : 4 BLOQUANTS — un envoi « pour demain » après l'arrêt
n'est ni figé ni refusé (aucun verrou de journée à l'envoi, `deadline` nulle
« sans limite ») ; l'annulation se croise avec l'arrêt hors verrou ; la
réouverture ignore les réassorts (fiches survivantes, clé de fait sans
`:after-reopening:`) ; la livraison lirait l'état vivant du commerce au lieu
de la liste figée (le fait `production.day_closed` ne porte que des
`orderIds`). 7 SÉRIEUX (total de la feuille et fournées, journée « vide »,
destination de la fiche au colisage, contenu du transfert, porte des blocs,
écran « Réassorts à produire » vivant, réception avant la clôture du colisage).

**Le moment de l'arrêt — la piste retenue, avec l'incertitude de Hugo.**
Trois façons ont été écartées : accepter un envoi tardif et laisser le
retirage l'absorber (dépend d'un clic qu'on peut oublier : 20 croissants
acceptés et jamais produits) ; refuser et proposer « au plus tôt » (R4 non
bâti) ; « pour demain = avant l'heure limite client » (Hugo : « dommage de ne
pas imprimer une seule fois le compte total »). Proposé par Hugo, **retenu
avec réserve** (« je ne sais pas trop si c'est la bonne méthode ») :

- **Deux heures, un seul arrêt.** L'heure limite CLIENT bloque les commandes
  pour demain ; une heure limite du RÉASSORT, plus tardive (la veille, HH:MM),
  bloque les réassorts pour demain ; **le plan s'arrête à la plus tardive des
  deux** — un seul compte total imprimé, une feuille, un dossier, une liste à
  coliser, un transfert.
- Ce qui arrive après l'arrêt passe par le **retirage** du fournil, comme une
  commande hors plan.
- **Révise « une seule heure »** (`../limites-de-commande/plan-une-seule-heure.md`
  §5) : l'arrêt suit la plus tardive des heures limites, et l'écran le dit.
  Tout ce qui se déclenche à l'arrêt (paiements en suspens, liste à coliser,
  composition des tournées) se décale d'autant — à vérifier au lot.
- Le réglage `resupply_subject_to_cutoff` (oui/non) devient une heure du
  réassort, sur la page de l'heure limite.
- L'envoi et l'annulation d'un réassort pour demain passent par le guichet
  d'admission du plan, sous le verrou de la journée (comme `OrderPlanGate`).

**Corrections retenues** : réouverture symétrique des commandes (dégel, retrait
des fiches, suffixe `:after-reopening:`, fiche entamée = pas de réouverture,
annulation de nouveau permise) ; `production.day_closed` gagne `resupplyIds`
(champ ajouté) ; journée vide = 0 commande et 0 réassort ; fiche de colisage
avec destination (transfert ou sur place), dans la progression, les bacs et le
retour ; transfert : l'emballé s'il est connu, sinon le demandé, par
`packing/channels/delivery/` ; second chemin d'attache pour un site sans
commande ; `b2b → packing` dans la porte et la matrice ; « Réassorts à
produire » ne montre plus que le non figé.

**Ouvert** : l'heure du réassort par défaut ; B (fournées cochées sur le
total) ; C (réception faite avant l'emballé : le compte du comptoir fait foi).

**Tranché (Hugo, 2026-10-21)** : heure du réassort par défaut **la veille à
20:00** ; B — les fournées se cochent sur le **total** commandes + réassorts ;
C — la réception faite avant l'emballé : **le compte du comptoir fait foi**.
« Vu que l'arrêt est automatique » : le décaler à la plus tardive des heures
ne demande aucun geste.

**R3a ✅ (bâti le 2026-10-21, non commité)** — ce qui diffère du texte
ci-dessous : la feuille (section « Réassorts » du PDF/écran) n'est pas faite
(R3d) — seul le total des comptes inclut les réassorts ; le retirage n'absorbe
aucun réassort, aucun ne pouvant arriver après l'arrêt (envoi refusé sous le
verrou) — il les garde au compte refait ; l'arrêt les lit SOUS le verrou
plutôt qu'avant + relecture des annulations. Sans heure limite générale,
l'heure du réassort seule n'arrête pas le plan.

**R3a (révisé)** : heure du réassort (réglage, page de l'heure limite ; la
colonne `resupply_subject_to_cutoff` reste en base, documentée à retirer) ;
arrêt automatique à la plus tardive des deux heures ; envoi et annulation d'un
réassort pour demain sous le verrou de la journée (guichet d'admission) ;
`DayResuppliesReader` ; gel dans les tables du fournil ; total des comptes
(fournées) ; journée vide ; réouverture symétrique côté fournil ; retirage qui
absorbe aussi les réassorts arrivés ; `production.day_closed` + `resupplyIds` ;
« Réassorts à produire » limité au non figé.

### 13.4 Après R3a (2026-10-21) — points ouverts et Q1 révisée

**Bâti** : R3a, commit `1b231fadd` (état dans le [README](README.md)).

**Ouvert, noté à la demande de Hugo** :

1. **Aucun recours après l'arrêt.** Le retirage n'absorbe que des commandes,
   et l'envoi « pour demain » est refusé sous le verrou : un réassort ne peut
   plus rejoindre un plan arrêté. Le fournil n'a que « produire hors plan, puis
   envoyer au plus tôt le jour même ». À trancher : cela suffit-il, ou faut-il
   un vrai ajout tardif ?
2. **Heure limite client absente** : l'heure du réassort seule n'arrête pas le
   plan (choix du bâtisseur). Sans objet tant que l'heure limite générale est
   toujours en vigueur (« une seule heure »).
3. **Le refus d'un arrêt anticipé** nomme « l'heure limite générale » même
   quand l'heure du réassort fixe l'arrêt : l'heure est juste, la cause non.
   Corrigé en R3b.
4. **Le décalage de l'arrêt** (balayage des paiements, confirmation des
   commandes, liste à coliser, composition des tournées, dossier du jour)
   n'est pas éprouvé en e2e.
5. **L'arrêt relit toute la liste des réassorts sous le verrou** (lecture d'un
   autre bloc, verrou tenu) plutôt que « lire avant, relire les annulations ».
   À confirmer.
6. La section « Réassorts » de la feuille (écran, PDF) : R3d. Aucun abonné ne
   lit encore `resupplyIds` (R3b, R3c).
7. `site-resupply.ts` (331 lignes) et `prisma-production-day.repository.ts`
   (~350) dépassent 300 lignes.

**Q1 révisée (Hugo, 2026-10-21)** : « le magasin d'usine est aussi le labo de
prod — coliser, c'est coliser pour aller à la pièce du dessus ». Retenu : **un
point qui n'est pas servi par transfert (réglage du site « approvisionné par » : `supply = transfer`) ne passe PAS par le
colisage**. Seuls les réassorts d'un site servi par transfert (Village) ont une
fiche au colisage et une quantité emballée ; ceux du Labo vont de la feuille à
la vitrine, et leur réception reste pré-remplie du demandé (le compte du
comptoir fait foi, C). Révisable : une seule condition dans l'abonné du
colisage.

**R3b ✅ (bâti le 2026-10-21, non commité)** — ce qui diffère du texte :

- Le filtre « servi par transfert » est au **fournil** (figé à l'arrêt,
  `production_resupply.served_by_transfer`, publié pour ceux-là seuls), pas
  dans l'abonné du colisage comme le dit la Q1 révisée. Le réviser reste une
  seule condition, côté fournil (`resupplyListFactsOf`). Un réassort figé
  avant la colonne vaut `false` (aucune fiche).
- La saisie de l'emballé **prend dans la réserve** du colisage
  (`packing_stock.packed`) : refusée si le four n'a pas remis les pièces ; un
  retour du fournil ne les reprend pas. C'est ainsi que la fiche « entre dans
  le retour ».
- **Les bacs : non.** `container` a une clé étrangère vers `packing_order`, et
  `BinDesk`, le chargement et le départ raisonnent par commande — y faire
  entrer une fiche de réassort demande une décision (R3c).
- La clôture est refusée tant qu'une ligne n'est pas saisie (0 explicite).
  Aucun fait à la clôture : le commerce lit l'emballé à la réception.
- Le point 3 ci-dessus est corrigé : le refus nomme l'heure du réassort quand
  c'est elle qui fixe l'arrêt (`planStopOf`).
- Routes : `GET|PUT|POST admin/packing/:date/resupplies…` sous
  `production_packing` ; l'écran est R3d.

**Après R3b (Hugo, 2026-10-21)** : 1 — les bacs du réassort se traitent avec
le transfert (R3c) ; 2 — on ne saisit au colisage que ce que le four a remis :
**validé** ; 3 — les fournées des réassorts d'un point servi sur place (Labo)
ne sont **pas** remises au colisage (elles y resteraient libres sans fiche) :
fait en tête de R3c.

**R3c ✅ (bâti le 2026-10-21, non commité)** — ce qui diffère du texte ou
le précise :

- **Décision 3 d'abord** : une fournée ne remet au colisage que la part du
  colisage ; la part d'un réassort servi sur place monte directement
  (`apps/lfd-api/src/production/domain/services/on-site-share.ts`). **Ordre choisi par le bâtisseur, faute d'écrit** :
  le colisage d'abord, puis le point sur place, puis le surplus au colisage
  (comme avant). Une demande de retour, et la condition « tout rendu » de
  `OnPackingReturned`, portent sur ce qui a été REMIS, pas sur la fournée.
- **Le canal** : point 7 disait « par son canal commerce,
  `delivery/channels/commerce/` » ; bâti par `production/channels/delivery/`
  (`FrozenResuppliesReader`, déclaré ET implémenté par la production) — la
  copie FIGÉE, ce que le §13.3 exige ; `delivery → production` est permis
  par ce canal. L'emballé : `PackedResuppliesReader` réexporté par
  `packing/channels/delivery/` (même classe, aucun port neuf).
- **Second chemin** : un point sans commande reçoit son transfert ;
  `unplacedOn` ne demandait qu'une commande portée, il demande désormais un
  élément porté.
- **Réouverture** : les réassorts sortent du transfert prévu ; le transfert
  (et son arrêt, s'il était placé) reste, même vide — non retiré.
- **Bacs (décision 1)** : aucun changement de schéma. Les bacs d'un
  transfert appartiennent au TRANSFERT (`delivery_bin.transfer_id`, T3), pas
  à ses commandes ; le réassort y part sans contenant au colisage. Si un
  contenant « réassort » est voulu AU COLISAGE (un sac par point), c'est une
  autre décision : `container.resupply_id` + CHECK, non fait.
- **Nom inconnu** : un réassort figé sans nom de point ouvre un transfert
  nommé par l'identifiant du point (rien d'autre n'est sûr dans la
  transaction de l'abonné).
- e2e : `apps/lfd-api/test/resupply-transfer.e2e-spec.ts`.

### R3e ✅ — « Réassort arrivé » : un seul signal, deux gestes (Hugo, 2026-10-21 ; bâti le 2026-10-22, non commité)

« Comment le fournil dit à la boutique Labo : je t'envoie ça ? » — « Ça ne
peut pas être le même signal que dans le cas colisage → Village ? »

Aujourd'hui, un réassort attendu apparaît dans « à réceptionner » (figé au
plan, ou envoyé par le fournil, R1d), mais **rien ne dit qu'il est
physiquement arrivé**. On ajoute un seul signal, quel que soit le chemin :

| Point                         | Ce qui déclenche « arrivé »       | Qui                   |
| ----------------------------- | --------------------------------- | --------------------- |
| servi par transfert (Village) | la réception du transfert au site | le geste du transfert |
| servi sur place (Labo)        | « Monté », sur le réassort        | le fournil            |

Derrière, la même chose : la cloche du back-office sonne au comptoir du point
(« Réassort arrivé — à réceptionner ») et le réassort passe d'**attendu** à
**arrivé** dans la liste à réceptionner.

À vérifier avant de bâtir : la réception d'un transfert au site existe-t-elle
dans le code, ou seulement dans
[`../livraisons/transferts/plan-transfert-interne.md`](../livraisons/transferts/plan-transfert-interne.md) ?

✅ **Bâti le 2026-10-22 (non commité).** La réception existe (lot T2 :
« Remis au site », « Réceptionner » au comptoir). Ce qui précise le texte :

- **État** : `site_resupply.arrived_at` + auteur figé (migration additive
  `20261022130000_le_reassort_arrive`, CHECK entier et « jamais sur une
  demande en cours ») ; `SiteResupply.markArrived` — idempotent, sans effet
  sur un réassort déjà réceptionné, refusé (409) sur une demande en cours ou
  un annulé. Réceptionner reste permis sans le signal.
- **Village** : fait durable `delivery.transfer_received` déclaré dans
  `delivery/channels/commerce/`, écrit par les deux chemins de la réception,
  entendu par le commerce en `@DurableHandler` ; instant et auteur de la
  réception. Un réassort introuvable ou annulé est écarté (journalisé), pas
  relivré sans fin.
- **Labo** : « Monté » sous `production_resupply:write` (le droit de l'envoi
  du fournil), route `POST admin/bakehouse-resupplies/sites/:siteId/:resupplyId/mounted` ;
  carte « À monter » sous la table de l'onglet Réassorts, limitée aux points
  servis sur place (`transferSiteIds` dans la vue). **Choix du bâtisseur** :
  le serveur ne refuse pas « Monté » à un point servi par transfert (seul
  l'écran le réserve), faute d'écrit et parce qu'un « au plus tôt » du
  Village n'a pas de transfert pour le dire arrivé.
- **La cloche** ne cible qu'un droit : `handover_counter:read`, le point dans
  le titre. Lien `/comptoir/reassort`.
- **Limite** : un transfert de réassort seul ne se réceptionne qu'au site
  (« Remis au site ») — « Réceptionner » au comptoir passe par une commande.
  — **Levée le 2026-10-22** (non commité) : la file du comptoir rend le
  transfert de réassort seul, qui se réceptionne par lui-même
  (`POST admin/handover/transfers/:transferId/reception`) ; cf. README.
- Au passage : le cadre du colisage dit « Réassort <point> »
  (`packing-frames.ts`).

### R3d ✅ — Les écrans (Hugo, 2026-10-21 ; bâti le 2026-10-21 — points 1–3 en `7849c011c`, la suite non commitée) — l'emporte sur la ligne R3d du §13.2

« Il faut que j'arrive à visualiser les demandes dans Prod manager ;
`/reassorts-a-produire` n'a pas de sens en autonome, ça devrait être un onglet
de Prod manager, et reprendre la structure de la demande de réassort, en
table. »

- **Prod manager (`/prod-manager`) gagne des onglets** : « Prévisionnel »
  (l'écran actuel) et « Réassorts ». L'entrée autonome
  `/reassorts-a-produire` disparaît du menu et redirige vers l'onglet.
- **L'onglet Réassorts reprend la table de la demande (R1e)** : une ligne par
  produit, les puces de catégorie et la recherche au-dessus ; en colonnes, par
  point (Labo, Village…) les quantités **pour demain** (envoyées, figées ou
  non) et **au plus tôt** du jour affiché ; ruptures et stocks faibles des
  points en marque sur la ligne ; un total par produit. Navigation par
  journée, comme le prévisionnel. L'envoi du fournil (« Envoyer un réassort »,
  R1d) y vit, à la place de la carte actuelle.
- **Le prévisionnel compte les réassorts** : chaque jour à venir ajoute les
  réassorts pour demain envoyés, distingués des commandes (ligne ou teinte à
  part), le total additionne ; le compte de commandes ne change pas.
- **La feuille de production** (écran et PDF) : section « Réassorts » par
  point et produit, en plus du total.
- **Le poste du colisage** : les fiches de réassort (Village) — saisir
  l'emballé, clore.
- **Le transfert** : le réassort dans le manifeste à l'écran (le papier l'a
  déjà depuis R3c).

🟡 **Bâti le 2026-10-21 (non commité) : les trois premiers points.**

- **Prod manager est un espace à routes enfants, comme le comptoir**
  (précision de Hugo pendant le lot) : `/prod-manager/previsionnel`
  (`production_plan:read`) et `/prod-manager/reassorts` (fournée OU
  prévisionnel, le droit de l'ancienne entrée) ; `/prod-manager` ouvre le
  premier onglet permis (`production/prod-manager/`) ; `/reassorts-a-produire`
  et `/production/previsionnel` redirigent vers leur onglet. L'entrée
  « Réassorts » du rail et des tuiles est retirée ; « Prod manager » s'ouvre
  aussi à la seule fournée. L'espace prend `inset: 0` et défile ; le mur du
  prévisionnel prend la hauteur sous la bande.
- **L'onglet Réassorts** (`production/reassorts-a-produire/resupply-production-tab/`) :
  une ligne par produit du catalogue, puces de famille et recherche, une
  colonne « pour demain · envoyé / figé » et « au plus tôt » par point, les
  marques Rupture / Faible (alertes vivantes, tues sur une journée passée), le
  total par produit et de la journée ; la journée dans l'URL (`?day=`, demain
  par défaut) ; « Envoyer un réassort » en tête sous `production_resupply:write`.
  Servi par une route ajoutée, `GET admin/site-resupplies/to-produce/:day`
  (`ResupplyProductionDayView` : `planStopped`, le catalogue) — l'ancienne
  route reste, inchangée. **Lu au commerce, pas à la copie figée** : sous le
  guichet du plan, la liste envoyée d'une journée arrêtée EST la liste figée
  (R3a), et l'onglet a besoin des « au plus tôt », que le fournil ne fige pas.
- **Le prévisionnel compte les réassorts** : port `ExpectedResuppliesReader`
  (`production/channels/commerce/`, implémenté par le commerce,
  `ProductionRangeResupplies`) pour une journée ouverte, réassorts figés lus
  au fournil (`ProductionPlanReader.arrestedResuppliesBetween`) pour une
  journée close — déjà dans son compte, on n'en tire que la part. Le contrat
  gagne `resupplyUnits` (colonne) et `resupplyQuantities` (ligne) ; l'écran
  dit « dont N réassort » dans la case et une ligne « dont réassorts » au pied.
  `orderCount` inchangé.

✅ **Bâti le 2026-10-21 (non commité) : la suite.** Constat de Hugo : « mes
18 sont dans le prévisionnel mais pas au dossier ».

- **Le dossier du jour** : route `GET admin/production/batch/:date/resupplies`
  (fournil) — figés si la journée est arrêtée, envoyés « pour demain » sinon
  (`DayResuppliesReader`, le port de l'arrêt) ; écran : section « Réassorts »
  par point et produit, « envoyés » sur une journée ouverte, « + N pièces de
  réassort » dans la barre, nombre de commandes inchangé ; une journée à
  réassorts seuls n'est plus « rien à produire ». PDF (`v6`) : la section
  sous le récapitulatif, et les pièces au compte du lot. **Choix du
  bâtisseur** : le récapitulatif « À fabriquer » reste celui des commandes
  (avec « + N pièces de réassort » dans son compte), plutôt que d'y fondre
  les réassorts.
- **« Arrêter le plan »** : proposé à une journée de réassorts seuls.
- **Le poste du colisage** : les fiches (bouton « Fiches de réassort »),
  saisie de l'emballé par ligne, clôture.
- **Le manifeste à l'écran** : il montrait déjà la section
  « Réapprovisionnement » remplie par R3c — rien à bâtir que l'avis d'un
  transfert vide. Le mot reste « Réapprovisionnement », comme le papier de
  tournée de R3c (le §13.1 disait « Réassort »). — Passés tous deux à
  « Réassorts » par R1g (2026-10-22).

**Non fait** : la carte d'arrêt de transfert du tableau des tournées compte
les commandes seules (« 0 commande » pour un transfert de réassort). — **Fait le 2026-10-22** (non commité) : « N commandes · M réassorts »
(`resupplyCount`).

### À venir — un onglet « Stock » dans la Supervision (Hugo, 2026-10-21 ; non conçu)

« Il faudra sûrement un onglet stock vision sur Superviseur. » La Supervision
du jour (`/supervision`) regarde, elle n'agit pas : un onglet **Stock** y
montrerait, par point, le stock du jour (somme des reçus), les ruptures et
stocks faibles déclarés, et les réassorts attendus, en route, arrivés et
réceptionnés (ces deux derniers états viennent du signal de R3e). La table
d'action reste dans Prod manager (R3d). À concevoir après R3e.

### R1f ✅ — Une seule colonne de quantité au comptoir (Hugo, 2026-10-21 ; après R3d ; bâti le 2026-10-21, non commité)

« Pourquoi au plus tôt et pour demain sont sur la même page ? Ça nous encombre
visuellement. » Les deux colonnes de R1e reprenaient la demande en cours (R1c),
qui tient les deux visées — un choix de conception, pas une demande.

- **Une seule colonne de quantité**, et un sélecteur **« Au plus tôt · Pour
  demain »** au-dessus de la table, à côté des catégories.
- **Position par défaut selon l'heure limite du réassort** (Hugo) : « Pour
  demain » tant qu'elle n'est pas passée, « Au plus tôt » ensuite. Un clic
  change de visée.
- **Un seul « Envoyer »**, pour la visée affichée.
- L'autre visée, si elle porte déjà des quantités, se signale sur le sélecteur
  (« Pour demain (3) ») : la demande en cours garde les deux, rien ne se perd.
- Aucun changement serveur.

✅ **Bâti le 2026-10-21** (`resupply-stock-table/`) : `fold-view-toggle` à côté
des puces de famille ; l'heure limite est lue dans `tomorrowOrderUntil`, que la
vue des réassorts du site porte déjà (résolue par le serveur depuis
`resupplyCutoffTime`, `null` = sans limite → « Pour demain ») ; l'instant est
une entrée `now` du composant. Une rupture déclarée bascule en « Au plus tôt ».

### R3d-bis ✅ — Le réassort compte sur les fiches de poste (Hugo, 2026-10-21 ; bâti le 2026-10-21, non commité)

« Ça ne me l'a pas ajouté à la fiche de poste viennoiserie ; on doit avoir le
bon de réassort, mais que ça passe quand même dans le compte total. » Tranche
la question laissée ouverte par R3d (récapitulatif « À fabriquer » séparé ou
additionné) :

- **Les fiches de poste (par rayon) et le récapitulatif « À fabriquer » du
  dossier comptent commandes + réassorts** : c'est ce que le poste enfourne.
  La part de réassort peut s'y lire (« dont N réassort »), jamais à part du
  total.
- **Un bon de réassort par réassort** dans le dossier, à côté des bons de
  commande : le point, ses lignes, ses quantités — sans prix. Il remplace la
  section « Réassorts » de R3d dans le PDF si elle fait doublon.

### R1g ✅ — Nommer un réassort (Hugo, 2026-10-21 ; bâti le 2026-10-22, non commité)

« On devrait pouvoir donner un nom à une demande de réassort ou à un réassort,
exemple : vitrine du matin. »

- Un **nom facultatif** sur `SiteResupply` (texte court, ~60 caractères),
  posé sur la demande en cours au comptoir ou à l'envoi du fournil, modifiable
  tant que le réassort n'est pas envoyé.
- Il se lit partout où le réassort se nomme : bon de réassort du dossier,
  onglet Réassorts de Prod manager, fiche du colisage, manifeste, liste « à
  réceptionner » (« Vitrine du matin — Village »).
- Proposé : les noms déjà employés au point sont suggérés à la saisie (pas de
  liste à administrer). Premier pas vers le modèle récurrent (Q-C1, « plus
  tard ») sans le décider.
- Migration additive (une colonne nullable).

✅ **Bâti le 2026-10-22 (non commité).** Décision de Hugo : nom LIBRE,
facultatif, les noms déjà employés au point proposés à la saisie. Ce qui
précise ou diffère du texte :

- **Trois colonnes, pas une** (`20261022120000_le_nom_du_reassort`, additive) :
  `site_resupply.name` (`VARCHAR(60)`, CHECK `site_resupply_name_trimmed` :
  1 à 60 caractères, sans blanc en bord), et ses copies figées
  `production_resupply.name` (à l'arrêt) et `packing_resupply.name` (tirée du
  fait `production.resupply_list_drawn`, qui porte `name` ; un fait publié
  avant le champ se relit sans nom).
- **Le domaine** : `resupplyNameOf` (rogné, blancs intérieurs ramenés à un
  espace, vide → `null`, plus de 60 caractères refusé en 400, jamais
  tronqué) ; `SiteResupply.rename()` sur la demande en cours seulement,
  `sentByBakehouse({ name })` à l'envoi du fournil.
- **Routes** : `PUT admin/site-resupplies/sites/:siteId/drafts/:target/name`
  (`handover_counter:write`, ouvre la demande au besoin, sans version — le
  dernier nom l'emporte) ; `POST admin/bakehouse-resupplies/sites/:siteId`
  accepte `name` ; `GET admin/bakehouse-resupplies/sites/:siteId/names`
  (`production_resupply`). Les noms employés (port `ResupplyUsedNames` :
  distincts, les plus récents d'abord, 20 au plus, brouillons et annulés
  compris) sont aussi dans `SiteResuppliesView.usedNames`.
- **Où il se lit** : vues du comptoir, de la réception (`name`), de
  l'onglet Réassorts (sous le nom du point, la table étant par produit), bon
  de réassort du dossier (écran et PDF `v8` : « Vitrine du matin — Village »),
  fiche du colisage (son titre), manifeste à l'écran et « Ma tournée » (le
  sous-titre de la section cite les noms) et papier de tournée (une ligne
  sous le titre de la section). **Au manifeste et au papier, le nom seul** :
  le transfert est déjà celui d'un point, « — Village » y serait répété.
  Idem à la réception, page d'un seul point.
- **Le nom d'un transfert parti** se lit dans la copie figée du fournil, pas
  dans le manifeste figé au départ : un réassort envoyé ne se renomme plus,
  la copie de l'arrêt est donc le nom envoyé — aucune colonne au schéma
  `delivery`.
- **Au passage** : le manifeste (écran) et le papier de tournée disent
  « Réassorts » (plus « Réapprovisionnement ») ; l'e-mail du dossier compte
  les réassorts comme l'en-tête du PDF (« … — 1 réassort et 58 pièces dont
  18 de réassort », « un bon par commande et par réassort »).
- **Front** : `shared/resupply-name-field/` (`fold-combobox`, texte libre,
  noms proposés) au-dessus d'« Envoyer » dans la table du comptoir (la
  demande de la visée affichée, écrite au champ quitté, à Entrée ou au
  choix d'un nom) et sur la carte « Envoyer un réassort » (envoyé avec le
  réassort).
- e2e : `apps/lfd-api/test/resupply-name.e2e-spec.ts`.

✅ **Bâti le 2026-10-21 (non commité).** Précision de Hugo pendant le lot :
« comprendre le volume global par produit » — chaque produit dit d'abord son
TOTAL, la part de réassort en second.

- **Les fiches de poste** (le récapitulatif par rayon du dossier, écran et
  PDF) additionnent commandes + réassorts : « 42 » en gros, « dont 18
  réassort » dessous ; l'en-tête du rayon « 42 — dont 18 réassort » ; le lot
  « N commandes · M réassorts · P pièces dont Q de réassort ». Un produit de
  réassort seul n'a pas de « N cdes ». **Pas de réutilisation de
  `countsValue`** : le récapitulatif a besoin du nombre de commandes par
  produit, que les comptes n'ont pas ; il additionne les mêmes sources figées
  (commandes et réassorts de la journée). La fiche d'atelier, elle, lit déjà
  les comptes (réassorts inclus depuis R3a) : rien à y changer.
- **Un bon de réassort par réassort** (non fusionnés, par point puis par
  identifiant), après les bons de commande : « Réassort Village », « Par
  transfert » / « Servi sur place », lignes et case « Fait », sans prix ni QR,
  numéroté « réassort 1/2 ». La section « Réassorts » de R3d est retirée **au
  PDF et à l'écran** : à l'écran, le bon vit dans la vue « Bons » (renommée
  depuis « Bons de commande ») ; l'avis « envoyés, figés à l'arrêt » passe en
  tête du récapitulatif.
- PDF en `v7` ; les rayons du PDF sont lus aussi pour les SKU des réassorts.
- **Non touché** : l'e-mail du dossier (`dossierCountsOf`) annonce encore les
  pièces des commandes seules.

### S1 ✅ — L'onglet Stock de la Supervision (conçu le 2026-10-22, après R3e ; bâti le 2026-10-22, non commité)

Conçu à partir de la page ouverte le 2026-10-22
(`apps/lfd-backoffice-frontend/src/app/supervision/supervision-page/`) : la
Supervision est un tableau à trois colonnes (préparation, colisage, retrait),
dont les onglets n'existent qu'en écran étroit (`fold-view-nav`, `tabs()`).

- **Une bascule « Journée · Stock » dans le bandeau**, en large comme en
  étroit, à côté du choix du jour. « Journée » = le tableau actuel, inchangé.
  « Stock » = la vue ci-dessous, pour le jour regardé.
- **Une carte par point** (Labo, Village…), dans l'ordre des points :
  - en tête, les **réassorts du jour** : nom (R1g), visée, état — envoyé,
    figé, **arrivé** (R3e), **réceptionné** (R2) — et l'origine
    (comptoir / fournil) ;
  - puis une **table des produits** du point : stock du jour (somme des reçus
    réceptionnés), alerte en cours (rupture / faible, R1b), et ce qui est
    attendu non encore réceptionné ; tri : alertes, puis attendus, puis le
    reste ; seuls les produits qui ont un reçu, une alerte ou un attendu.
- **Lecture seule** : aucun geste ; un lien « Ouvrir le réassort » mène à
  l'onglet Réassorts de Prod manager (le fournil) — le comptoir agit depuis
  sa page.
- **Serveur** : une lecture `GetDayStockOverview(day)` dans `b2b/resupply`,
  tous points confondus, sous `b2b_supervision:read` (le droit de la page),
  sans écriture ; rafraîchie comme le reste de la Supervision.

✅ **Bâti le 2026-10-22 (non commité)** — état dans le [README](README.md).
Ce qui précise le texte :

- **Route** `GET admin/supervision/stock/:day` (le jour obligatoire : l'écran
  le tient de sa journée), port de lecture `DayStockReader`, calcul pur
  `dayStockOf`.
- **États** : réceptionné › arrivé › figé › envoyé, le plus avancé
  l'emporte ; un annulé n'y est que s'il avait été réceptionné. L'attendu est
  l'emballé au colisage s'il est connu, sinon le demandé.
- **Choix du bâtisseur** : tous les points non archivés ont leur carte, même
  vide ; un point archivé n'y vient que s'il porte quelque chose. En
  « Stock », la recherche et les onglets du téléphone sont masqués (ils
  parlent des colonnes). Le renvoi n'est montré qu'à qui peut ouvrir
  `/prod-manager/reassorts`.
- **Rafraîchi** avec les colonnes, au même mécanisme. Depuis la migration
  `20261022140000_le_reassort_fait_bouger_la_journee` (2026-10-22), les
  écritures du réassort font bouger la version du jour : déclencheurs
  `day_change` sur `site_resupply`, `resupply_receipt` (commerce),
  `production_resupply(_line)` (fournil) et `packing_resupply(_line)`
  (colisage). **Reste une limite** : `site_stock_alert` ne porte aucun jour
  (une alerte vit par point et par SKU, sans `service_day`) — une alerte
  déclarée ne relit l'onglet qu'au prochain mouvement du jour ou au
  rechargement.
