# Le prix — ce qui reste à faire

**Ouvert le 2026-09-09.** 🔴 **Le seul registre du dossier.** Tout ce qui était
ouvert ailleurs — audits, feuille de route, état des lieux — a été rapatrié ici.

> ## Pourquoi un seul document
>
> Le travail restant vivait dans **quatre** endroits : deux audits, une feuille
> de route, un état des lieux. Chacun tenait sa propre liste, avec sa propre
> date, et **trois d'entre elles annonçaient comme ouvert ce qu'un autre avait
> refermé**. Une liste qu'on ne peut pas croire ne se lit plus.
>
> Les documents d'origine gardent leur **raisonnement** — c'est ce qui vaut chez
> eux. Ils ne gardent plus leur liste : ils renvoient ici.
>
> ## Comment chaque ligne a été établie
>
> **Toutes vérifiées contre le code le 2026-09-09**, pas relues. Chaque entrée
> dit _où_ — un fichier ouvert, une porte lancée, un `grep` posé. Les six qui
> ont été refermées depuis leur écriture sont au §5, avec la preuve : une liste
> qui ne fait que grandir n'est pas un registre, c'est un cimetière.

---

## 1. Le tableau, en un écran

| #       | Ce que c'est                                               | Gravité | Coût            |
| ------- | ---------------------------------------------------------- | ------- | --------------- |
| **R1**  | Un prix ramené à zéro **tue la commande**                  | 🔴      | un commit       |
| **R2**  | La simulation rejoue les paliers **dans le navigateur**    | 🔴      | conception      |
| **R3**  | Rien ne prouve que le devis **boutique** prédit la facture | 🟠      | un commit       |
| **R4**  | Le client peut payer autre chose que ce qu'il a vu         | 🟠      | conception      |
| **R5**  | L'ajustement de zone n'est pas figé sur la commande        | 🟠      | migration       |
| **R6**  | L'engagement de volume n'a **aucun écran**                 | 🟠      | un lot front    |
| **R7**  | Le cache suppose **une seule instance** de l'API           | 🟡      | conception      |
| **R8**  | Aucune porte sur `prisma.<modèle>` hors contexte           | 🟡      | une porte       |
| **R9**  | 19 conversions de jour en minuit UTC, hors tarification    | 🟡      | inventaire fait |
| **R10** | `PriceTemplate.archive()` est du code mort                 | 🟡      | trivial         |
| **R11** | Le volume prévu appartient au gabarit, pas au client       | 🟡      | conception      |
| **R12** | Trois requêtes de production jamais lancées                | 🟡      | trois `psql`    |
| **R13** | Prix vivant / prix bloqué — **rien n'est tranché**         | 🔵      | décision        |
| **R14** | Les conditionnements — conception **périmée**              | 🔵      | à réécrire      |

**Rien de tout cela ne fausse un prix résolu.** Le moteur est propre : une seule
porte sur `resolvePrice`, quatre étages composés en rationnel exact, un arrondi,
une trace figée. Ce qui reste est **autour** — à la frontière moteur → commande,
dans ce qu'aucun test ne tient, et dans ce qu'une facture ne pourra pas relire.

---

## 2. Les défauts — ce qui casse aujourd'hui

### R1 🔴 Un prix ramené à zéro tue la commande

**Le fait, vérifié le 2026-09-09.** `resolvePrice` ramène à zéro un prix passé
sous zéro et le consigne (`clampedToZero`). Mais
[`order-line.ts:126`](../../apps/lfd-api/src/b2b/orders/domain/value-objects/order-line.ts)
ne lit que `floored` :

```ts
if (!trace.floored && expected !== input.unitPriceMillicents) {
  throw new InvalidOrderLineError(...);
}
```

Une règle « −5 € » sur un article à 2,00 € donne `final: 0`, `floored: false`,
dernier étage à `−300 000` — et la ligne **refuse d'être créée**. Un 500 sur le
chemin qui encaisse, pour une remise qu'un commercial a le droit de saisir.

**Ce qui a changé et rend le remède plus court.** `PricedArticle.clampedToZero`
existe depuis le 2026-09-09 et traverse le tarificateur. Il ne reste qu'à le
faire entrer dans `OrderLinePricingTrace` et à l'apprendre à `assertConsistent`.

**Le remède.** Un commit : le champ dans le contrat, la condition qui l'ajoute,
un test de non-régression nommé d'après le symptôme.

### R2 🔴 La simulation rejoue les paliers dans le navigateur

**Le fait, vérifié le 2026-09-09.**
`apps/lfc-B2B-admin-frontend/src/app/commercial/tarification/simulation/` résout
un prix **côté client**, sans jamais appeler le serveur :

- `revenue-model.ts` expose `unitPriceMillicentsAt(...)`, et sa ligne 234 fait
  `Math.round(revenueMillicentsAt(...) / volume)` ;
- `pricing-regime.ts` réimplémente les trois régimes d'engagement — son propre
  JSDoc écrit « c'est exactement ce que fait le moteur » ;
- aucun appel HTTP dans le dossier.

C'est la **cinquième occurrence** du motif que
[`ecrans-de-tarification.md`](ecrans-de-tarification.md) nomme et dont il raconte
trois cas. Le serveur répond pourtant à cette question exacte, par
`priceAtCumulative`.

**Atténuation, et elle est réelle.** C'est un écran de **simulation**,
explicitement hypothétique : il n'annonce pas un prix que la caisse facturerait.
Mais il annonce un chiffre d'affaires sur lequel un commercial décide d'accorder
une grille, et rien ne garantit qu'il tombe d'accord avec le moteur.

**Le remède, à trancher.** Soit la simulation passe par la projection du serveur
— attention, elle est interactive, un aller-retour par curseur déplacé serait
une régression d'usage —, soit son moteur descend dans un paquet pur que les
deux côtés importent. C'est ce qui a déjà marché deux fois (`@lfd/money`).
**Touche l'argent : `vitruve` avant de bâtir.**

### R3 🟠 Rien ne prouve que le devis boutique prédit la facture

**Le fait, vérifié le 2026-09-09.** Le côté **admin** est couvert :
`admin-place-order.e2e-spec.ts` compare le devis à la commande réelle. Le côté
**boutique** — la surface publique — ne l'est pas : `shop-quote.e2e-spec.ts` ne
passe aucune commande, et aucun e2e ne compare `POST /shop/quote`.`totalCents` à
`orders.total_cents` sur le même panier.

L'invariant est tenu **par construction** — même `ventilateVat`, même
`CartAdjustments`, même `OrderLinePricing`. Une construction partagée le rend
_probable_ ; un test le rend _tenu_.

**Le remède.** Un e2e, et un seul : un panier, le devis, la commande, les deux
totaux comparés au centime — en retrait avec remise, et en coursier avec frais.

---

## 3. Les trous — ce qui coûtera cher plus tard

### R4 🟠 Le client peut payer autre chose que ce qu'il a vu

**Le fait, vérifié le 2026-09-09.** L'idempotence de passation est **livrée**
(`idempotencyKeySchema`, `order.ts:294`) — c'est la moitié de ce trou qui s'est
refermée. En revanche `expectedTotalCents` **n'existe nulle part** dans
`packages/contracts` ni dans l'API.

En règlement **au compte**, une promotion qui expire entre le devis et le clic
change le total en silence. Par carte, `amountCents` est montré avant Stripe :
le trou ne concerne que le compte.

**Le remède.** `expectedTotalCents` sur `POST /orders`, et un refus explicite si
le total a bougé. La décision de fond — qui porte le risque d'un prix qui bouge —
est dans
[`architecture-prix-vivant-prix-bloque.md`](architecture-prix-vivant-prix-bloque.md),
et elle n'est **pas prise** (cf. R13).

### R5 🟠 L'ajustement de zone n'est pas figé sur la commande

**Le fait, vérifié le 2026-09-09** dans `schema.prisma` :

| Ce qui est figé                                       | État          |
| ----------------------------------------------------- | ------------- |
| `vatShares` — la TVA **par taux**                     | ✅ 2026-09-07 |
| `discountAdjustment` — ce qui a produit la remise     | ✅            |
| `lateFeeAdjustment` — ce qui a produit la surtaxe     | ✅            |
| l'ajustement de zone qui a produit `deliveryFeeCents` | ❌            |

`deliveryFeeCents` est un nombre nu, et `zone.fee` est **mutable** : une facture
émise dans six mois ne pourra pas nommer les frais qu'elle chiffre.

**Le remède.** Une migration **additive** — `deliveryFeeAdjustment Json?`, comme
ses deux voisins. La poser maintenant, tant que les commandes sont peu
nombreuses, coûte une colonne ; la poser après coûte une reprise.

### R6 🟠 L'engagement de volume n'a aucun écran

**Le fait, vérifié le 2026-09-09.** `apps/lfc-B2B-admin-frontend/.../tarification/`
contient `gabarits`, `grille`, `pose-bar`, `simulation` — **pas d'engagement**.
Le backend a pourtant tout : agrégat, dépôt, routes, `retainedQuantity`.

Un engagement se signe donc en base, à la main. C'est le mécanisme qui fait
qu'un client paie le palier de sa **promesse** dès sa première commande — la
partie du moteur qui décide le plus, et celle que personne ne peut manipuler.

### R7 🟡 Le cache suppose une seule instance de l'API

**Le fait, vérifié le 2026-09-09.** `pricing-materials.cache.ts` n'a que
`invalidate()` / `clear()` : aucune estampille, aucune coordination. `ops` dit
« max 1 » aujourd'hui, par décision de routage.

Le jour du passage à deux instances, ce n'est pas une lenteur : c'est un **prix
faux** servi jusqu'au redémarrage.

**Le remède.** Une estampille — le dernier `pricing_events.id`, lu par requête —
garderait le cache sûr pour **une** lecture au lieu de trois.

---

## 4. Les garde-fous qui manquent

### R8 🟡 Aucune porte sur `prisma.<modèle>` hors du contexte propriétaire

`lint:cross-schema-join` lit le SQL **écrit à la main**.
`lint:context-boundaries` lit le **graphe d'imports**. Ni l'un ni l'autre ne voit
une classe qui interroge en Prisma direct les tables d'un domaine qui n'est pas
le sien — et `CLAUDE.md` écrit que **c'est arrivé deux fois**.

**Ce que ça ne fermerait pas**, et qu'il faut dire : la frontière reste une
discipline de **découpe**. Une seule base, une seule URL, un seul client — une
jointure `b2b → pim` marcherait. La porte la rend visible, pas impossible.

### R9 🟡 Dix-neuf jours convertis en minuit UTC, hors tarification

`lint:business-day` couvre les **fenêtres tarifaires** et rien d'autre. Les 19
autres sites sont inventoriés et triés dans
[`../todos/todo-jours-convertis-hors-tarification.md`](../todos/todo-jours-convertis-hors-tarification.md)
— **aucun défaut avéré**, deux questions ouvertes. Cité ici pour que ce registre
soit complet, pas parce qu'il y a du travail immédiat.

---

## 5. Les petits, et les décisions

| #       | Le fait                                                                                                                                                                                                                                                                                                   | Ce qui le ferme                                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **R10** | 🟡 `PriceTemplate.archive()` n'est appelé de nulle part (vérifié par `grep`, hors tests) — du code mort qui a l'air vivant                                                                                                                                                                                | Le supprimer, ou lui donner sa route. Pas les deux.                                                                           |
| **R11** | 🟡 `plannedVolume` est stocké dans la **grille**. Un gabarit posé chez trois clients porte une seule hypothèse de saison — toute la simulation décrit alors le gabarit, jamais le client qu'on a en face                                                                                                  | Le volume prévu devient une donnée **du client**. La base le connaît déjà (`prisma-customer-volume.reader.ts`). Voisin de R2. |
| **R12** | 🟡 Trois requêtes de production **jamais lancées**, en lecture seule, détaillées au §A.1 de [`audit-calcul-du-panier-et-du-prix.md`](audit-calcul-du-panier-et-du-prix.md) : les paliers sous le centime (`D10`), les articles qui quittent la vitrine (`D8`), les remises qui dépassent le panier (`P4`) | Le `.env` local pointe `localhost` ; elles demandent un accès prod.                                                           |
| **R13** | 🔵 **Prix vivant / prix bloqué** — [le document](architecture-prix-vivant-prix-bloque.md) pose la question « qui porte le risque d'un prix qui bouge », et **zéro code** en découle. R4 en dépend                                                                                                         | Une décision de Hugo, pas un lot.                                                                                             |
| **R14** | 🔵 **Les conditionnements** — [le document](architecture-conditionnements-pricing.md) date du 2026-08-04 et affirme que « le PIM ne porte AUJOURD'HUI ni prix ni `unitsPerPack` ». **C'est faux depuis le 2026-08-31** : `ProductVariant.priceCents` existe                                               | À réécrire sur l'existant, ou à archiver. En l'état il ferait construire contre le modèle en place.                           |

---

## 6. Ce qui a été refermé, et qu'on ne réouvre pas

Six entrées portées comme ouvertes par les documents d'origine **ne le sont
plus**. Elles sont ici avec leur preuve, pour que personne ne reparte les faire.

| Portée comme ouverte par                              | En fait                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `audit-fable.md` §1 — « `lint:gates` échoue »         | ✅ `clock-port` est verte : « les 1263 fichiers de production lisent le temps par le port ».                       |
| `audit-fable.md` B3 — « un gabarit se pose à moitié » | ✅ Fermé le 2026-09-08, **sans transaction** : une mercuriale est UNE ligne, donc atomique par construction.       |
| `audit-fable.md` P1 — « rien ne borne la quantité »   | ✅ `MAX_LINE_QUANTITY`, `MAX_ORDER_LINES`, et `lines` plafonné à 100 sur `/shop/quote`.                            |
| `durcir-le-calcul-des-prix.md` chantier 1             | ✅ Livré le 2026-09-09. Cinq appelants de `resolvePrice` → **un**, et `lint:price-pipeline` est à **1 entrée**.    |
| `durcir-le-calcul-des-prix.md` chantiers 2 et 5       | ✅ `lint:business-day` sur les fenêtres tarifaires, et `pricing-budget.e2e-spec.ts` qui compte les opérations ORM. |
| `etat-des-lieux-mercuriale-client.md` T7              | ✅ Les bornes de fenêtre passent par `businessDayStart` ; la porte le tient.                                       |

⚠️ **Le chantier 4 de `durcir` n'est fermé qu'à MOITIÉ**, et je l'avais annoncé
fermé. Ce qui l'est : l'écart au tarif, descendu dans `@lfd/money` (`gapBp`,
`discountBp`, `averageGapBp`). Ce qui ne l'est pas : son propre critère de
clôture — _« aucun `Math.round` sur un prix dans un composant Angular »_ — que
**R2** met en défaut.

---

## 7. L'ordre, et pourquoi

1. **R1** — c'est le seul qui produit un **500** sur le chemin qui encaisse, et
   il coûte un commit maintenant que `clampedToZero` traverse le tarificateur.
2. **R3** — un commit, et il tient l'invariant de tout le dossier sur la seule
   surface publique.
3. **R5** — une migration additive. Elle coûte une colonne aujourd'hui et une
   reprise dans six mois ; c'est le seul item dont le prix augmente avec le
   temps.
4. **R13 puis R4** — la décision d'abord, le mécanisme ensuite. Les prendre dans
   l'autre sens coderait une réponse à une question qu'on n'a pas posée.
5. **R2** — conception, `vitruve`, puis un lot front. Le plus gros du reste.
6. **R6**, **R7**, **R8** — ils protègent l'avenir plutôt que le présent.

**Ce que je ne ferais pas.** Toucher au moteur. Il a une seule porte, une trace
figée, des contraintes d'exclusion qui rendent le chevauchement impossible, et
49 tests neufs qui mordent — vérifié par mutation le 2026-09-09. Tout ce qui
reste est autour de lui, et c'est là qu'il faut travailler.
