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
>
> **R15 à R26 ont été ajoutées le 2026-09-08** par le troisième regard,
> [`audit-du-moteur-a-la-facade.md`](audit-du-moteur-a-la-facade.md), qui tient
> le raisonnement. Ce registre ne tient que le fait, la preuve et le remède.
>
> ⚠️ **Sur les dates.** Les entrées R1 à R14 se datent du 2026-09-09 ; les
> commits qui les portent sont du 2026-09-08 (`git log`). L'écart est nommé
> plutôt qu'hérité : ce qui est ajouté depuis porte la date de git.

---

## 1. Le tableau, en un écran

| #       | Ce que c'est                                                               | Gravité   | Coût                    |
| ------- | -------------------------------------------------------------------------- | --------- | ----------------------- |
| ~~R1~~  | ~~Un prix ramené à zéro tue la commande~~                                  | ✅        | **clos le 2026-09-09**  |
| **R2**  | La simulation rejoue les paliers **dans le navigateur**                    | 🔴        | conception              |
| ~~R3~~  | ~~Rien ne prouve que le devis boutique prédit la facture~~                 | ✅        | **clos le 2026-09-09**  |
| **R4**  | Le client peut payer autre chose que ce qu'il a vu                         | 🟠        | conception              |
| ~~R5~~  | ~~L'ajustement de zone n'est pas figé sur la commande~~                    | ✅        | **clos le 2026-09-09**  |
| **R6**  | L'engagement de volume n'a **aucun écran**                                 | 🟠        | un lot front            |
| ~~R7~~  | ~~Le cache suppose une seule instance de l'API~~                           | ✅        | **clos le 2026-09-09**  |
| ~~R8~~  | ~~Aucune porte sur `prisma.<modèle>` hors contexte~~                       | ✅        | **clos le 2026-09-09**  |
| **R9**  | 19 conversions de jour en minuit UTC, hors tarification                    | 🟡        | inventaire fait         |
| **R10** | **Deux** traces mortes dans la tarification                                | 🟡        | trivial                 |
| **R11** | Le volume prévu appartient au gabarit, pas au client                       | 🟡        | conception              |
| **R12** | Trois requêtes de production jamais lancées                                | 🟡        | trois `psql`            |
| **R13** | Prix vivant / prix bloqué — **rien n'est tranché**                         | 🔵        | décision                |
| **R14** | Les conditionnements — conception **périmée**                              | 🔵        | à réécrire              |
| **R15** | La projection jugeait la porte sur un cumul — **à moitié fermée**          | 🟠        | contrat + front         |
| **R16** | Un engagement de portée famille est mesuré **par SKU**                     | 🔴        | décision, puis un lot   |
| **R17** | La lecture datée `at` ignore ce qui a été **archivé depuis**               | 🔴 latent | décision                |
| **R18** | Engagement et gabarit répondent **400** là où le reste répond 404 et 409   | 🟠        | une heure               |
| **R19** | Treize commentaires disent « centimes » sur des millicentimes              | 🟠        | une heure, puis un type |
| **R20** | La doc de référence contredit le code — promis/livré, unités, index global | 🟠        | un lot doc              |
| **R21** | **Deux** séquences de chargement ; une query injecte `PrismaService`       | 🟠        | tombe avec R26          |
| **R22** | La vitrine **publique** ne passe pas par le fabricant                      | 🟠        | un lot back             |
| **R23** | Le front recalcule un plancher — **sixième** occurrence du motif           | 🟠        | rejoint R2              |
| **R24** | États inatteignables et colonnes mortes                                    | 🟡        | trivial                 |
| **R25** | La trace figée ne persiste ni scellement ni éviction                       | 🟡        | deux colonnes additives |
| **R26** | `Pricer` n'a **aucun** appelant ; la façade unique reste à dessiner        | 🔵        | conception, `vitruve`   |

**Cinq entrées sont closes le jour même de ce registre** — R1, R3, R5, R7 et R8.
**Douze ont été ajoutées le 2026-09-08** par le troisième regard (R15 à R26), et
**R15 a été ramenée de 🔴 à 🟠 le 2026-09-09**. Il reste **vingt et une**
entrées, dont trois décisions et trois documents à réécrire. Elles restent listées avec leur preuve
plutôt que retirées : une entrée effacée est une entrée que quelqu'un rouvrira.

⚠️ **Ce paragraphe disait « rien de ce qui reste ne fausse un prix résolu ».
C'est faux depuis R15 et R16.** Le moteur — `resolvePrice`, la spécificité, le
plancher, l'arrondi — reste propre. Mais l'objet qui l'appelle juge la porte
d'un plancher dynamique sur une quantité qui n'est pas une commande, et mesure un
engagement de famille sur un seul article. Ce qui fausse n'est plus _autour_ du
moteur : c'est **dans sa porte**.

**R15 est à moitié fermée le 2026-09-09.** Le prix **sous le mur dur** est parti
— une projection ne peut plus ouvrir la porte d'un plancher, `UnlockEvidence`
sachant désormais dire « il n'y a pas de commande ». Reste l'inverse : faute que
la charge dise quelle commande amène à chaque niveau, la courbe peut être plus
HAUTE que la grille des paliers du même écran. Le raisonnement, la branche
écartée à tort et la contradiction qui l'a rattrapée sont au
[journal de remédiation](journal-de-remediation.md) §8. **R16 reste entière** :
elle fausse encore un prix résolu.

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

### R15 🟠 La projection jugeait la porte sur un cumul — à moitié fermée

> **2026-09-09 — la moitié dangereuse est fermée.** `UnlockEvidence.quantity`
> est devenu `number | null` : « il n'y a pas de commande » est un mot du type,
> `quantityMet` se calcule comme `volumeMet`, et une projection ne peut plus
> annoncer un prix **sous le mur dur**.
>
> **Ce qui reste, et pourquoi c'est une tranche et non un correctif.** La porte
> se juge sur une quantité de COMMANDE ; la charge de projection ne porte que
> des cumuls. Faute de mesure on protège, donc la porte ne s'ouvre jamais — et
> la grille des paliers, elle, la rouvre au seuil sondé : sur l'écran qui
> affiche les deux, la courbe peut être plus haute que la grille. L'écran
> **calcule déjà** la quantité de chaque échéance (`commitment-bench.ts`,
> `quantity = cumulative - previous`) et ne l'envoie pas. La lui faire envoyer
> coûte un contrat additif, une requête et un lot front — plus une décision : la
> charge partage aujourd'hui un point entre les trois scénarios
> (`projectionLevels`), ce qui empêche un point de porter une seule quantité.
>
> Raisonnement complet, branche écartée à tort et contradiction :
> [journal de remédiation](journal-de-remediation.md) §8. Le constat d'origine
> est conservé ci-dessous, mot pour mot.

**Le fait, vérifié le 2026-09-08.** `priceAtCumulative(item, N)`
(`loaded-pricer.ts:196`) construit un contexte où `quantity` **et**
`cumulativeQuantity` valent `N`, et `resolve()` (`loaded-pricer.ts:388`) juge la
porte du plancher dynamique sur `context.quantity`. Une porte
`{ minQuantity: 50, minVolumeRatioBp: null }` — légale : seules les deux
conditions nulles sont refusées — s'ouvre donc à `N = 10 000`, et la projection
annonce un prix **sous le mur dur** qu'une commande de 500 pièces ne verra jamais.

Le JSDoc promet le contraire — « la porte d'un plancher dynamique reste
FERMÉE » — ce qui est vrai pour la condition de volume et faux pour celle de
quantité. Et `volume-tier-prices.ts:48` fait l'inverse pour la même question,
avec `orderQuantityAt`. Deux méthodes du même objet, deux règles.

**Ce qui ne le tient pas.** Le seul cas sur la porte fermée
(`loaded-pricer.spec.ts:377`) n'a qu'une condition de volume (`:119`).

**Le remède.** Un test qui échoue, puis la porte se juge sur la quantité de
commande — ou ne s'ouvre jamais en projection, comme la doc le promet. La forme
structurelle est la lentille de **R26**. Détail :
[`audit-du-moteur-a-la-facade.md`](audit-du-moteur-a-la-facade.md) B.1.

### R16 🔴 Un engagement de portée famille est mesuré par SKU

**Le fait, vérifié le 2026-09-08.** `commitmentOf` (`loaded-pricer.ts:346`)
calcule `orderedBySku.get(item.sku) + quantity`, et le chargeur
(`pricing-materials.loader.ts:143`) lit les volumes **par SKU**. Un engagement
`category:viennoiserie` de 10 000 promis ne voit, sur une ligne de croissants,
que les croissants — ni les autres viennoiseries de l'historique, ni les autres
lignes du panier. `max(promis, livré)` ne bascule qu'à 10 000 **croissants**, et
`commitment.cumulativeQuantity` figé sur la ligne est faux.

**Ce qui ne le tient pas.** `volume-commitment.spec.ts:66` teste le **choix**
d'un engagement de famille, jamais sa **mesure**. Le modèle accepte `category`
et `global`.

**Le remède, à trancher.** Mesurer par portée — joindre le catalogue,
`order_lines` ne portant que le SKU —, ou rendre la famille **inexprimable** en
bornant la portée d'un engagement à `product` / `variant`. Tous les exemples du
dossier sont par article ; la seconde voie est la moins chère. Détail : audit
B.2.

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

### R17 🔴 La lecture datée ignore ce qui a été archivé depuis

**Le fait, vérifié le 2026-09-08.** Les quatre lecteurs du chargeur excluent
l'archivage **en absolu**, quel que soit `at` : `prisma-price-rule.reader.ts:54`,
`prisma-price-floor.reader.ts:40`, `prisma-company-mercuriale.reader.ts:35`,
`prisma-volume-commitment.reader.ts:25` — dont le port ne prend même pas d'`at`.
Une mercuriale **close** depuis n'est donc pas retrouvée par une lecture datée
d'avant sa clôture — ce que `company-mercuriale.ts:184`,
[`comprendre-une-mercuriale.md`](mercuriales/comprendre-une-mercuriale.md)
(ligne 152) et `pricer.ts:36` (« que payait-il le 3 mars ? ») promettent tous
trois. Le cas normal d'une mercuriale est « on clôt, on repose » : la question
a la mauvaise réponse dans le cas où on la pose.

Le tableau de bord, lui, lit avec `unarchivedAt(at)`
(`prisma-pricing-board.reader.ts:115`) : **deux sémantiques d'archivage**, ce
qu'`archived-at.ts` interdit en toutes lettres.

**Latent, et il faut le dire.** Aucun chemin de production ne passe une date
passée par le chargeur — `Pricer` n'a pas d'appelant (R26), le `at?`
d'`OrderLinePricing.resolve` n'est passé par personne, la projection reçoit
`clock.now()`. Le seul e2e (`pricer.e2e-spec.ts:351`) couvre l'expiration, pas
la clôture. La porte est ouverte, documentée, et fausse ; son premier
consommateur la franchira.

**Le remède, à trancher.** `at` vrai partout — lecteurs datés, cache contourné
pour une date passée — ou `at` **retiré** de `PriceRequest` et
d'`OrderLinePricing.resolve`, la lecture datée restant au tableau de bord, seul
endroit où elle est juste. Le moment le moins cher pour trancher est celui où
personne ne l'emprunte. Détail : audit B.3.

### R21 🟠 Deux séquences de chargement, et une query qui injecte Prisma

**Le fait, vérifié le 2026-09-08.** Cinq endroits écrivent « la **seule**
séquence de chargement » — `pricing.module.ts:31`,
`pricing-materials.loader.ts:44`, `pricer.ts:73`,
[`comment-un-prix-se-fabrique.md`](comment-un-prix-se-fabrique.md) ligne 42,
[`architecture-pricer.md`](architecture-pricer.md) ligne 49. Le tableau et la
fiche client chargent **eux-mêmes** : `company-pricing.query.ts:86` fait
`prisma.priceRule.findMany` et `prisma.priceFloor.findMany`, puis
`boardMaterials` (`:116`) construit un `LoadedPricer` avec `commitments: []` et
`NO_EVIDENCE` ; `prisma-pricing-board.reader.ts:114` de même. C'est cette seconde
séquence qui produit la double sémantique de R17.

Et `CompanyPricingQuery` injecte `PrismaService` (`company-pricing.query.ts:69`)
— `CLAUDE.md` §4 : « le handler dépend de ports, jamais de `PrismaService` ».

**Le remède.** Tombe avec R26 : le tableau passe par la façade, lentille
`screen`. Détail : audit B.7.

### R22 🟠 La vitrine publique ne passe pas par le fabricant

**Le fait, vérifié le 2026-09-08.** `read-shop-catalogue.ts:62` sert le prix du
miroir — le canonique, jamais résolu. Une promotion publique (`audience: all`)
est **invisible au rayon** et n'apparaît qu'au panier. Seule la route reconnue
résout (`read-my-shop-catalogue.ts:82`), et seulement pour une société. La
règle n° 1 du [`README.md`](README.md) — un seul fabricant — n'est pas tenue
pour le visiteur, et le bandeau d'[`architecture-prix-boutique.md`](architecture-prix-boutique.md)
(ligne 24) décrit une résolution « à 1 » qui n'a pas lieu.

**Ce que ça coûte.** L'écart est dans le sens agréable. Mais une promotion qu'on
ne voit pas ne fait pas vendre.

**Le remède.** La route publique résout à `companyId: null`, quantité 1, par la
même façade — quatre lectures pour toute la vitrine, comme la route reconnue.
Détail : audit B.8.

### R23 🟠 Le front recalcule un plancher — la sixième occurrence

**Le fait, vérifié le 2026-09-08.** `resolve-floor.ts:67` interdit nommément
« un `Math.round(canonical * bp / 10000)` qui aurait l'air identique ».
`mercuriale-row.ts:50` l'écrit tel quel, et `mercuriale-row.ts:61` réimplémente
l'écart au catalogue que [`durcir-le-calcul-des-prix.md`](durcir-le-calcul-des-prix.md)
(ligne 111) dit descendu dans `@lfd/money`. C'est l'écran où un commercial lit
la **marge de négoce** avant de signer.

**Le remède.** Rejoint **R2** : même lot front. Le critère de clôture du
chantier 4 — « aucun `Math.round` sur un prix dans un composant Angular » —
compte désormais deux fichiers. Détail : audit B.9.

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

### R18 🟠 Engagement et gabarit répondent 400 là où le reste répond 404 et 409

**Le fait, vérifié le 2026-09-08**, dans `pricing-errors.ts`. Introuvable :
`ResourceNotFoundError` (404) pour les règles, barèmes et mercuriales (`:305`,
`:589`), `DomainError` (400) pour l'engagement et le gabarit (`:631`, `:683`).
Archivé, scellé : `BusinessError` (409) ici (`:385`, `:562`, `:817`),
`DomainError` là (`:611`, `:673`). Recouvrement : 409 (`:285`, `:530`) contre
400 (`:621`). La doc de résolution écrit « c'est un 409, pas un 404 » — deux
agrégats sur cinq répondent 400, dont l'engagement, l'objet du moteur qui
décide le plus.

**Le remède.** Trois familles, une règle : `*NotFoundError` étend
`ResourceNotFoundError`, `Archived*IsSealedError` et `Overlapping*Error` étendent
`BusinessError`. Découper les 869 lignes par agrégat au passage. Détail : audit
B.4.

### R19 🟠 Treize commentaires disent « centimes » sur des millicentimes

**Le fait, vérifié le 2026-09-08.** Le vecteur exact de D10 — « le commentaire
disait _centimes_ ; trois panneaux de saisie l'ont cru » — est vivant sur treize
sites : le schéma (`schema.prisma:2601`, `:2608`, `:2612`, `:2690`, `:2934`), le
contrat (`pricing.ts:140`, `:467`, `:670`, `:672`, `:1033`, `:1202`), le domaine
(`resolve-floor.ts:65`), et deux **messages lus par le staff**
(`order-line.ts:83`, `:172`). `lint:money-units` lit les noms, pas les
commentaires — son en-tête le dit.

**Le remède.** Une heure pour les phrases. Puis le type nominal `Millicents` /
`Cents` dans `@lfd/money`, que deux audits nomment déjà comme le seul cran qui
ferme. Détail : audit B.5.

---

## 5. Les petits, et les décisions

| #       | Le fait                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Ce qui le ferme                                                                                                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R10** | 🟡 **Deux traces mortes**, vérifiées par `grep` le 2026-09-09. `PriceTemplate.archive()` n'est appelé de nulle part — du code mort qui a l'air vivant. Et `MercurialeNameTakenError` n'est plus levée depuis que la mercuriale porte son identifiant : son JSDoc annonçait sa fin — « le jour où la pose portera son propre identifiant, ce refus n'aura plus de raison d'être ». **Conséquence métier** : rien n'interdit plus à un client deux grilles homonymes ; c'était notre modèle de lecture qui l'interdisait                                                                                                                                                                             | Supprimer l'erreur. Pour `archive()` : le supprimer, ou lui donner sa route — pas les deux.                                                       |
| **R11** | 🟡 `plannedVolume` est stocké dans la **grille**. Un gabarit posé chez trois clients porte une seule hypothèse de saison — toute la simulation décrit alors le gabarit, jamais le client qu'on a en face                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Le volume prévu devient une donnée **du client**. La base le connaît déjà (`prisma-customer-volume.reader.ts`). Voisin de R2.                     |
| **R12** | 🟡 Trois requêtes de production **jamais lancées**, en lecture seule, détaillées au §A.1 de [`audit-calcul-du-panier-et-du-prix.md`](audit-calcul-du-panier-et-du-prix.md) : les paliers sous le centime (`D10`), les articles qui quittent la vitrine (`D8`), les remises qui dépassent le panier (`P4`)                                                                                                                                                                                                                                                                                                                                                                                          | Le `.env` local pointe `localhost` ; elles demandent un accès prod.                                                                               |
| **R13** | 🔵 **Prix vivant / prix bloqué** — [le document](architecture-prix-vivant-prix-bloque.md) pose la question « qui porte le risque d'un prix qui bouge », et **zéro code** en découle. R4 en dépend                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Une décision de Hugo, pas un lot.                                                                                                                 |
| **R14** | 🔵 **Les conditionnements** — [le document](architecture-conditionnements-pricing.md) date du 2026-08-04 et affirme que « le PIM ne porte AUJOURD'HUI ni prix ni `unitsPerPack` ». **C'est faux depuis le 2026-08-31** : `ProductVariant.priceCents` existe                                                                                                                                                                                                                                                                                                                                                                                                                                        | À réécrire sur l'existant, ou à archiver. En l'état il ferait construire contre le modèle en place.                                               |
| **R20** | 🟠 **La doc de référence contredit le code.** [`architecture-resolution-de-prix.md`](architecture-resolution-de-prix.md) ligne 713 : « la promesse ne calcule rien » — le code fait `max(promis, livré)`, et le même document le dit ligne 1096 ; sa partie B est en centimes ; « `supersededIn` a disparu » alors qu'il tourne (`board-item.ts:186`). [`ecrans-de-tarification.md`](ecrans-de-tarification.md) : une observation par client (le code : par palier, `mercuriale-benchmark.query.ts:60`), une mercuriale « en `alter` », un gabarit qui « fabrique des règles ». L'index global ([`../README.md`](../README.md)) : six lignes périmées. Et les dates du 09-09 sur des commits du 08 | Un lot doc, partie B d'abord. Détail : audit B.6                                                                                                  |
| **R24** | 🟡 **États inatteignables.** `company_mercuriales.paused_at` est écrit, relu (`mercuriale-rows.ts:44`) et filtré (`prisma-company-mercuriale.reader.ts:59`) sans aucun `pause()` sur l'agrégat ; `price_rules.floor_mode` / `floor_value` ne sont jamais lus ; `AuthoredPriceStage` du domaine (`price-rule.ts:36`) accepte encore `mercuriale` quand le contrat l'a sortie (`pricing.ts:76`)                                                                                                                                                                                                                                                                                                      | Retirer, ou donner un geste — pas les deux. Détail : audit B.10                                                                                   |
| **R25** | 🟡 **La trace figée ne persiste ni scellement ni éviction** (`pricing.ts:523`, `:615`). « Pourquoi ma promotion ne s'est pas appliquée ? » a trois réponses, la ligne n'en garde aucune                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Deux colonnes additives, `NULL` = antérieur. Détail : audit B.11                                                                                  |
| **R26** | 🔵 **`Pricer` n'a aucun appelant** — `app.module.ts:110` l'importe, personne ne l'injecte. Les trois consommateurs refont la chorégraphie, le mapping est copié six fois, `pricerFor` rend `null`, « ce qu'on écarte » a trois formes, `pricing → orders` pour le catalogue, le domaine importe `@lfd/contracts`, la lecture est hors bus                                                                                                                                                                                                                                                                                                                                                          | **Une façade** : un lot qui connaît ses articles, une lentille qui nomme ce qu'elle écarte. Conception en audit C.4 ; touche l'argent : `vitruve` |

---

## 6. Ce qui a été refermé, et qu'on ne réouvre pas

Six entrées portées comme ouvertes par les documents d'origine **ne le sont
plus**. Elles sont ici avec leur preuve, pour que personne ne reparte les faire.

| Portée comme ouverte par                                           | En fait                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit-fable.md` §1 — « `lint:gates` échoue »                      | ✅ `clock-port` est verte : « les 1263 fichiers de production lisent le temps par le port ».                                                                                                                                                               |
| `audit-fable.md` B3 — « un gabarit se pose à moitié »              | ✅ Fermé le 2026-09-08, **sans transaction** : une mercuriale est UNE ligne, donc atomique par construction.                                                                                                                                               |
| `audit-fable.md` P1 — « rien ne borne la quantité »                | ✅ `MAX_LINE_QUANTITY`, `MAX_ORDER_LINES`, et `lines` plafonné à 100 sur `/shop/quote`.                                                                                                                                                                    |
| `durcir-le-calcul-des-prix.md` chantier 1                          | ✅ Livré le 2026-09-09. Cinq appelants de `resolvePrice` → **un**, et `lint:price-pipeline` est à **1 entrée**.                                                                                                                                            |
| `durcir-le-calcul-des-prix.md` chantiers 2 et 5                    | ✅ `lint:business-day` sur les fenêtres tarifaires, et `pricing-budget.e2e-spec.ts` qui compte les opérations ORM.                                                                                                                                         |
| `etat-des-lieux-mercuriale-client.md` T7                           | ✅ Les bornes de fenêtre passent par `businessDayStart` ; la porte le tient.                                                                                                                                                                               |
| **R1 de ce registre** — le prix ramené à zéro                      | ✅ Clos le **2026-09-09**, cf. §2 : le champ traverse la chaîne, la colonne est posée, et `assertConsistent` exige désormais **davantage** qu'avant.                                                                                                       |
| **R3 de ce registre** — la parité devis ↔ facture                  | ✅ Clos le **2026-09-09**, cf. §2 : quatre cas comparent le devis public aux colonnes de la commande, montant par montant.                                                                                                                                 |
| **R15 de ce registre** — le prix **sous le mur dur** en projection | ✅ Clos le **2026-09-09** : `UnlockEvidence.quantity` est nullable, et deux cas rouges avant le correctif le tiennent (`loaded-pricer.spec.ts`, `floor-policy.spec.ts`). ⚠️ **Seule cette moitié est close** — la fidélité du banc reste ouverte sous R15. |
| **R5 de ce registre** — le barème de zone figé                     | ✅ Clos le **2026-09-09**, cf. §3 : colonne additive, garde dans l'agrégat, et un cas qui survit à la modification de la zone.                                                                                                                             |
| **R7 et R8 de ce registre**                                        | ✅ Clos le **2026-09-09** : l'estampille du cache, et la 29ᵉ porte qui dérive la propriété d'un modèle de qui l'écrit.                                                                                                                                     |

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
8. **R15 et R16** — deux tests qui échouent, puis le correctif : les seuls
   constats qui produisent un **prix faux**.
9. **R17** — trancher `at` pendant qu'il n'a aucun consommateur.
10. **R18 et R19** — une heure, zéro risque, et le vecteur de D10 se ferme.
11. **R26** — la façade avec sa lentille, `vitruve` d'abord ; R21, R24 et R25
    tombent avec elle.
12. **R20**, puis **R22 et R23** — ce dernier avec R2, dont il est le même lot.

**Ce que je ne ferais pas.** Toucher au moteur — `resolvePrice`, la spécificité,
le plancher, la grille des paliers. Il a une trace figée, des contraintes
d'exclusion qui rendent le chevauchement impossible, et 49 tests neufs qui
mordent — vérifié par mutation le 2026-09-09. ⚠️ **R15 et R16 ne sont pas dans
le moteur : ils sont dans `LoadedPricer`, sa porte** — et c'est cette porte que
R26 redessine.
