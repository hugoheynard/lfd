# Plan — un seul canal, deux prix

> **2026-09-21.** 📐 Plan, rien n'est bâti. L'existant cité a été **ouvert et
> lu ce jour-là**. Contredit deux fois par `vitruve` ; ce que les versions
> précédentes affirmaient de faux est en **annexe B**.

## 1. En une page

**On sort de Shopify, et on câble le prix public.** Ce sont **deux chantiers
indépendants**, plus un troisième qui ne dépend d'aucun code.

| Chantier                    | Ce que c'est                                                          | Nature       |
| --------------------------- | --------------------------------------------------------------------- | ------------ |
| **A — le prix public**      | le fil transporte le prix du particulier, et la TVA de son contexte   | 🔴 argent    |
| **B — Shopify sort**        | ~11 250 lignes, 4 modèles, 3 secrets                                  | ✅ mécanique |
| **C — les 94 déclarations** | 94 jeux d'allergènes à saisir, sans quoi la boutique montre 1 article | ⏳ humain    |

**Ils ne s'attendent pas.** A et B peuvent partir en parallèle ; C est du travail
de saisie que ni l'un ni l'autre ne débloque — et c'est le chemin critique réel.

⚠️ **La mort de Shopify n'oblige à rien.** Shopify portait bien le prix public
(`channels/shopify/products/projection.ts:22`), mais vers une vitrine qui ne vend
pas : il ne le servait à personne. Sa mort **rend visible** une absence, elle ne
la crée pas.

## 2. Décisions déjà prises

| #      | Décision                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| **D1** | 🔴 Le fil porte **les deux prix** : le **HT** pour calculer, le **TTC** pour afficher.                      |
| **D2** | Les contextes de vente **restent** — ils portent les règles fiscales.                                       |
| **D3** | Rien ne vend sur Shopify aujourd'hui.                                                                       |
| **D4** | La e-boutique ne vend **que de l'à-emporter** aujourd'hui. Le sur place **viendra, par son propre chemin**. |
| **D5** | 🔴 Le fil porte **tous** les taux réglés, en **carte** `{contextKey: percent}` — pas des champs nommés.     |

_(Hugo, 2026-09-21.)_

**D5 découle de D4**, et pas d'un goût : des champs nommés (`takeawayRate`,
`b2bRate`) imposeraient une **v10 du fil** le jour où le sur place arrive. La
carte porte déjà les contextes qu'on ne sert pas encore. C'est d'ailleurs la
règle que le contrat des catégories applique, pour la même raison :

> « Une carte plutôt que trois champs nommés : ajouter un contexte (borne
> libre-service, marché) est **une ligne de données**, et ni ce contrat, ni le
> serveur, ni l'écran n'ont à le connaître pour le transporter. »

---

# Chantier A — le prix public 🔴

## A.0 Le point de départ

`projection.ts:194` :

```ts
const proPrice = proPriceOf(priceCents, policy, vatRatePercent);
```

et `accounting-rules.ts:199` nomme ce premier paramètre **`publicTtcCents`**.

🔴 **Le prix public est déjà là, à l'instant de la projection. C'est l'entrée.**
Seul son dérivé professionnel atteint le fil — `priceMillicents`
(`projection.ts:124`). Le câbler, c'est **cesser de le jeter**.

## A.1 Ce que le fil porte après (D1)

| Sur le fil                     | Unité         | À quoi ça sert                         |
| ------------------------------ | ------------- | -------------------------------------- |
| `priceMillicents` _(existant)_ | millicentimes | le HT **pro** — prix contractuel       |
| **le HT public**               | millicentimes | ce que la chaîne calcule et facture    |
| **le TTC public**              | centimes      | **l'étiquette** — ce que le client lit |
| **le taux, par contexte**      | pourcentage   | `takeaway` ≠ `eatIn` ≠ `b2b`           |

**Les deux prix publics voyagent ensemble**, et c'est délibéré : le TTC est
**posé** par un humain, le HT en est la conséquence. Les séparer obligerait un
des deux bouts à reconstituer l'autre.

> `packages/money/src/millicents.ts` : « Seuls les prix **UNITAIRES DÉRIVÉS**
> [sont en millicentimes]. Un prix qu'un humain pose […] **un tarif de
> catalogue** — reste en centimes. »

**La bascule de version est déjà écrite dans le paquet** :
`CATALOG_SNAPSHOT_VERSION = 8` (`snapshot.ts:24`), le stocké accepte 5-8
(`snapshot.ts:355`), « le schéma du fil reste strict ». **v9** rejoue ce motif —
nouveaux champs `optional()` au stockage, obligatoires à l'émission.

## A.2 🔴 Le point dur — un taux par contexte

`projection.ts:31` :

```ts
const B2B_CONTEXT_KEY = "b2b";
```

et l. 347 : « Le taux du contexte **B2B** — cette projection EST ce canal, donc
elle nomme le sien ».

**Le fil ne porte qu'un scalaire**, le taux `b2b`. C'était juste tant qu'un canal
servait une audience. Dériver un prix public de ce taux-là le rendrait **faux**,
et rien ne le dirait : le montant serait plausible, arrondi au centime, et
facturé.

### Et la commande doit suivre, sinon le trou se déplace

`prisma/schema/public/orders.prisma:473` :

```prisma
vatRatePercent Decimal @map("vat_rate_percent")
```

**Un seul taux, snapshoté sur la ligne de commande**, alimenté par
`CatalogItem.vatRatePercent` (`catalog.prisma:105`) — donc par le taux `b2b`.

Une fois le fil porteur de N taux, la passation doit en choisir **un**, et rien
ne le lui dit. ⚠️ **`quote-order-parity` ne le verrait pas** : il compare le devis
aux colonnes de la commande, et les deux liraient le même mauvais taux. Une
parité verte sur deux erreurs identiques.

**Le chantier A est fini quand la ligne de commande écrit le taux de l'audience
qui l'a passée** — pas quand le prix traverse.

### 🔴 Et la boutique ne SUPPOSE pas son contexte : elle le nomme

C'est le piège de tout le chantier, et il est facile à rater.

Le taux est aujourd'hui **implicitement `b2b`** — parce que le canal était le
canal pro, et que personne n'avait à choisir. Si la boutique publique écrit
**implicitement `takeaway`** parce que c'est le seul qu'on fait (D4), on n'a pas
corrigé le défaut : **on l'a déplacé d'un cran.** Le jour où le sur place arrive,
il se réveille au même endroit — sur la ligne qui facture.

**Le contexte se DÉRIVE du chemin de service, par une fonction pure et unique.**

| Chemin                    | Où l'on consomme    | Contexte   |
| ------------------------- | ------------------- | ---------- |
| Livraison                 | ailleurs, forcément | à emporter |
| Retrait                   | ailleurs (D4)       | à emporter |
| **Sur place** _(à venir)_ | ici                 | sur place  |

Parce que « une carte se définit par **où l'on consomme**, jamais par où l'on
achète » (`contextes-et-points-de-vente.md` §2) — et que le site en ligne y est
nommé comme un chemin d'achat, donc **zéro carte**.

⚠️ **Rien à demander au client.** Le chemin est déjà choisi avant de commander —
`OrderDoors` l'écrit, et rien ne se commande sans lui. Le sur place viendra
« par son propre chemin » (D4) : c'est donc une **troisième porte**, pas une
question de plus greffée sur le retrait.

Aujourd'hui cette fonction rend `takeaway` pour les deux chemins existants, **sa
raison écrite et datée**. Le jour venu, **elle seule change** : le fil ne bouge
pas (D5 le porte déjà), la commande ne bouge pas, la facture ne bouge pas.

## A.3 Les lots

| Lot    | Contenu                                                                                                                              | Ce qu'il casse en chemin                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **A1** | **v9 du fil** — HT public, TTC public, taux par contexte                                                                             | les empreintes de projection ; un aperçu pris avant le déploiement         |
| **A2** | **L'audience et le contexte à la lecture** — `ShopItemView` sert le prix de qui regarde ; le contexte se dérive du chemin de service | ⚠️ un e2e **énumère les clés** de cette vue                                |
| **A3** | 🔴 **L'audience sur la commande** — la ligne écrit le taux de son audience                                                           | `quote-order-parity` : les deux chemins apprennent l'audience **ensemble** |

⚠️ **A2 élargit une surface anonyme.** `packages/contracts/src/shop-catalogue.ts:15` :
« 🔴 Un ÉLARGISSEMENT de cette vue est une décision de sécurité. Elle est servie
sans jeton. »

## A.4 🔴 La question que D1 laisse ouverte, et qu'il faut trancher (D6)

Les deux prix voyagent. **Lequel fait foi pour le total ?**

Ce n'est pas une subtilité. Mesuré par `vitruve` sur la chaîne réelle
(`htMillicentsOf` → total de ligne arrondi au centime → ventilation de TVA), aux
taux 5,5 / 10 / 20 %, prix 0,50 à 30 €, quantités 1 à 24 :

> **19 429 combinaisons sur ~212 000 encaissent un montant différent de
> `étiquette × quantité`** — ±1 centime, **dès la quantité 1**.
> À 5,5 % : étiquette 0,67 € → encaissé **0,68 €**.

⚠️ Ce n'est **pas** la conversion qui perd : l'aller-retour TTC → HT → TTC est
exact (0 écart sur 200 000 valeurs). C'est l'arrondi au centime du **total de
ligne**, avant la ventilation.

Pour un professionnel, sans objet : le HT **est** le prix contractuel. Pour un
particulier, l'étiquette est ce qui est dû — et l'écart se produirait sur la
surface la plus exposée du dépôt.

> `packages/pim-contracts/src/tax.ts` : « **Le TTC fait foi.** C'est le nombre
> qu'un client lit sur l'étiquette et que la caisse encaisse ; le HT en est la
> conséquence comptable. »

**Deux options, et c'est une décision d'argent, pas de code** — voir **D4**.

---

# Chantier B — Shopify sort ✅

## B.1 Ce que ça pèse

| Zone                                     | Lignes      |
| ---------------------------------------- | ----------- |
| `apps/lfd-api/src/pim/channels/shopify/` | 4 154       |
| `.../pim/publication/` (back-office)     | 2 475       |
| `.../pim/integration/` (back-office)     | 1 996       |
| `.../pim/channels/` (clients HTTP)       | 747         |
| `packages/shopify-admin/src/`            | 805         |
| `documentation/pim/shopify-publication/` | 1 081       |
| **Total**                                | **~11 250** |

Plus : 4 modèles + 3 enums Prisma, 3 clés d'environnement, 1 nœud de topologie et
sa sonde, 1 entrée d'audit de démarrage, 1 onglet de rail.

## B.2 🔴 Cinq choses qu'un inventaire naïf ne voit pas

Toutes rouvertes et confirmées le 2026-09-21.

| #   | Le piège                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`pim-contracts/src/shopify.ts` ne se supprime pas.** `FieldDiffView` y est **défini** (l. 79) et `catalog-revision.ts:1` l'importe, comme le domaine des révisions et `revision-diff`. **Le type déménage d'abord.**                                                                                    |
| 2   | **`products-page.ts:29` importe `ShopifyApi`** — un écran du catalogue qui **reste**. Seul import hors des dossiers condamnés.                                                                                                                                                                            |
| 3   | **Le fait de journal `sales_context.*` est VIVANT** et exige `shopifyProjected` (`referential-settings.ts:110,117`). → annexe A.1.                                                                                                                                                                        |
| 4   | **`lint:doc-references` est bidirectionnel, zéro tolérance** sur `documentation/`. **Le lot documentaire part dans le MÊME commit**, pas après.                                                                                                                                                           |
| 5   | **Dispersés, jamais nommés** : `container/worker.ts:103-105`, `packages/ops-contract/src/node.ts:41` (`probeKindSchema` porte `"shopify"`), la section « Intégrations » du formulaire produit, `documentation/pim/shopify-page/` + sa route, `pim/data/models.ts` (`ShopifySettings`), six specs d'`ops`. |

## B.3 L'ordre, et il est contraint

**Écrans → API → contrats → schéma**, chacun au déploiement suivant.

- Les **écrans avant l'API** : les deux se déploient séparément. Un écran qui
  appelle une route disparue est une erreur devant quelqu'un.
- **`@lfd/pim-contracts` après ses deux consommateurs** — même mécanique
  qu'une table : étendre, basculer, resserrer.
- **Le schéma au déploiement suivant** (CLAUDE.md §0), sinon un retour arrière du
  code rencontre une base déjà amputée.

**Hors dépôt** : désinstaller l'application depuis le Dev Dashboard Shopify —
c'est **ce geste** qui révoque l'accès, pas la suppression de nos variables —
puis retirer les trois secrets de GitHub et de Cloudflare.
🔴 **Les secrets ne traversent jamais une ligne de commande.**

## B.4 D2 — les contextes restent, et deux colonnes ne sont pas les contextes

> « j'ai besoin de ces contextes pour mapper des règles fiscales » — Hugo.

**Objection fondée, et elle a attrapé une contradiction interne du plan.**
Tranché, après relevé des lecteurs le 2026-09-21 :

**`SalesContext` n'est pas touché — il est promu.** Il porte les règles fiscales
par `CategoryContextVat` / `ProductContextVat` et par sa clé (`takeaway`,
`eatIn`, `b2b`). Le lot A1 en fait **la chose que le fil transporte** :
aujourd'hui une de ces règles traverse, demain toutes.

**Les deux colonnes, en revanche, ne portent aucune règle fiscale** — et le
dépôt le dit lui-même :

- `domain/value-objects/sales-context.ts:30` : « ⚠️ Ce champ et
  `shopifyProjected` sont le vocabulaire d'**UNE intégration** » ;
- `bootstrap-contexts.ts:60` : « `handleSuffix` est du vocabulaire Shopify ».

Leurs seuls lecteurs non-plomberie : le canal Shopify
(`reconciliation.service.ts:168`, `push.service.ts:316,349`) et **la garde
d'unicité du handle** (`sales-context-support.ts:52,55`,
`prisma-sales-context.repository.ts:59`). Aucun taux, aucune assiette.

🔴 **Mais la QUESTION de `shopifyProjected` survit**, et c'est le fond de
l'objection : _ce contexte donne-t-il lieu à un objet vendable à part ?_ Shopify
y répondait par un produit par contexte. Avec un récepteur unique, elle devient :
**quels contextes la boutique publique expose-t-elle, donc quels taux voyagent ?**

**La colonne n'est donc pas supprimée. Son successeur se définit au lot A1, et
l'ancienne ne tombe qu'après** (→ **D5**).

⚠️ Et son retrait ne sera **pas un `DROP`** : les deux champs sont **obligatoires**
dans `createSalesContextPayloadSchema` / `updateSalesContextPayloadSchema`
(`category.ts:165-167,180-182`), servis à un back-office **en service depuis le
2026-08-17**. Trois déploiements, ~20 fichiers, **les semis compris**
(`seed-pim/corpus.ts:40`, `catalogue.ts:44,51,58`, `registry.ts:95` — qui passent
par le bus, donc par le contrat).

---

# ⏳ Chantier C — les 94 déclarations

`ecrans-du-cycle-catalogue.md` §4 recompte : **95 déclinaisons actives, 1 portant
une déclaration réglementaire, 1 fiche publiable.**

⚠️ **Le verrou existe déjà** : `Product.publish()` refuse une fiche dont une
déclinaison active n'a pas de fiche réglementaire (invariant 7, `product.ts:268`).
Il n'y a **rien à bâtir**.

**Ce qui manque n'est pas du code : ce sont 94 déclarations à saisir.** Tant
qu'elles manquent, la boutique publique n'a **qu'un article** à montrer — quels
que soient les chantiers A et B.

🔴 **C'est le seul lot que ni A ni B ne débloque, et donc le chemin critique
réel.**

⚠️ Chiffres mesurés « sur la base de dev le 2026-09-02 » par le document source.
**La production peut dire autre chose — à recompter avant d'engager.**

---

# Décisions ouvertes

| #       | Décision                                                                                                                          | Poids      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **D6**  | 🔴 **Lequel des deux prix fait foi pour le total ?** (A.4 — 19 429 écarts d'un centime)                                           | argent     |
| **D7**  | 🔴 Le successeur de `shopifyProjected` : quels contextes la boutique publique expose-t-elle ? (B.4, lot A1)                       | contrat    |
| **D8**  | ⏳ Les 94 déclarations : préalable à l'ouverture, ou on ouvre sur ce qui est déclaré ?                                            | calendrier |
| **D9**  | La boutique Shopify a-t-elle été publique assez longtemps pour être indexée ? Si oui, des redirections.                           | SEO        |
| **D10** | `analyse-boutique-publique.md` §1, toujours ouverte : « une facture pour toute vente » contre « pas de factures pour le public ». | métier     |

⚠️ **Un point à VÉRIFIER avant d'écrire une ligne** : les clés des contextes.
`contextes-et-points-de-vente.md` (2026-08-26) donne `takeaway` / `eatIn` ;
le JSDoc de `bootstrap-contexts.ts` parle de `emporter` et `surPlace` « à
traduire avec la tranche d-3 ». Les deux ne peuvent pas être vrais, et une clé
est citée par **trois clés étrangères**. À lire en base, pas à déduire.

---

# Annexe A — les pièges du retrait

Cinq choses qui **ressemblent** à du Shopify sans en être.

## A.1 🔴 Le fait de journal `sales_context.*`

Deux moitiés à ne pas confondre :

- **`tax-regime-retired.ts` est de l'histoire** — des faits passés, plus jamais
  émis. Ses phrases restent, **sous un commentaire daté** qui dit pourquoi elles
  survivent à leur sujet. Sans lui, le prochain nettoyage les emporte — et il
  aura raison.
- **`referential-settings.ts:106-120` est VIVANT.** Les contextes survivent à
  Shopify (B.4) et continueront d'émettre ces faits.

⚠️ **Le modèle de versionnement évident ne s'applique pas.** Les trois faits
`sales_context.*` passent par `labelled()` (`referential-settings.ts:39-41`), qui
**code en dur une histoire à UNE entrée**. `pointOfSaleUpdatedV1` n'a jamais été
`labelled` : il est monté à la main. Versionner demande donc d'abandonner
`labelled()` pour ces faits et d'écrire **deux** entrées d'histoire.

⚠️ Et les champs ne sont pas symétriques : `handleSuffix` est **absent** de
`salesContextCreated`, présent seulement dans `salesContextUpdated.changes`.

Autres lecteurs : `key-labels.ts:197,220`, `referential-vat-phrases.ts:180`, et
`values/referential-values.ts:44` — « les mêmes mots que l'intégration Shopify
(**vérifié le 2026-09-19**) », une justification datée dont l'ailleurs est
supprimé par le chantier B.

## A.2 Les révisions de catalogue

`revisions.prisma:81` : la destination est une chaîne, `b2b` ou `shopify`. Les
révisions passées à destination `shopify` sont de l'histoire — elles ne se
purgent pas, et la colonne reste une chaîne.

## A.3 La porte `lint:pim-data-neutral`

Son commentaire **et son message d'erreur** citeront un exemple mort. La
direction reste vraie, le canal B2B est toujours là : **le commentaire se réécrit
sur le canal survivant, le gate reste.**

⚠️ Elle garantit moins qu'annoncé — elle ne vérifie **que les imports**, pas le
vocabulaire : `pim/data/models.ts` déclare toujours `ShopifySettings`.

## A.4 Les JSDoc du socle

`catalogue/shared/domain/ports/catalogue-reader.ts` justifie **sa propre forme**
par Shopify. Six fichiers de `pim/catalogue/*/domain/` portent le mot. Aucun
couplage de compilation — mais leur ailleurs disparaît.

## A.5 ⚠️ Les portes ne tiennent pas l'assiette

`lint:price-pipeline` compte les appelants de `resolvePrice` ;
`lint:catalogue-authority` interdit de frapper un `CatalogArticle` hors de
`b2b/catalog/` ; `lint:price-door` interdit d'importer `LoadedPricer`. **Aucune
ne connaît l'assiette.**

🔴 **Et les trois ne scannent que `apps/lfd-api/src`** — donc aucune ne verrait un
champ ajouté à `packages/catalog-sync/src/snapshot.ts`, **c'est-à-dire là où le
lot A1 écrit.** La porte qui mord vraiment est `lint:money-units`.

## A.6 Ce qui n'a jamais été du Shopify

`Product.channels` / `soldChannelSchema` sont un couple
**{point de vente, contexte}** (`category.ts:28-37`). Aucune migration.

---

# Annexe B — ce que les versions précédentes affirmaient de faux

Quatre versions en un jour. Ce qui a été corrigé se dit, sinon la faute revient.

| Affirmé                                                                  | Réel                                                                                                                             |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 🔴 « Le prix public part en **HT dérivé** », le TTC se refait à l'écran  | Aucun écran ne remultiplie (`product-tile.ts:64`, `product-sheet.ts:87`, `cart-product-line.ts:63`). **D1 : les deux voyagent.** |
| 🔴 Un « lot verrou allergènes » à bâtir                                  | Le verrou **existe** (`product.ts:268`). Ce qui manque, ce sont **94 saisies**.                                                  |
| 🔴 « Les deux missions sont le même changement »                         | Rien ne vend : Shopify ne servait un prix public à personne. **Chantiers indépendants.**                                         |
| L'audience de la commande est hors périmètre                             | `orders.prisma:473` porte **un** taux par ligne. C'est la colonne qui facture.                                                   |
| « Le HT est tenu par trois portes »                                      | Aucune ne connaît l'assiette, aucune ne scanne `packages/`. → A.5                                                                |
| Le lot supprime « les deux colonnes » de `SalesContext`                  | Contradiction interne, relevée par Hugo. → B.4                                                                                   |
| « `catalogue/*/domain/` ne contient **aucune** occurrence de shopify »   | **6** fichiers. Le grep était en minuscules. 🔴 _Un grep vide n'est pas une absence._                                            |
| `packages/shopify-admin` = 1 870 lignes ; total ~12 300                  | **805** ; **~11 250**. Le reste était `dist/` et `.turbo`.                                                                       |
| « 7 documents » serait une erreur de `documentation/README.md`           | Non : 7 documents **+ le README** = 8 fichiers. **La correction était la faute.**                                                |
| Le lot documentaire vient après le code                                  | `lint:doc-references` est bidirectionnel : **même commit**.                                                                      |
| `capability-audit.ts:196-206` · `ci.yml:181-187` · `products-page.ts:30` | **199-206** · **181-188** · **29**                                                                                               |

---

# Annexe C — ce que ce plan ne porte pas

- **L'assortiment sur la matrice.** `ecrans-du-cycle-catalogue.md` §3 établit que
  `b2b_channel_binding` **duplique** la matrice de vente, et le porte mieux que ce
  plan : sept conséquences, huit appelants nommés, un retrait **irréversible au
  troisième déploiement**.
  ⚠️ Deux pièges à ne pas perdre : le compteur `candidates`
  (`feed-projection.service.ts:131`) est compté **avant** le filtre de matrice —
  s'il y reste, on obtient `candidates = 95` pour `products = []`, le garde de
  `push.service.ts:142` ne se déclenche pas et le pilote `live` **retire tout**.
  Et `stamp()` fait un **`updateMany`** (`push.service.ts:235-243`) : sans ligne
  préexistante il n'estampille rien.
- **La motivation écrite de l'ancre TTC.** `architecture-prix-ancre-ttc.md` fait
  encore de Shopify le bloquant de sa tranche 4, et
  `decision-qui-pose-une-promotion.md` le cite trois fois. Ces justifications se
  périment au chantier B.
- **Non vérifié** : la comptabilité et la facturation n'ont pas été ouvertes.
  `b2b/growth/domain/activity-slice.ts` et `b2b/order-waivers/` lisent
  `vatRatePercent` et ne sont dans aucun inventaire — le lot A3 devra les rouvrir.
