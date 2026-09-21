# Plan — un seul canal, deux prix

> **2026-09-21.** 📐 Plan, rien n'est bâti. L'existant cité a été **ouvert et
> lu ce jour-là**. Contredit deux fois par `vitruve` ; ce que les versions
> précédentes affirmaient de faux est en **annexe B**.

## 1. En une page

**On sort de Shopify, et on câble le prix public.** Ce sont **deux chantiers
indépendants**, plus un troisième qui ne dépend d'aucun code.

| Chantier                 | Ce que c'est                                                                                                    | État                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **B — Shopify sort**     | ~11 250 lignes, 2 contrats, 3 secrets, la sonde et le nœud d'OPS                                                | ✅ **fait**, sauf le schéma |
| **A — le prix public**   | le fil transporte le prix du particulier, et la TVA de **son** contexte                                         | 🔴 argent — prêt à bâtir    |
| **C — les déclarations** | 94 jeux d'allergènes à saisir. **Ne bloque rien** (D10), mais tant qu'ils manquent la boutique montre 1 article | ⏳ humain                   |

**Ils ne s'attendent pas.** B est derrière nous ; A et C avancent en parallèle,
et C n'est pas du code.

✅ **Les dix décisions sont tranchées**, D6 comprise — celle qui avait arrêté le
chantier A le temps d'une mesure. Il reste trois questions de portée technique
(§ A.5), dont une seule pèse.

⚠️ **La mort de Shopify n'oblige à rien.** Sa projection portait bien le prix
public — elle sérialisait le TTC tel quel — mais vers une vitrine qui ne vend
pas : il ne le servait à personne. Sa mort **rend visible** une absence, elle ne
la crée pas.

## 2. Décisions déjà prises

| #       | Décision                                                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **D1**  | 🔴 Le fil porte **les deux prix** : le **HT** pour calculer, le **TTC** pour afficher.                                             |
| **D2**  | Les contextes de vente **restent** — ils portent les règles fiscales.                                                              |
| **D3**  | Rien ne vend sur Shopify aujourd'hui.                                                                                              |
| **D4**  | La e-boutique ne vend **que de l'à-emporter** aujourd'hui. Le sur place **viendra, par son propre chemin**.                        |
| **D5**  | 🔴 Le fil porte **tous** les taux réglés, en **carte** `{contextKey: percent}` — pas des champs nommés.                            |
| **D6**  | 🔴 **Le HT fait foi pour le total.** Pas de TVA par soustraction : on accepte la dérive au centime, **rattrapée en comptabilité**. |
| **D7**  | 🔴 **La boutique publique expose `takeaway`** — pour le moment. Le sur place viendra par son chemin (D4).                          |
| **D8**  | La boutique Shopify **n'a pas été indexée** : aucune redirection à poser.                                                          |
| **D9**  | 🔴 **Pas de facture pour le public** — un **bon de commande chiffré**.                                                             |
| **D10** | **On ouvre sur ce qui est déclaré** — les 94 déclarations ne sont pas un préalable.                                                |
| **D11** | 🔴 **Le prix public est modifiable sur la plateforme**, comme le pro. Et « masquer » devient une décision PAR AUDIENCE.            |

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

`OrderLine` (`prisma/schema/public/orders.prisma`) :

```prisma
vatRate Decimal @default(0) @map("vat_rate") @db.Decimal(5, 2)
```

Sa note dit ce qui compte : « snapshots au moment de la commande — le prix/nom/
TVA du PIM peut changer, la commande garde ce qu'elle a facturé ». Le serveur
**résout** à la passation, puis **scelle** : rien ne rafraîchit ce taux ensuite.

⚠️ Ce passage a cité `orders.prisma:473` jusqu'au 2026-09-21, en le présentant
comme la ligne de commande. C'est `order_late_fee` — la surtaxe de retard. Le
numéro venait d'un rapport de contradiction, recopié sans ouvrir le fichier, et
il a traversé deux documents. **Sur de l'argent, un numéro de ligne se vérifie
ou ne s'écrit pas.**

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
| **A0** | 🛑 **Approfondir** — les dix questions du § A.5, et écrire C dans `@lfd/money`                                                       | rien : c'est ce lot qui dit ce que les suivants cassent                    |
| **A1** | **v9 du fil** — HT public, TTC public, taux par contexte                                                                             | les empreintes de projection ; un aperçu pris avant le déploiement         |
| **A2** | **L'audience et le contexte à la lecture** — `ShopItemView` sert le prix de qui regarde ; le contexte se dérive du chemin de service | ⚠️ un e2e **énumère les clés** de cette vue                                |
| **A3** | 🔴 **L'audience sur la commande** — la ligne écrit le taux de son audience                                                           | `quote-order-parity` : les deux chemins apprennent l'audience **ensemble** |
| **A4** | **Le bon de commande public en TTC** — `order-sheet-pdf.ts` titre « PU HT » / « Total HT » (D9)                                      | le PDF est archivé à sa PREMIÈRE lecture : un ancien reste en HT           |

⚠️ **A2 élargit une surface anonyme.** `packages/contracts/src/shop-catalogue.ts:15` :
« 🔴 Un ÉLARGISSEMENT de cette vue est une décision de sécurité. Elle est servie
sans jeton. »

## A.4 ✅ D6 — tranchée : le HT fait foi, la dérive est acceptée

> « on ne peut pas le faire en soustraction, on accepte un drift minime qui sera
> rattrapé par le comptable » — Hugo, 2026-09-21.

### Ce qui a été mesuré avant de trancher

Trois formes, comparées sur le **code réel** —
[`dev-toolbox/analyses/arrondi-ttc-vs-ht.mjs`](../../dev-toolbox/analyses/arrondi-ttc-vs-ht.mjs) :

| Option                                                | Une ligne            | Panier mélangé       | Avec remise 5 %      |
| ----------------------------------------------------- | -------------------- | -------------------- | -------------------- |
| **A** — le HT fait foi _(le code d'aujourd'hui)_      | **19 429** / 212 472 | **41 669** / 200 000 | **69 709** / 200 000 |
| **B** — le TTC fait foi **au départ**                 | **19 429**           | **41 668**           | **69 557**           |
| **C** — le TTC **porté**, la TVA par **soustraction** | **0**                | **0**                | **0**                |

🔴 **A et B rendent exactement les mêmes écarts.** Le point de départ n'y change
rien : `ventilateVat` termine toujours par `HT + arrondi(HT × taux)`, et tant que
la dernière opération est une multiplication arrondie, l'étiquette ne peut pas
être tenue. **Ce plan s'apprêtait à recommander B** — la mesure a montré qu'elle
ne corrigeait rien du tout.

### Ce qui a été décidé, et c'est A

**C n'est pas retenue.** La TVA se calcule ; elle ne se déduit pas d'une
soustraction. L'écart résiduel se rattrape là où on rattrape les écarts de
centimes : en comptabilité.

Conséquence assumée, écrite ici pour qu'elle ne surprenne personne :

> Sur **environ 9 % des lignes**, le total encaissé diffère d'**un centime** de
> `étiquette × quantité`. À 5,5 % : étiquette 0,67 €, encaissé 0,68 €.

⚠️ **Ce n'est PAS « affiché ≠ payé ».** Tous les montants du panier viennent du
serveur — `shop-quote.service.ts` : « le décompte du panier, tel que le SERVEUR
le rend », « ce qu'il ne décide pas : rien ». Le front **ne multiplie jamais**,
`architecture-prix-boutique.md` §6 le lui interdit. Le client paie ce qu'on lui
montre. L'écart est entre **la vignette et le total** — deux nombres justes que
l'arithmétique mentale ne réconcilie pas, visible à la quantité 1, invisible à
la quantité 12.

### La dérive, mesurée : bornée, mais ORIENTÉE

Deux questions distinctes, et c'est la seconde qui décide de ce que le comptable
rattrape.

**Elle ne s'accumule pas avec la quantité.** À 0,67 € et 5,5 %, les quantités 1
à 12 donnent `[+1 0 +1 0 0 0 0 0 0 0 0 0]`, et le pire écart **jusqu'à la
quantité 1 000 reste 1 centime**.

⚠️ **C'est une propriété de la chaîne, pas un hasard** : il y a **un seul
arrondi**, au total de ligne, et le prix unitaire est gardé en millicentimes en
amont pour ça. `millicents.ts` le dit : « l'arrondir ici multiplierait l'erreur
par la quantité commandée ». Sans cette précaution, la dérive croîtrait avec le
panier.

🔴 **Mais elle est BIAISÉE**, et c'est le vrai sujet :

| Taux  | −1 c   | juste   | +1 c    |
| ----- | ------ | ------- | ------- |
| 5,5 % | 2,27 % | 94,79 % | 2,94 %  |
| 10 %  | 0,00 % | 91,67 % | 8,33 %  |
| 20 %  | 2,77 % | 86,11 % | 11,11 % |

À 10 %, la dérive n'est **jamais** en faveur du client. L'accumulation est donc
**entre les commandes**, pas dans une commande : ~0,08 centime par ligne aux
taux 10 et 20.

**D'où vient le biais** — mesuré, pour ne pas chercher au mauvais endroit : de
l'**arrondi de la TVA**, pas de celui du total de ligne. À 10 %, la ligne
arrondit symétriquement (↑ 41,7 % / ↓ 41,7 %) tandis que la TVA monte 50 % du
temps et ne descend que 33 %.

### Les deux portes fermées, et pourquoi

Il n'existe que trois sorties :

| Sortie                                         | Effet             | Sort                                                                                                                    |
| ---------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Déduire la TVA par soustraction**            | zéro dérive       | ❌ écartée (D6) — la TVA se calcule                                                                                     |
| **Arrondir au demi-pair** au lieu de demi-haut | supprime le biais | ❌ `roundToCents` arrondit **tout l'argent du dépôt**, factures B2B comprises, et le demi-haut est la convention en TVA |
| **Accepter**                                   | ~9 % à +1 c       | ✅ retenue                                                                                                              |

### Ce que ça épargne — 🔴 UN SEUL CALCUL POUR LES DEUX

**Rien ne change dans la chaîne.** `lineTotalCents`, la remise de retrait, les
frais, `ventilateVat`, l'invariant `ensureDiscountMatches` : tous restent en HT,
identiques, **quelle que soit l'audience**. Il n'y a pas une chaîne publique et
une chaîne pro.

La différence n'est plus dans le calcul, elle est dans les **entrées** :

|            | Pro               | Public                           |
| ---------- | ----------------- | -------------------------------- |
| le prix HT | `priceMillicents` | le HT public _(nouveau, lot A1)_ |
| le taux    | contexte `b2b`    | contexte du chemin de service    |

⚠️ **C'est là qu'est tout l'intérêt de D6.** L'option C aurait imposé **deux
ventilations** — une qui multiplie, une qui soustrait — donc deux façons de faire
une facture, avec la garantie qu'un jour l'une dérive de l'autre.

Le TTC voyage (D1) pour être **affiché** — une boutique grand public doit montrer
un prix TTC — et pour rien d'autre.

C'est ce qui fait de A1 un lot de plomberie, et non une refonte de l'argent.

## A.5 Ce que D6 laisse ouvert

**Sept des dix questions que la mesure avait ouvertes tombent avec D6** : la base
de la remise, celle des frais, ce que revérifie l'agrégat, le sens d'une promotion
en pourcentage, la recevabilité comptable d'une TVA par soustraction et la forme
de la facture. Toutes supposaient qu'on change de base. On n'en change pas.

**Il en reste trois, et elles sont petites :**

| #      | Question                                                                                                                                                                                                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q1** | La ligne de commande **stocke-t-elle** le TTC public, ou le recalcule-t-on à chaque relecture d'une commande passée ? (`orders.prisma` est tout HT.)                                                                                                                                                 |
| **Q2** | **Où vit la fonction qui lit les deux entrées** (quel prix, quel taux pour cette audience) ? D6 l'a réduite : ce n'est plus une branche de CALCUL, c'est une lecture de deux champs. Une porte nommée, comme `proPriceOf` l'est pour le prix — sinon elle se duplique entre le devis et la commande. |
| **Q3** | `quote-order-parity` doit tenir **pour les deux audiences**.                                                                                                                                                                                                                                         |

⚠️ **Q3 est la seule qui puisse coûter cher**, et pour une raison qui n'a pas
changé : une parité verte ne prouve pas qu'un montant est juste, seulement que
**deux chemins s'accordent**. Ils s'accorderaient tout aussi bien sur un taux faux.

---

# Chantier B — Shopify sort ✅ **FAIT, sauf le schéma**

> **Exécuté le 2026-09-21.** Six commits, de `00f5891d4` à `a5662c8c4`. Ce qui
> reste tient en deux lignes et est isolé en **B.5**.

## B.1 Ce que ça pesait, et ce qui est parti

| Zone                                     | Lignes      | État                    |
| ---------------------------------------- | ----------- | ----------------------- |
| `.../pim/publication/` (back-office)     | 2 475       | ✅ `e626f50a3`          |
| `.../pim/integration/` (back-office)     | 1 996       | ✅ `e626f50a3`          |
| `.../pim/channels/` (clients HTTP)       | 747         | ✅ `e626f50a3`          |
| `apps/lfd-api/src/pim/channels/shopify/` | 4 154       | ✅ `a5662c8c4`          |
| `packages/shopify-admin/src/`            | 805         | ✅ `a5662c8c4`          |
| `documentation/pim/shopify-publication/` | 1 081       | ✅ archivé, `a5662c8c4` |
| **Total**                                | **~11 250** |                         |

Sont partis avec : les 2 contrats, les 3 clés d'environnement, le nœud de
topologie et sa sonde, la valeur `"shopify"` de `probeKindSchema`, l'entrée
d'audit de démarrage, le relais du container, les 3 secrets du workflow, l'entrée
de rail, l'icône et 2 routes.

⚠️ **Restent : les 4 modèles et 3 enums Prisma** — ils se resserrent au
déploiement SUIVANT, pas dans celui qui cesse de les lire (B.5).

## B.2 🔴 Cinq choses qu'un inventaire naïf ne voit pas

Toutes rouvertes et confirmées le 2026-09-21.

| #   | Le piège                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ✅ **Le contrat du canal ne se supprimait pas tel quel.** `FieldDiffView` y était **défini**, et `catalog-revision.ts` l'importait — comme le domaine des révisions et l'écran qui les compare. Le type a déménagé d'abord (`00f5891d4`), le contrat est parti ensuite.                |
| 2   | ✅ **`products-page` importait `ShopifyApi`** — un écran du catalogue qui **reste**, et le seul import hors des dossiers condamnés. Traité à part (`a339a1617`) : la colonne, la pastille de santé et le ton `alert` d'une ligne sont partis avec.                                     |
| 3   | ⏳ **Le fait de journal `sales_context.*` est VIVANT** et exige `shopifyProjected` (`referential-settings.ts:110,117`). Il se versionne quand la colonne tombe (B.5) — et il faut abandonner `labelled()` pour ces faits, cf. annexe A.1.                                              |
| 4   | 🔴 **`lint:doc-references` est bidirectionnel, zéro tolérance.** **Et le piège s'est refermé** : `e626f50a3` est parti sans que cette porte soit lancée, l'arbre est resté rouge jusqu'à `1c1e28ea2`. Le second lot a corrigé la méthode — 18 références réparées dans le même commit. |
| 5   | ✅ **Dispersés, jamais nommés** : le relais du container, `probeKindSchema`, `documentation/pim/shopify-page/` + sa route, six specs d'`ops`. ⏳ Restent `pim/data/models.ts` (`ShopifySettings`) et la section « Intégrations » du formulaire produit → B.5.                          |

## B.3 L'ordre, et il est contraint

**Écrans → API → contrats → schéma**, chacun au déploiement suivant. ✅ Tenu :
`e626f50a3` (écrans), puis `a5662c8c4` (API + contrats dans le même commit — ils
se déploient ensemble côté serveur).

- Les **écrans avant l'API** : les deux se déploient séparément. Un écran qui
  appelle une route disparue est une erreur devant quelqu'un.
- **`@lfd/pim-contracts` après ses deux consommateurs** — même mécanique
  qu'une table : étendre, basculer, resserrer.
- **Le schéma au déploiement suivant** (CLAUDE.md §0), sinon un retour arrière du
  code rencontre une base déjà amputée.

🔴 **Hors dépôt — PAS FAIT, et c'est le seul geste qui coupe vraiment l'accès** :
désinstaller l'application depuis le Dev Dashboard Shopify. Retirer nos variables
n'éteint que l'appel de notre côté ; le jeton, lui, reste valide tant que l'app
est installée. Puis retirer les trois secrets de GitHub et de Cloudflare.
⚠️ **Les secrets ne traversent jamais une ligne de commande** — ce geste est
celui de Hugo, pas le mien.

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

Leurs seuls lecteurs non-plomberie étaient : deux services du canal Shopify —
parti le 2026-09-21 — et **la garde d'unicité du handle**
(`sales-context-support.ts:52,55`,
`prisma-sales-context.repository.ts:59`). Aucun taux, aucune assiette.

🔴 **Mais la QUESTION de `shopifyProjected` survit**, et c'est le fond de
l'objection : _ce contexte donne-t-il lieu à un objet vendable à part ?_ Shopify
y répondait par un produit par contexte. Avec un récepteur unique, elle devient :
**quels contextes la boutique publique expose-t-elle, donc quels taux voyagent ?**

✅ **Et D7 a répondu : la boutique publique expose `takeaway`, point.** Ce qui
fait que la colonne n'a **pas de successeur — sa question se DISSOUT**, elle ne
se transfère pas :

- _quels contextes une boutique expose_ se lit désormais sur le **point de
  vente**, qui déclare déjà « ce qu'il OFFRE » (`PointOfSale.contexts`) ;
- _quel contexte s'applique à CETTE commande_ se dérive du **chemin de service**
  (§ A.2), et rend `takeaway` aujourd'hui.

Shopify avait besoin du drapeau parce qu'il lui fallait **un produit par
contexte**. Un récepteur unique, dont le snapshot porte tous les taux (D5),
choisit à la lecture — il n'a rien à projeter en double.

**La colonne part donc avec le schéma**, en trois déploiements (B.5), sans que
rien n'ait à la remplacer.

⚠️ Et son retrait ne sera **pas un `DROP`** : les deux champs sont **obligatoires**
dans `createSalesContextPayloadSchema` / `updateSalesContextPayloadSchema`
(`category.ts:165-167,180-182`), servis à un back-office **en service depuis le
2026-08-17**. Trois déploiements, ~20 fichiers, **les semis compris**
(`seed-pim/corpus.ts:40`, `catalogue.ts:44,51,58`, `registry.ts:95` — qui passent
par le bus, donc par le contrat).

## B.5 ⏳ Ce qui reste du chantier B

Deux choses, et elles ne bloquent rien.

### Le schéma — au déploiement SUIVANT

`DROP` de `ShopifySettings`, `ShopifyProductBinding`, `ShopifyVariantBinding`,
`ShopifyPushSnapshot`, et des enums `ShopifySyncStatus`, `ShopifyChannelMode`,
`ShopifyPushOutcome`.

⚠️ **Trois registres tenus à la main suivront, dans le MÊME commit que la
migration** — sans quoi `schema-parity.spec.ts`, qui asserte l'égalité exacte
entre les modèles déclarés et les `@@schema` lus dans les sources Prisma,
devient rouge :

- `platform/database/schema-ops.counter.ts` — les quatre modèles ;
- `pim/infra/database/pim-prisma.service.ts` — les quatre délégués abstraits ;
- `prisma/schema/pim/product.prisma` — les deux back-relations `shopifyBinding`.

⚠️ Et **ni `handle_suffix` ni `shopify_projected` ne tombent avec eux** : ce sont
des champs **obligatoires** d'un contrat servi à un back-office en service (B.4).
Trois déploiements. ✅ **Plus de préalable** : D7 a dissous la question que
`shopify_projected` posait (B.4), et rien ne vient à sa place.

### Les pages de documentation internes

Une dizaine de gabarits du back-office décrivent encore l'architecture avec
Shopify dedans : les trois diagrammes (`system-diagram`, `upsert-diagram`,
`catalogue-to-tool-diagram`), trois pages PIM (`overview`, `bricks`,
`general-settings`), la section « Intégrations » de la fiche produit, la page des
taux de TVA, et `pim/data/models.ts` qui déclare encore `ShopifySettings`.

Ce sont des écrans **lus par le personnel**, pas du code exécuté : ils ne cassent
rien, mais ils décrivent un système qui n'existe plus. C'est le genre de dette
qui ne fait jamais mal assez pour être payée — d'où sa ligne ici.

---

# ⏳ Chantier C — les déclarations d'allergènes

> ✅ **D10 : on ouvre sur ce qui est déclaré.** Ce n'est pas un préalable.

## Ce que cette décision signifie — et ce qu'elle épargne

🔴 **C'est une décision de NE RIEN BÂTIR**, et c'est ce qui la rend bonne.

La porte existe déjà et elle est la bonne : `Product.publish()` refuse une fiche
dont une déclinaison active n'a pas de fiche réglementaire (invariant 7,
`product.ts:268`), et la boutique ne montre que ce qui est publié. « Ouvrir sur
ce qui est déclaré » **est déjà le comportement du code**. Il n'y a ni garde à
poser, ni seuil à régler, ni écran d'attente à dessiner.

L'alternative — attendre les 94 — aurait fait du remplissage d'un tableur le
**bloquant d'un déploiement**, ce qui est le meilleur moyen de faire vieillir du
code fini dans une branche.

## La contrepartie, et il faut la voir

`ecrans-du-cycle-catalogue.md` § 4 recompte : **95 déclinaisons actives, 1
portant une déclaration réglementaire.** Une boutique publique ouverte
aujourd'hui montrerait donc **un article**.

Deux conséquences, qui ne sont pas techniques :

- **Ouvrir n'est pas annoncer.** Le code peut ouvrir ; dire au public que la
  boutique existe est un geste séparé, et il attend un rayon crédible.
- **L'ORDRE de saisie devient une décision commerciale.** Les meilleures ventes
  d'abord : la courbe de remplissage est désormais ce qui pilote le chiffre
  d'affaires de la boutique publique, pas un jalon technique.

⚠️ **Et ces chiffres sont à recompter.** Ils ont été mesurés « sur la base de dev
le 2026-09-02 » par le document source. **La production peut dire autre chose** —
c'est la première chose à vérifier avant de se fier à « un article ».

---

# Décisions ouvertes

✅ **Aucune des onze.** Mais **D11 en ouvre trois de forme** (a, b, c dans sa
section), et elles se tranchent au moment de bâtir, pas avant.

Restent **trois questions de portée technique** (§ A.5), dont une seule pèse :
`quote-order-parity` doit tenir pour les deux audiences — une parité verte ne
prouve pas qu'un montant est juste, seulement que deux chemins s'accordent.

## Ce que D9 entraîne, et qui n'était pas dans le plan

> « pas de facture pour le public, un bon de commande chiffré » — Hugo,
> 2026-09-21.

⚠️ **La « contradiction » signalée par `analyse-boutique-publique.md` § 1 était
une sur-lecture**, et elle est levée : `architecture-facturation.md` écrit « une
facture pour **toute vente**, pas seulement pour le terme différé » — mais la
phrase suivante borne la portée, « une vente **B2B** appelle une facture ». Le
« toute » opposait la carte au terme **à l'intérieur du B2B**, jamais le pro au
public. D9 ne renverse donc rien : elle **nomme** ce que l'autre document n'avait
pas eu à dire.

🔴 **Mais elle ouvre un travail réel** : le bon de commande est **en HT**.
`order-sheet-pdf.ts` titre ses colonnes « PU HT » et « Total HT », et ne porte le
TTC qu'en ligne de total. Servi à un particulier, il doit montrer des prix
**unitaires TTC** — c'est la même exigence que la vignette (§ A.3, lot A2), au
même titre et pour la même raison.

Ce lot appartient au chantier A, il n'existait pas, et il est daté :
**bon de commande public en TTC** (lot A4).

---

# D11 — le prix public se pose aussi sur la plateforme

> « La résolution de prix se fait sur le miroir B2B — elle ne doit pas voir le
> rapport pro/public. Ce rapport n'est qu'une facilité de définition de prix
> avant d'envoyer au B2B. » — Hugo, 2026-09-21.

## Le fait, vérifié

Le rapport pro/public **ne traverse rien** :

- **absent du fil** — aucun `ratioBp`, aucun `ProPricePolicy` dans
  `packages/catalog-sync/src/snapshot.ts` ;
- **absent de la résolution** — `b2b/pricing` n'en connaît aucun. ⚠️ Il y porte
  bien un `ratioBp`, mais c'est `isoRevenueRatioBp`, un rapport d'**élasticité**.
  Même mot, sujet différent, sur de l'argent.

Il est appliqué **une fois**, à la projection, et ce qui part est déjà le prix
pro (vérifié le 2026-09-21).

## Ce que ça change, et c'est une objection qui tombe

Ce plan a soutenu que le prix public ne devait **pas** être modifiable sur la
plateforme, au motif que « l'étiquette est l'ancre — en poser une seconde ici
ferait deux TTC publics qui divergeraient ».

🔴 **C'est faux, et c'est la remarque ci-dessus qui le montre.** Si le rapport
n'est qu'une commodité de saisie, alors sur le miroir les deux prix sont
**symétriques** :

|        | Ce que le miroir reçoit                   | Ce que c'est                           |
| ------ | ----------------------------------------- | -------------------------------------- |
| pro    | `priceMillicents`                         | l'étiquette **dérivée** par un rapport |
| public | `publicByContext.<contexte>.htMillicents` | l'étiquette **dérivée** par un taux    |

**Ni l'un ni l'autre n'est l'ancre.** L'ancre reste dans le référentiel — le TTC
qu'un humain tape. Les deux qui arrivent ici sont déjà des prix de canal,
calculés une fois. La plateforme est donc aussi légitime à poser le sien pour le
public qu'elle l'est pour le pro.

L'objection reposait sur une asymétrie qui n'existe pas.

⚠️ Et ça nomme enfin ce qu'est le rapport : **un outil de saisie**, qui évite de
taper 94 prix deux fois. Pas une règle de tarification. Poser un prix public à
la main sur la plateforme ne contredit donc rien — c'est faire pour le public ce
qu'on fait déjà pour le pro.

## Ce que ça entraîne

`CatalogItemOverride` porte aujourd'hui **une** décision de prix et **un**
masquage, dans un monde qui a désormais deux audiences.

| Sur l'override | Aujourd'hui                                              | Après                        |
| -------------- | -------------------------------------------------------- | ---------------------------- |
| le prix décidé | `priceMillicents` — le pro                               | + un prix **public**         |
| `isHidden`     | masque des **deux** boutiques                            | un masquage **par audience** |
| `isFeatured`   | ⚠️ même question, jamais posée — « en avant » pour qui ? | à trancher                   |

⚠️ **Le masquage est le plus urgent des trois**, et il est déjà faux
aujourd'hui : `listSellable` lit `isHidden` quelle que soit l'audience. Un
conditionnement de 40 pièces n'a rien à faire en vitrine publique, et une pièce
à l'unité n'intéresse pas un pro — ce sont deux décisions, et il n'y a qu'un
bouton.

## L'écran qui les porte

> « Cette vue ne reflète plus la réalité. » — Hugo, 2026-09-21.

`b2b/catalogue` décrit un monde à un seul prix. Ce qui suit est du vocabulaire,
et tient en une passe :

- **« Prix B2B » → « prix pro »** — colonne, phrase d'aide, filtre « À prix B2B » ;
- une colonne **« prix public »** à côté, avec « modifier » et « revenir au PIM » ;
- **le menu : « Catalogue » → « Catalogue actuel en ligne ».** Mieux que
  cosmétique : l'entrée juste au-dessus s'appelle « Réception », et la paire
  dirait enfin ce qu'elle est — _ce qui attend_ contre _ce qui est en ligne_.

## Ce qui reste à trancher

| #     | Question                                                                                                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **a** | Le prix public posé ici est-il un **TTC** ? D1 dit que l'étiquette est un TTC en centimes, et `@lfd/money` réserve les millicentimes aux dérivés — un prix qu'un humain pose ici devrait suivre la même règle. |
| **b** | `isFeatured` suit-il le même découpage que `isHidden` ?                                                                                                                                                        |
| **c** | Le masquage par audience arrive-t-il **avant** le prix public ? Il est déjà faux aujourd'hui, l'autre ne l'est pas encore.                                                                                     |

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
