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

| #       | Ce que c'est                                               | Gravité | Coût                   |
| ------- | ---------------------------------------------------------- | ------- | ---------------------- |
| ~~R1~~  | ~~Un prix ramené à zéro tue la commande~~                  | ✅      | **clos le 2026-09-09** |
| **R2**  | La simulation rejoue les paliers **dans le navigateur**    | 🔴      | conception             |
| ~~R3~~  | ~~Rien ne prouve que le devis boutique prédit la facture~~ | ✅      | **clos le 2026-09-09** |
| **R4**  | Le client peut payer autre chose que ce qu'il a vu         | 🟠      | conception             |
| ~~R5~~  | ~~L'ajustement de zone n'est pas figé sur la commande~~    | ✅      | **clos le 2026-09-09** |
| **R6**  | L'engagement de volume n'a **aucun écran**                 | 🟠      | un lot front           |
| ~~R7~~  | ~~Le cache suppose une seule instance de l'API~~           | ✅      | **clos le 2026-09-09** |
| ~~R8~~  | ~~Aucune porte sur `prisma.<modèle>` hors contexte~~       | ✅      | **clos le 2026-09-09** |
| **R9**  | 19 conversions de jour en minuit UTC, hors tarification    | 🟡      | inventaire fait        |
| **R10** | `PriceTemplate.archive()` est du code mort                 | 🟡      | trivial                |
| **R11** | Le volume prévu appartient au gabarit, pas au client       | 🟡      | conception             |
| **R12** | Trois requêtes de production jamais lancées                | 🟡      | trois `psql`           |
| **R13** | Prix vivant / prix bloqué — **rien n'est tranché**         | 🔵      | décision               |
| **R14** | Les conditionnements — conception **périmée**              | 🔵      | à réécrire             |

**Cinq entrées sont closes le jour même de ce registre** — R1, R3, R5, R7 et R8.
Il reste **neuf** entrées, dont deux décisions et deux documents à réécrire. Elles restent listées avec leur preuve plutôt que retirées :
une entrée effacée est une entrée que quelqu'un rouvrira.

**Rien de ce qui reste ne fausse un prix résolu.** Le moteur est propre : une seule
porte sur `resolvePrice`, quatre étages composés en rationnel exact, un arrondi,
une trace figée. Ce qui reste est **autour** — à la frontière moteur → commande,
dans ce qu'aucun test ne tient, et dans ce qu'une facture ne pourra pas relire.

---

## 2. Les défauts — ce qui casse aujourd'hui

### ~~R1~~ ✅ Un prix ramené à zéro tue la commande — **clos le 2026-09-09**

**Ce que c'était.** `resolvePrice` ramenait bien à zéro un prix passé sous zéro
et le consignait (`clampedToZero`), mais la trace **figée sur la ligne** ne
portait pas ce champ. `assertConsistent` ne lisait que `floored` : une remise
« −5 € » sur une baguette à 2,00 € produisait un dernier étage à −300 000 en
face d'un prix facturé à 0, écart que rien n'expliquait, et la ligne **refusait
d'exister**. Un **500** sur `POST /orders`, pour une remise qu'un commercial a
le droit de saisir — et que rien à la saisie ne peut refuser, puisque le prix
canonique varie d'un article à l'autre.

**Ce qui a été fait.** Le champ traverse désormais toute la chaîne : le contrat
(`OrderLinePricingTrace.clampedToZero`), la colonne
(`order_lines.pricing_clamped_to_zero`, migration **additive**, `NULL` = ligne
antérieure), l'écriture, la lecture, et `priceLine` qui le remplit depuis le
tarificateur.

🔴 **Et le contrôle est devenu plus STRICT, pas plus permissif.** Un
ramené-à-zéro n'éteint pas `assertConsistent` : il déplace ce qu'elle exige — la
chaîne doit réellement finir **sous zéro** et la ligne facturer **zéro**. Le
rendre permissif aurait fait de ce champ la façon d'écrire n'importe quel prix
sans que la trace ait à s'accorder.

**Ce qui le tient.** Trois cas unitaires sur `OrderLine.create` — celui qui
échouait avant le correctif, celui qui refuse un ramené-à-zéro incohérent, et
celui qui laisse passer une trace antérieure — plus **deux e2e** sur la vraie
base : la commande à zéro passe, et le plancher garde le dernier mot quand il
est posé. Vérifié par mutation le 2026-09-09.

⚠️ **`null` n'est pas `false`.** Une ligne ramenée à zéro _puis_ relevée par un
plancher pouvait s'écrire avant cette date sans que rien ne le consigne : un
`DEFAULT false` aurait transformé cette ignorance en affirmation sur les seules
lignes qu'on ne peut plus vérifier.

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

### ~~R3~~ ✅ Rien ne prouve que le devis boutique prédit la facture — **clos le 2026-09-09**

**Ce que c'était.** « Un devis qui ne prédit pas la facture ne sert à rien » est
_l_'invariant de toute la chaîne, et il n'était tenu **que par construction** :
même `ventilateVat`, même `CartAdjustments`, même `OrderLinePricing`. Le côté
admin était couvert ; le côté **boutique** — la surface publique — ne l'était
pas. `shop-quote.e2e-spec.ts` vérifiait des nombres, `orders.e2e-spec.ts` en
vérifiait d'autres, **aucun ne faisait les deux sur le même panier**. Rien
n'aurait rougi si quelqu'un ajoutait un terme d'un seul côté.

**Ce qui a été fait.** `test/quote-order-parity.e2e-spec.ts`, quatre cas.

🔴 **Il compare la BASE, pas deux réponses HTTP.** Le devis est une vue ; la
facture est ce qui est **écrit**. Confronter deux vues laisserait passer un total
juste rendu et mal enregistré — or ce sont les colonnes qu'un document comptable
relira.

Et il compare **chaque** montant, pas seulement le total : une remise trop forte
annulée par des frais trop élevés donne le bon total et deux lignes fausses sur
le document que le client reçoit. Le quatrième cas descend jusqu'à la
**ventilation par taux**, parce que deux taux qui se compensent d'un centime
donnent la même somme et deux lignes fausses.

**Le panier est choisi pour casser** : deux taux — sans quoi la remise au prorata
et l'arrondi par groupe ne s'exercent pas — et deux quantités différentes, pour
l'arrondi de ligne. Un troisième cas ouvre un **barème** sur le panier : sans
lui, les deux chemins passeraient même si l'un ignorait toute la tarification —
exactement le défaut qui a produit 1,83924 € contre 1,65532 €.

**Vérifié par mutation le 2026-09-09** : faire oublier la remise de retrait au
devis fait rougir les trois cas de retrait ; lui faire oublier les frais de zone
fait rougir le cas coursier, et lui seul.

⚠️ **Ce qu'il ne couvre pas** : la surtaxe de retard, qui dépend de l'heure
limite. L'opposer ici mélangerait deux sujets ; elle a ses propres suites.

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

### ~~R5~~ ✅ L'ajustement de zone n'est pas figé — **clos le 2026-09-09**

**Ce que c'était.** La remise de retrait et la surtaxe de retard figeaient déjà
l'ajustement qui les a produites ; les frais de zone étaient **le dernier terme
du panier à n'avoir que son montant**. Or `delivery_zones.fee_value` est
**mutable** : une facture émise dans six mois aurait chiffré « Livraison
24,00 € » sans jamais pouvoir dire « Val d'Isère, 20 € forfaitaires », ni prouver
que ce forfait était celui du jour.

**Ce qui a été fait.** `orders.delivery_fee_adjustment` (migration **additive**,
`NULL` = retrait ou commande antérieure — les deux se distinguent par
`delivery_fee_cents`), le champ dans `OrderView`, `CartAdjustments` qui rend le
barème à côté du montant, et `OrderDrafting` qui le fige.

**Et une troisième garde dans l'agrégat.** `ensureDeliveryFeeMatches` rejoint
ses deux jumelles : un montant qui ne découle pas de son barème est refusé,
parce qu'une trace figée mensongère est pire qu'une trace absente.

⚠️ Elle compare par `cartAdjustmentCents` et **non** `discountCentsOf` : des
frais ne sont pas bornés par le panier — une course peut coûter plus cher qu'un
petit panier. Un cas dédié le tient, et il échouerait si quelqu'un recopiait la
borne de la remise par symétrie.

**Aucune reprise sur l'historique, et c'est délibéré** : recopier le barème
_actuel_ d'une zone sur des commandes passées écrirait un fait qui n'a
peut-être jamais eu lieu — exactement ce que cette colonne existe pour empêcher.

🔴 **Le premier test ne prouvait rien, et une mutation l'a montré.** Il posait
une zone à **forfait** ; or un forfait se reconstruit à l'identique depuis son
montant, si bien que remplacer le barème figé par
`{ mode: "amount", cents: feeCents }` laissait la suite verte. Le cas a été
refait sur une zone en **pourcentage**, où « 10 % » et « 2,40 € » sont deux
phrases différentes — et seule la première s'écrit sur une facture. La même
mutation rougit désormais.

### R6 🟠 L'engagement de volume n'a aucun écran

**Le fait, vérifié le 2026-09-09.** `apps/lfc-B2B-admin-frontend/.../tarification/`
contient `gabarits`, `grille`, `pose-bar`, `simulation` — **pas d'engagement**.
Le backend a pourtant tout : agrégat, dépôt, routes, `retainedQuantity`.

Un engagement se signe donc en base, à la main. C'est le mécanisme qui fait
qu'un client paie le palier de sa **promesse** dès sa première commande — la
partie du moteur qui décide le plus, et celle que personne ne peut manipuler.

### ~~R7~~ ✅ Le cache supposait une seule instance — **clos le 2026-09-09**

**Ce que c'était.** `pricing-materials.cache.ts` n'avait que `invalidate()` :
aucune estampille, aucune coordination. `ops` dit « max 1 » aujourd'hui, par
décision de routage. Le jour du passage à deux, une règle posée sur l'instance A
n'invalidait pas l'instance B, qui aurait facturé l'ancien prix jusqu'à son
redémarrage. **Pas une lenteur : un prix faux.**

**Ce qui a été fait.** Le cache lit une **estampille** — le dernier
`pricing_events.id`, un ULID donc croissant — avant de servir ce qu'il garde.
Toute écriture tarifaire passe par `PricingActWriter`, qui écrit son acte dans
la même transaction que l'état : l'estampille bouge si et seulement si quelque
chose a changé, **quelle que soit l'instance qui l'a écrit**.

**Ce que ça coûte, dit franchement.** Le devis à froid passe de **quatre à cinq**
lectures. La constante du budget e2e a été mise à jour **avec sa raison**, comme
son propre JSDoc l'exige — « ce n'est pas la constante qu'il faut mettre à jour,
c'est une lecture qui vient d'apparaître, et il faut savoir laquelle ».

Le cache reste largement gagnant : sans lui, ces trois tables coûteraient trois
lectures ; avec estampille, une seule — et les trois lecteurs la partagent,
étant appelés dans un même `Promise.all`. Il devient **correct** au lieu d'être
correct-par-hypothèse-de-déploiement.

⚠️ **La thèse du budget n'a pas bougé** : ce qui compte n'est pas 4 ou 5, c'est
que dix lignes coûtent le même nombre qu'une seule. C'est l'égalité qui attrape
un N+1, pas la valeur absolue.

**Ce qui le tient.** Un e2e qui simule la seconde instance : une règle et son
acte semés **directement en base**, `invalidate()` volontairement non appelé —
exactement l'état qu'une écriture venue d'ailleurs produirait. Vérifié par
mutation : ignorer l'estampille fait rougir ce cas, et lui seul.

⚠️ **Une lecture d'estampille qui ÉCHOUE ne fait pas tomber la tarification** :
on retombe sur la dernière estampille connue, c'est-à-dire le comportement
d'avant. Servir un prix peut-être périmé vaut mieux qu'un refus de vente — et
c'est le seul endroit de cette chaîne où ce compromis est le bon.

---

## 4. Les garde-fous qui manquent

### ~~R8~~ ✅ Aucune porte sur `prisma.<modèle>` — **close le 2026-09-09**

**Ce que c'était.** `lint:cross-schema-join` lit le SQL **écrit à la main**.
`lint:context-boundaries` lit le **graphe d'imports**. Ni l'un ni l'autre ne
voyait une classe interrogeant en Prisma direct les tables d'un bloc qui n'est
pas le sien — `PrismaService` est technique, donc l'importer ne trahit rien, et
`prisma.user.findUnique()` n'est pas du SQL. `CLAUDE.md` écrit que **c'est
arrivé deux fois**.

**`lint:prisma-model-ownership` est la porte qui manquait.** 29ᵉ du dépôt.

🔴 **La propriété est DÉRIVÉE, jamais écrite à la main** : le propriétaire d'un
modèle est le bloc qui l'**écrit**. Une table se lit de plusieurs endroits sans
dommage ; elle n'a qu'un auteur, et cet auteur porte ses invariants. Rien à
maintenir : un modèle ajouté au schéma est classé le jour où quelqu'un l'écrit.
C'est le chemin inverse de celui qu'a dû faire `lint:cross-schema-join`, qui
recopiait la liste des schémas jusqu'à ce qu'elle devienne fausse.

**Le verdict sur 93 modèles : deux anomalies, une corrigée.**

- 🔴 **`platform` lisait `prisma.user`** — la violation absolue de la matrice
  (`platform` ne connaît aucun contexte). Corrigée : `DevImpersonation` dépend
  désormais du port `ImpersonationSubjects`, dont l'adaptateur vit dans
  `account/` et que `appBootstrap` relie. Le bypass a suivi le guard à la racine
  de composition, pour la raison qui vaut déjà pour `PrincipalResolver`.
- 🟡 **`b2b` lit `staffUser` en direct**, dans deux fichiers. La matrice
  **autorise** `b2b → staff` ; ce qui est en cause est le moyen, pas la
  direction. Déclarée en dérogation datée, à fermer quand `staff/directory`
  exposera un port de lecture d'annuaire — pas avant, sous peine d'un port
  taillé pour un seul appelant.

**Ce que cette porte NE tient pas**, et qui est écrit dedans : elle ne rend pas
la frontière **impossible**. Une seule base, une seule URL, un seul client — une
jointure `b2b → pim` marcherait toujours. Elle la rend **visible**, ce qui est
le cran au-dessus de la relecture et celui en dessous de l'interdiction.

**Vérifié par mutation** : réintroduire la lecture de `user` dans `platform` fait
échouer la porte, en nommant le fichier.

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

| Portée comme ouverte par                              | En fait                                                                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit-fable.md` §1 — « `lint:gates` échoue »         | ✅ `clock-port` est verte : « les 1263 fichiers de production lisent le temps par le port ».                                                         |
| `audit-fable.md` B3 — « un gabarit se pose à moitié » | ✅ Fermé le 2026-09-08, **sans transaction** : une mercuriale est UNE ligne, donc atomique par construction.                                         |
| `audit-fable.md` P1 — « rien ne borne la quantité »   | ✅ `MAX_LINE_QUANTITY`, `MAX_ORDER_LINES`, et `lines` plafonné à 100 sur `/shop/quote`.                                                              |
| `durcir-le-calcul-des-prix.md` chantier 1             | ✅ Livré le 2026-09-09. Cinq appelants de `resolvePrice` → **un**, et `lint:price-pipeline` est à **1 entrée**.                                      |
| `durcir-le-calcul-des-prix.md` chantiers 2 et 5       | ✅ `lint:business-day` sur les fenêtres tarifaires, et `pricing-budget.e2e-spec.ts` qui compte les opérations ORM.                                   |
| `etat-des-lieux-mercuriale-client.md` T7              | ✅ Les bornes de fenêtre passent par `businessDayStart` ; la porte le tient.                                                                         |
| **R1 de ce registre** — le prix ramené à zéro         | ✅ Clos le **2026-09-09**, cf. §2 : le champ traverse la chaîne, la colonne est posée, et `assertConsistent` exige désormais **davantage** qu'avant. |
| **R3 de ce registre** — la parité devis ↔ facture     | ✅ Clos le **2026-09-09**, cf. §2 : quatre cas comparent le devis public aux colonnes de la commande, montant par montant.                           |
| **R5 de ce registre** — le barème de zone figé        | ✅ Clos le **2026-09-09**, cf. §3 : colonne additive, garde dans l'agrégat, et un cas qui survit à la modification de la zone.                       |
| **R7 et R8 de ce registre**                           | ✅ Clos le **2026-09-09** : l'estampille du cache, et la 29ᵉ porte qui dérive la propriété d'un modèle de qui l'écrit.                               |

⚠️ **Le chantier 4 de `durcir` n'est fermé qu'à MOITIÉ**, et je l'avais annoncé
fermé. Ce qui l'est : l'écart au tarif, descendu dans `@lfd/money` (`gapBp`,
`discountBp`, `averageGapBp`). Ce qui ne l'est pas : son propre critère de
clôture — _« aucun `Math.round` sur un prix dans un composant Angular »_ — que
**R2** met en défaut.

---

## 7. L'ordre, et pourquoi

1. ~~**R1**~~ — ✅ fait le 2026-09-09.
2. ~~**R3**~~ — ✅ fait le 2026-09-09.
3. ~~**R5**~~ — ✅ fait le 2026-09-09.
4. **R13 puis R4** — la décision d'abord, le mécanisme ensuite. Les prendre dans
   l'autre sens coderait une réponse à une question qu'on n'a pas posée.
5. **R2** — conception, `vitruve`, puis un lot front. **Le plus gros du reste.**
6. **R6** — le seul mécanisme du moteur que personne ne peut manipuler.
7. ~~**R7**, **R8**~~ — ✅ faits le 2026-09-09.

**Ce que je ne ferais pas.** Toucher au moteur. Il a une seule porte, une trace
figée, des contraintes d'exclusion qui rendent le chevauchement impossible, et
49 tests neufs qui mordent — vérifié par mutation le 2026-09-09. Tout ce qui
reste est autour de lui, et c'est là qu'il faut travailler.
