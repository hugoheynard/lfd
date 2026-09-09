# Journal de remédiation du tarificateur

> **Ce que ce document est.** Le registre
> [`ce-qui-reste-a-faire.md`](ce-qui-reste-a-faire.md) dit ce qui **reste** ;
> l'audit [`audit-du-moteur-a-la-facade.md`](audit-du-moteur-a-la-facade.md) dit
> ce qui **ne va pas**. Ni l'un ni l'autre ne garde trace de **ce qu'on a
> décidé, et pourquoi on a écarté l'autre branche**.
>
> C'est ce trou-là que ce journal remplit. Une entrée par constat traité, dans
> l'ordre où on les traite, toujours en six temps : le constat, **la racine**,
> les branches ouvertes, celle qu'on prend et ce qu'elle coûte, ce qui a changé,
> ce qui le prouve.
>
> **Il ne se réécrit pas.** Une entrée close reste telle qu'elle a été écrite,
> même quand la suite lui donne tort — c'est précisément ce cas-là qui a de la
> valeur. Une correction s'ajoute en dessous, datée.

| Entrée                  | Constat                                                              | Statut                                                                                   |
| ----------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [R15](#r15--2026-09-09) | la projection ouvre le plancher dynamique sur une quantité fictive   | 🟠 **à moitié** — le prix faux est parti, la fidélité du banc reste (2026-09-09)         |
| [R16](#r16--2026-09-09) | un engagement de portée famille est mesuré par SKU                   | 🔵 **analyse renversée par la contradiction** — la question est commerciale (2026-09-09) |
| [R20](#r20--2026-09-09) | la documentation de référence contredit le code                      | ✅ **close** — 2026-09-09                                                                |
| [R22](#r22--2026-09-09) | la vitrine publique ne passe pas par le fabricant de prix            | ✅ **close** — 2026-09-09                                                                |
| [R23](#r23--2026-09-09) | le front recalcule un plancher avec la formule interdite             | ✅ **close** — 2026-09-09                                                                |
| [R25](#r25--2026-09-09) | la trace figée ne répond pas à la question qu'elle existe pour poser | 🟠 **un tiers fait** — la contradiction a trouvé une fuite et deux trous (2026-09-09)    |
| [R26](#r26--2026-09-09) | la porte du prix — les quatre lots                                   | ✅ **lots 1–4** — 2026-09-09                                                             |

---

## R15 · 2026-09-09

**Constat** : [B.1](audit-du-moteur-a-la-facade.md) · **Registre** :
[R15](ce-qui-reste-a-faire.md) · **Gravité** : 🔴 produit un prix faux à
l'écran.

### 1. Le constat, retrouvé dans le code

`priceAtCumulative(item, N)`
([`loaded-pricer.ts:196`](../../apps/lfd-api/src/b2b/pricing/domain/loaded-pricer.ts))
construit un contexte où `quantity` **et** `cumulativeQuantity` valent `N`, puis
`resolve()` ([`loaded-pricer.ts:388`](../../apps/lfd-api/src/b2b/pricing/domain/loaded-pricer.ts))
juge la porte du plancher dynamique sur `context.quantity` — c'est-à-dire sur
`N`.

Avec une politique `{ minQuantity: 50, minVolumeRatioBp: null }` — légale, seules
les **deux** conditions nulles sont refusées à la saisie — `decideFloor`
([`floor-policy.ts:75`](../../apps/lfd-api/src/b2b/pricing/domain/floor-policy.ts))
calcule `volumeMet = true` (condition absente réputée remplie) et
`quantityMet = 10 000 >= 50`. **La porte s'ouvre**, et la courbe du banc d'essai
affiche un prix sous le mur dur — que la commande réelle ne servira pas, sauf à
être passée d'un seul bloc à ce niveau-là.

### 2. La racine — une asymétrie dans `UnlockEvidence`

Ce n'est pas une étourderie d'appelant, et c'est pour ça qu'elle a tenu.
`UnlockEvidence` porte deux mesures, et **une seule des deux sait dire qu'elle
n'a pas été prise** :

```ts
readonly quantity: number;                     // obligatoire — pas d'échappatoire
readonly observedVolumeRatioBp: number | null; // `null` = pas de référence → non rempli
```

Le JSDoc de `decideFloor` énonce pourtant la règle pour les deux : « **faute de
mesure, on protège** ». Elle n'est **tenable que du côté volume** : le type y
offre le mot pour dire « je ne sais pas ». Côté quantité, un appelant qui n'a
pas de commande — et une projection n'en a pas — doit en **inventer une**.

`priceAtCumulative` invente le cumul. C'est le seul nombre qu'elle ait sous la
main, et c'est une **quantité de saison** passée dans une case qui dit « la
quantité de CE SKU dans CETTE commande ». `volume-tier-prices.ts:48` nomme
exactement ce piège et l'évite avec `orderQuantityAt` ; le tarificateur, à deux
méthodes de distance, y tombe.

> **La leçon, et elle est plus large que R15.** Un type qui rend l'ignorance
> **indicible** ne la supprime pas : il la fait entrer déguisée en mesure. La
> hiérarchie des garde-fous du dépôt commence par « inexprimable » — encore
> faut-il que ce soit **la faute** qui soit inexprimable, pas l'aveu.

### 3. Les branches ouvertes

| Branche                                                             | Ce qu'elle dit                                                           | Pourquoi on ne la prend pas                                                                                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** — recopier `orderQuantityAt`                                  | « sous engagement, garder la quantité du panier »                        | inopérant ici : `priceAtCumulative` n'a **pas** de quantité de panier — les deux champs valent déjà `N`. La transposition rendrait `N`, c'est-à-dire le bug                                     |
| **B** — ajouter un paramètre `orderQuantity` à `priceAtCumulative`  | « que l'appelant dise la commande qu'il projette »                       | ~~l'écran ne connaît pas le rythme de livraison : il **inventerait** ce nombre~~ — **c'est faux, voir le §8.** Écartée à tort ; c'est la branche juste, et elle coûte un contrat + un lot front |
| **C** — un cas particulier « projection » dans `resolve()`          | « ne pas appeler `decideFloor` du tout quand les preuves sont écartées » | marche, et laisse la porte ouverte au prochain appelant : le type continue d'exiger une quantité inventée. On soigne le symptôme chez **un** appelant                                           |
| **D** — rendre l'ignorance **dicible** : `quantity: number \| null` | « je n'ai pas de commande » devient un mot du type                       | ✅ prise                                                                                                                                                                                        |

### 4. La branche prise, et ce qu'elle coûte

**D.** `UnlockEvidence.quantity` devient `number | null`, et `quantityMet` se
calcule exactement comme `volumeMet` :

```ts
const quantityMet =
  dynamic.unlock.minQuantity === null ||
  (evidence.quantity !== null && evidence.quantity >= dynamic.unlock.minQuantity);
```

Trois conséquences, et la troisième est la raison de ce choix :

1. **La règle du JSDoc devient vraie des deux côtés.** « Faute de mesure, on
   protège » n'a plus d'exception ; les deux conditions se lisent de la même
   façon, et la symétrie se voit en six lignes.
2. **La promesse de `priceAtCumulative` devient un théorème, pas un cas.** La
   porte y est **toujours** fermée, et ça se démontre sans lire la méthode : la
   saisie refuse les deux conditions nulles, donc au moins une est posée ; la
   projection ne prouve ni l'une (`quantity: null`) ni l'autre
   (`observedVolumeRatioBp: null`). Aucune branche n'ouvre.
3. **Le prochain appelant hérite du défaut prudent.** Un écran de simulation, un
   import, un comparatif : tout ce qui n'a pas de commande sous la main écrira
   `null` parce que c'est ce qu'il a, et la maison sera protégée sans que
   personne y pense.

**Ce que ça coûte, dit franchement.** Un client dont la porte ne dépend **que**
de la quantité, et qui commanderait réellement ses 10 000 pièces d'un coup,
verra sur le banc d'essai une courbe **au-dessus** de ce qu'il paierait. La
projection sous-estime la remise. C'est le sens que tout le moteur choisit déjà
— `decideFloor` le dit mot pour mot, « le défaut penche du côté de la maison » —
et c'est le seul des deux sens qui ne se découvre pas devant le client.

**Ce que ça ne fait pas.** Le contexte de résolution reste inchangé :
`priceAtCumulative` continue de poser `quantity = cumulative = N` pour les
**règles** et les **barèmes**, ce qui est sa sémantique — « si ce niveau était
atteint ». Seule la **preuve** passée à la porte du plancher change — deux
appels de `decideFloor` hors tests, plus les constructions d'`UnlockEvidence`
des suites.

### 5. Ce qui a changé

| Fichier                                  | Ce qui bouge                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `domain/floor-policy.ts`                 | `UnlockEvidence.quantity: number \| null`, `quantityMet` symétrique de `volumeMet` |
| `domain/loaded-pricer.ts`                | la projection passe `quantity: null` ; le JSDoc dit ce que le code fait            |
| `domain/volume-tier-prices.ts`           | inchangé — `orderQuantityAt` rend un `number`, qui reste valide                    |
| `domain/__tests__/loaded-pricer.spec.ts` | le cas de non-régression, **rouge avant le correctif**                             |
| `domain/__tests__/floor-policy.spec.ts`  | le cas symétrique sur la porte : quantité non mesurée = non remplie                |

### 6. Ce qui le prouve

- `loaded-pricer.spec.ts` — « 🔴 n'ouvre pas la porte dynamique sur une porte de
  QUANTITÉ », avec une politique `{ minQuantity: 50, minVolumeRatioBp: null }` et
  un niveau projeté de 10 000. **Rouge avant, vert après.**
- `floor-policy.spec.ts` — la quantité non mesurée ne remplit pas une condition
  de quantité, exactement comme le volume non mesuré.
- La suite complète du contexte `pricing`, puis les portes du dépôt.

### 7. Ce que cette entrée laisse ouvert

_(Écrit avant la contradiction, et conservé tel quel : le §9 le remplace.)_

- **R26** (la lentille de C.4) reste entier. D rend le défaut prudent ; elle ne
  nomme toujours pas, **dans un type**, quelle question autorise quelles preuves.
  La lentille reste la bonne forme — R15 la rend seulement moins urgente.
- **R16** est indépendant : la mesure d'un engagement de portée famille est un
  autre bug, dans une autre méthode.

### 8. Ce que la contradiction a renversé — 2026-09-09

`vitruve` a été lancé sur les §1 à §7 avant qu'ils soient soumis, la règle du
dépôt l'imposant dès qu'un plan touche à l'argent. Il rend **trois BLOQUANT**.
Le premier est fondé, et il renverse une branche.

#### 8.1 🔴 La branche B a été écartée sur une affirmation fausse

J'ai écrit que l'écran « ne connaît pas le rythme de livraison ». **Il le
connaît, il le calcule, et il s'en sert déjà** :

```ts
// commitment-bench.ts, scenarioOf()
const quantity = cumulative - previous;
lineTotalMillicents: point.unitPriceMillicents * quantity,
```

Le nombre d'échéances est saisi par l'utilisateur, `stepsOf()` en dérive les
cumuls, et chaque échéance affiche **sa** quantité. La quantité de commande
n'était pas à inventer : elle existe à l'écran, et elle n'est pas envoyée.

C'est exactement la faute que ce dépôt s'est promis de ne plus faire — **décrire
l'existant de mémoire au lieu de l'ouvrir**. Elle est ici dans un tableau qui
sert à écarter la bonne branche.

#### 8.2 🟠 Une contradiction visible sur le même écran

`volume-tier-prices.ts` **rouvre délibérément** la porte au seuil sondé quand
aucun engagement ne couvre l'article — c'est un correctif écrit, commenté et
testé (`volume-tier-prices.spec.ts:158`). Après D, la grille annonce le plancher
dynamique à 100 pièces et la courbe annonce le mur dur au même nombre, **sur la
page qui affiche les deux**. Le §5 écrivait « `volume-tier-prices.ts` inchangé » :
vrai au typage, faux au sens.

#### 8.3 🟠 Le sens de l'erreur n'est pas neutre sur CET écran

Le banc existe pour qu'un commercial compare manque / promesse / excédent. Quand
le mur dur mord partout, les trois scénarios s'aplatissent et l'outil cesse de
montrer ce qu'il existe pour montrer. « On ne le découvre pas devant le client »
reste vrai le jour du devis, et devient faux le jour de la facture — à la baisse.

#### 8.4 Ce que je ne retiens pas, et pourquoi

- **La branche E** (« ne fermer la porte que sous engagement ») ne tient pas :
  `projectionLevels` demande **un point par niveau de cumul**, dédupliqué entre
  les trois scénarios. Un niveau n'appartient donc pas à une commande, avec ou
  sans engagement — il en sert plusieurs. Le défaut n'est pas « sous engagement »,
  il est dans la **charge**, qui ne dit que des cumuls.
- **La « double sémantique » du §2 de la contradiction** — les règles lisent `N`,
  la porte non — n'est pas une incohérence mais la distinction que le domaine
  écrit : un seuil de palier se lit sur le cumul, la porte d'un plancher sur la
  commande. Elle devient gênante quand les deux coïncident, ce qui est le vrai
  sujet du 8.2.
- **`quantityMet: false` devenu ambigu** (mesuré et court / pas de commande) est
  juste, et c'est la symétrie que D n'est pas allée chercher :
  `observedVolumeRatioBp` est consigné, la quantité ne l'est pas. Aucun front ne
  lit `quantityMet` aujourd'hui ; c'est noté au §9 plutôt que corrigé ici, la
  trace figée étant déjà le sujet de **R25**.

#### 8.5 Ce qui est livré malgré tout, et pourquoi

D **reste**, et R15 n'est pas déclarée close.

Ce que D ferme pour de bon : le banc ne peut plus annoncer un prix **sous le mur
dur**, c'est-à-dire une remise qu'aucune commande n'obtiendra jamais. C'est le
seul des deux écarts qui promet trop, et c'est celui qui se paie devant le
client. Le type garde ce qu'il a gagné : « il n'y a pas de commande » est
désormais un mot, et un appelant qui n'en a pas ne peut plus en inventer une.

Ce que D ne ferme pas : la **fidélité** du banc. La juger juste demande que la
charge dise quelle commande amène à chaque niveau — un contrat additif, une
requête, et un lot front qui renonce au partage des points entre scénarios. Ce
n'est pas un correctif, c'est une tranche, et elle appartient à Hugo.

### 9. Ce que cette entrée laisse ouvert

- 🔴 **La suite de R15** : la charge de projection porte la quantité de commande
  de chaque niveau, et la porte se juge dessus. Coût : contrat + query + front,
  et une décision sur le partage des points (24 niveaux maximum aujourd'hui,
  trois scénarios × N échéances sans partage).
- 🟡 **La symétrie de la trace** : `FloorDecision.unlock` consigne le volume
  mesuré et pas la quantité. Voisin de **R25**.
- **R26** (la lentille de C.4) reste entier : D rend le défaut prudent, elle ne
  nomme toujours pas dans un type quelle question autorise quelles preuves.
- **R16** est indépendant.

---

## R16 · 2026-09-09

**Constat** : [B.2](audit-du-moteur-a-la-facade.md) · **Registre** :
[R16](ce-qui-reste-a-faire.md) · **Gravité** : ~~🔴 prix faux à la caisse~~ —
**voir le §7 : le sens du défaut est inversé, et la question est commerciale
avant d'être technique.**

### 1. Le constat, retrouvé dans le code

`commitmentOf`
([`loaded-pricer.ts`](../../apps/lfd-api/src/b2b/pricing/domain/loaded-pricer.ts))
calcule `orderedBySku.get(item.sku) + quantity`, et le chargeur
([`pricing-materials.loader.ts`](../../apps/lfd-api/src/b2b/pricing/application/pricing-materials.loader.ts))
lit `customerVolumes.volumesFor(companyId, skus, window)` — une `Map` **par
SKU**, bornée aux SKU du panier.

Un engagement `category:viennoiserie`, 10 000 promis : le cumul d'une ligne de
croissants ne compte que les croissants. Ni les autres viennoiseries de
l'historique, ni les autres lignes du même panier.

**Précision utile, et elle borne le défaut.** Les lignes sont **fusionnées par
SKU** avant tarification (`order-line-pricing.service.ts:103`, que
`price-line.ts:58` ne fait que commenter), donc pour une portée `product` ou
`variant` la mesure est **juste**. Le défaut est exactement co-extensif aux deux
portées que rien ne sait mesurer : `category` et `global`.

⚠️ **Ce paragraphe ne dit pas dans quel SENS le prix se trompe, et le §7 montre
qu'il se trompe surtout dans l'autre.**

### 2. La racine — une portée déclarée dans un vocabulaire que la mesure ne parle pas

Un engagement déclare sa cible en **portées** (`global`, `category`, `product`,
`variant`). La seule mesure disponible, `CustomerVolumeReader`, parle **SKU**.
**Rien ne traduit entre les deux.** Alors chaque lecteur substitue ce qu'il a
sous la main :

| Lecteur                              | Ce qu'il substitue | Ce que ça produit                                      |
| ------------------------------------ | ------------------ | ------------------------------------------------------ |
| le tarificateur (chemin qui facture) | le SKU de la ligne | un prix faux — mais pas dans le sens écrit ici, cf. §7 |
| le suivi (`VolumeCommitmentsQuery`)  | le nombre **zéro** | un « volume atteint » inventé, typé comme une mesure   |

_(Le second est corrigé par cette entrée même — `null` depuis le 2026-09-09 ; il
est décrit au passé dans le §3 et au présent ici parce que c'est l'état trouvé.)_

C'est **la leçon de R15, un étage plus haut**. Là, `UnlockEvidence` ne savait pas
dire « il n'y a pas de commande » ; ici, `VolumeCommitmentView.orderedQuantity`
ne sait pas dire « ce n'est pas mesurable ». Dans les deux cas l'ignorance,
faute de mot, entre déguisée en mesure — et dans les deux cas le JSDoc juste
au-dessus affirme le contraire.

> Le commentaire de `reached()` dit : « le suivi **s'abstient** plutôt que
> d'inventer un chiffre qui passerait pour une mesure ». Il rend `0`, et la vue
> le type `number` sous un JSDoc qui dit « Mesuré, jamais promis ». L'abstention
> était l'intention ; le type ne l'a pas permise.

### 3. Ce que la lecture a trouvé au passage — quatre affirmations fausses

Elles ne sont pas des à-côtés : trois d'entre elles **justifient** un mécanisme,
et c'est la catégorie de commentaire que le dépôt tient pour la plus dangereuse.

| Où                                                       | Ce qui est écrit                                                              | Pourquoi c'est faux                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `schema.prisma` (`promised_quantity`)                    | « Il sert au SUIVI, **jamais au calcul** : c'est le cumul mesuré qui décide » | `retainedQuantity` fait `max(promis, livré)` — la promesse ouvre le palier dès la 1ʳᵉ commande |
| `packages/contracts/src/pricing.ts` (`promisedQuantity`) | « Sert à l'écran, **jamais au calcul** »                                      | idem — la même phrase, dans le contrat servi                                                   |
| `packages/contracts/src/pricing.ts` (`orderedQuantity`)  | « Mesuré, jamais promis : **c'est lui qui décide du palier** »                | c'est `max(promis, livré)` qui décide ; et sur `category`/`global` ce n'est même pas mesuré    |
| `volume-commitments.query.ts` (`reached`)                | « le suivi **s'abstient** plutôt que d'inventer un chiffre »                  | il rend `0`, que la vue présente comme une mesure                                              |

Les deux premières sont déjà au registre sous **R20** ; elles sont nommées ici
parce qu'elles vivent à trois lignes du code qu'on répare, et qu'une doc fausse
laissée en place pendant qu'on corrige le code d'à côté est une doc qu'on
approuve.

### 4. Les branches

| Branche                                           | Ce qu'elle fait                                                                                                               | Ce qu'elle coûte                                                                                                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — interdire l'imesurable**                    | la signature n'accepte plus que `product` et `variant` ; un `CHECK` en base ; le cas spécial du suivi meurt                   | **une capacité perdue** — mais qui n'a jamais fonctionné. Exige de savoir si la production porte déjà de tels engagements : je ne peux pas l'interroger                                |
| **B — apprendre à la mesure à parler portée**     | un port `orderedInScope(companyId, scope, window)` qui résout l'ensemble de SKU (catalogue pour `category`/`global`) et somme | une lecture catalogue sur le chemin qui facture **quand un tel engagement existe** ; et `pricing → orders` pour le catalogue, dépendance déjà signalée par **R26**                     |
| **C — figer la famille sur la ligne de commande** | colonne `category_snapshot` additive, puis la mesure se fait en SQL sans traverser de contexte                                | une migration en trois déploiements **et** une reprise d'historique : la famille d'aujourd'hui n'est pas celle sous laquelle une vieille ligne a été commandée. On réécrirait le passé |
| **D — ne rien mesurer, mais le DIRE**             | `orderedQuantity: number \| null` ; le tarificateur refuse d'ouvrir un palier sur un engagement imesurable                    | change **le prix d'un client vivant** sans décision commerciale. À ne pas faire seul                                                                                                   |

### 5. Ce que je recommande, et ce qui me bloque

**A**, et pour la raison qui gouverne tout ce dépôt : la hiérarchie des
garde-fous commence par « inexprimable ». `category` et `global` sont
aujourd'hui **signables mais ni tarifables ni suivables** — la capacité n'existe
pas, seule son apparence existe. La retirer rend le reste juste **par
construction**, sans une ligne de mesure nouvelle, sans lecture supplémentaire
sur le chemin qui facture, et supprime le cas spécial du suivi au lieu de le
réparer.

**Ce qui me bloque, et je ne le contourne pas** : A n'est sûre que si la
production ne porte aucun engagement `category` ou `global`. Poser le `CHECK`
sans le savoir ferait échouer un déploiement. La requête est en lecture seule,
elle tient en une ligne, et elle rejoint les trois de **R12** que personne n'a
encore lancées :

```sql
SELECT scope_type, count(*)
FROM volume_commitments
WHERE archived_at IS NULL
GROUP BY scope_type;
```

Si la réponse ne contient que `product` et `variant`, A est un petit lot. Si
elle contient autre chose, la question n'est plus technique : ces clients ont un
prix, et il faudra décider si on le corrige (B) ou si on le laisse tel quel en
fermant la porte derrière.

### 6. Ce qui est livré aujourd'hui, et ce qui ne l'est pas

**Livré**, parce que vrai quelle que soit la branche :

- les **quatre affirmations fausses** du §3, corrigées et datées sur place ;
- `VolumeCommitmentView.orderedQuantity` devient `number | null` — l'abstention
  que le commentaire revendiquait est **dicible**, donc réelle. Aucun front ne
  lit cette vue (R6 : l'engagement n'a pas d'écran), donc rien ne casse ;
- la route de signature gagne son **premier e2e**. Elle n'en avait aucun : le
  seul `commitment` des suites était un semis direct, qui éprouve la
  tarification et pas la signature.

**Trouvé en écrivant cet e2e, et corrigé** : un recouvrement d'engagements
répondait **400**. La règle et le barème répondent **409** sur le fait
identique, et `VolumeCommitmentNotFoundError` répondait 400 au lieu de 404.
C'était la ligne **R18** du registre ; elle est désormais un cas rouge devenu
vert, sur les deux erreurs de l'engagement. Le gabarit, l'autre moitié de R18,
n'est pas touché.

**Rien du correctif de R16 lui-même.**

**Pas livré, et volontairement** : la mesure. Chacune des quatre branches change
un prix ou retire une capacité — c'est une décision commerciale déguisée en
correctif, et la faire seul serait exactement ce que le §3 reproche aux
commentaires qu'il corrige.

### 7. Ce que la contradiction a renversé — 2026-09-09

`vitruve` rend **trois BLOQUANT**. Les trois tiennent, et le premier retourne
l'entrée.

#### 7.1 🔴 Le sens du défaut est inversé, et le régime dominant n'est pas celui décrit

Vérifié en suivant la chaîne : `commitmentOf` pose
`cumulativeQuantity = retainedQuantity = max(promis, cumulSku)`, et
`volumeQuantityOf` (`price-rule.ts:220`) rend `cumulativeQuantity ?? quantity` —
c'est donc lui que le barème et la mercuriale lisent.

Conséquence pour `category:viennoiserie / 10 000` : **chaque ligne de la famille
résout son barème à 10 000**, quelle que soit la quantité commandée. Dix
croissants sont facturés au palier 10 000, et le pain au chocolat aussi. La
promesse n'est pas partagée : elle est appliquée **en entier, à chaque SKU**.
Pour `global`, c'est le catalogue entier qui bascule.

Le défaut de mesure que cette entrée décrit — le cumul par SKU — n'agit donc que
dans le régime `cumul de famille > promesse`, le seul où le `max` bascule. C'est
un cas **marginal**, et c'est le seul où le prix est trop haut. Dans le régime
courant, le prix est trop **bas**.

**Ce que ça casse dans le raisonnement** : la branche B ne corrige pas ce
prix-là. `max(promesse, sommeDePortée)` laisse chaque ligne au palier de la
promesse entière tant que le cumul de famille reste dessous. **Aucune des quatre
branches n'adresse le régime dominant** — parce qu'il n'est pas un bug tant que
la question suivante n'est pas tranchée.

> 🔴 **La vraie question, et elle n'est pas technique.** Une promesse de 10 000
> sur une FAMILLE se **partage**-t-elle entre ses articles, ou s'applique-t-elle
> **à chacun** ? Le code fait aujourd'hui la seconde. Aucun document du dépôt ne
> tranche ; tous les exemples sont par article. Tant qu'elle n'a pas de réponse,
> « corriger la mesure » n'a pas de cible.

#### 7.2 🔴 La requête de déblocage du §5 est fausse

Un `CHECK` s'applique à **toutes** les lignes, archivées comprises — seule la
contrainte d'exclusion est partielle. Un engagement `category` **clos l'an
dernier** ferait donc échouer le déploiement, et ma requête, filtrée sur
`archived_at IS NULL`, l'aurait déclaré vert. La panne que le §5 disait éviter
était dans la ligne écrite pour l'éviter. La bonne :

```sql
SELECT scope_type, archived_at IS NULL AS vivant, count(*)
FROM volume_commitments
GROUP BY 1, 2;
```

#### 7.3 🔴 « Une capacité qui n'a jamais fonctionné » est faux

Elle fonctionne : elle se signe, elle est **tarifée** (7.1 — elle ouvre le palier
promis sur toute la famille, ce qu'un commercial appellerait « ma famille
viennoiserie à 10 000 »), et depuis aujourd'hui elle est testée. **A ne retire
donc pas une apparence : elle AUGMENTE le prix d'un client vivant** — exactement
le reproche que le §4 faisait à la branche D.

#### 7.4 La branche que je n'avais pas vue, et qui est la moins chère

**A′ — interdire ET convertir.** Chaque engagement de famille devient un
engagement `product` par SKU de la famille, **même volume promis**. Comme le prix
ne dépend aujourd'hui que de la promesse appliquée à chaque article (7.1), la
conversion **reproduit le prix à l'identique** — tout en rendant la mesure juste
et le suivi mesurable. `volume_commitments_no_overlap` l'autorise, les cibles
étant différentes.

C'est A sans le changement de prix, **si** la réponse à la question du 7.1 est
« à chacun ». Si elle est « partagée », aucune branche du §4 ne convient et il
faut concevoir le partage.

#### 7.5 Ce que le tableau du §4 sous-estimait

- **B est moins chère que dit pour `global`** : il suffit de retirer le filtre
  `sku IN (…)` du lecteur — une agrégation, même coût. Mais elle impose de
  reclefer `PricingEvidence.orderedBySku` **par engagement**, ce que le §4 ne
  chiffrait pas.
- **B porte le défaut qui condamnait C** : mesurer une famille par le catalogue
  d'**aujourd'hui** attribue à l'historique les appartenances actuelles. « On
  réécrirait le passé » — le reproche fait à C vaut pour B, et je ne l'avais pas
  vu.
- **A n'est pas un « petit lot »** : `priceScopeSchema` est **partagé** avec les
  règles et les planchers ; le resserrer les casserait. Il faut un schéma dédié,
  un refus dans l'agrégat, une erreur nommée, et le `CHECK` — quatre endroits.
- **A est la seule branche irréversible.** Le `CHECK` est un resserrement au sens
  du §0 de `CLAUDE.md` ; revenir demanderait la migration inverse **et** une
  re-signature commerciale.
- **La trace figée reste fausse quoi qu'on fasse.** `pricing_commitment` sur les
  lignes déjà écrites consigne un cumul par SKU sous un `commitmentId` de portée
  famille. Aucune branche ne reprend le passé, et le cumul d'alors n'est pas
  reconstituable.

#### 7.6 Ce que ma propre livraison a coûté

`orderedQuantity: number | null` inscrit `category` dans un **contrat servi**. Si
A ou A′ passe, ce `null` devient inatteignable et son retrait demande trois
déploiements. Livrer « ce n'est pas mesurable » puis recommander « ce n'est pas
signable » est un aller-retour — il est petit, il est assumé, et il est écrit ici
plutôt que découvert plus tard.

De même, le commentaire de `volume_commitments_no_overlap` qui justifie son
`coalesce` par « la portée globale est justement celle dont le `scope_id` est
NULL » deviendrait une justification sans objet sous A. À corriger dans le même
lot.

#### 7.7 Ce que je recommande maintenant

**Rien, avant une réponse à la question du 7.1.** Elle est commerciale : une
promesse de famille se partage-t-elle ou s'applique-t-elle à chacun ?

- « à chacun » → **A′**, précédée de la requête corrigée du 7.2 ;
- « partagée » → aucune branche du §4 ne suffit : il faut concevoir un partage
  de promesse, ce qu'aucun document ne décrit et qu'aucun code n'esquisse.

Ce n'est pas une dérobade : recommander A sur le tableau du §4 aurait augmenté le
prix d'un client vivant sur la foi d'une phrase — « ça n'a jamais fonctionné » —
que je n'avais pas vérifiée.

---

## R20 · 2026-09-09

**Constat** : [B.6](audit-du-moteur-a-la-facade.md) · **Registre** :
[R20](ce-qui-reste-a-faire.md) · **Gravité** : 🟠 aucune ligne de code, et c'est
ce qui la rend traître.

### 1. Pourquoi celle-ci se traite seule

Les deux entrées précédentes ont buté sur une décision. Celle-ci n'en demande
aucune : le code va bien, c'est la doc qui ment sur lui. Le seul risque est de
**réécrire de mémoire** — exactement la faute qui a coûté deux allers-retours ce
matin. D'où la règle appliquée ici : **chaque item a été rouvert dans le code
avant d'être corrigé**, aucun ne vient de la liste de l'audit sans vérification.

Elle a payé deux fois. Une affirmation de l'audit était **incomplète** (§3), et
un document se comptait mal **lui-même** (§4) — ni l'un ni l'autre n'était dans
la liste de départ.

### 2. Ce qui a été corrigé

| Document                             | Ce qu'il disait                                                | Ce que le code dit                                                               |
| ------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `architecture-resolution-de-prix.md` | « la promesse ne calcule rien »                                | `max(promis, livré)` — **le même document le dit 380 lignes plus bas**           |
| idem                                 | `amount_cents`, `basePriceCents`, `resultCents`, `finalCents`  | millicentimes partout ; la colonne s'appelle `amount_millicents`                 |
| idem                                 | la trace d'engagement porte **trois** champs                   | **quatre** — et le quatrième explique un palier ouvert par la promesse           |
| idem                                 | « ce qui a disparu est la nécessité de refaire le calcul »     | `supersededIn` rejoue `winnerOf` par étage, à chaque article                     |
| `ecrans-de-tarification.md`          | comparatif : « une observation par **CLIENT** »                | une observation **par palier**, et le code l'écrit                               |
| idem                                 | « une mercuriale peut être posée en `alter` »                  | jamais — corrigé dans le JSDoc le 2026-09-08, laissé ici                         |
| idem                                 | « la simulation est pure et vit côté écran »                   | c'est **R2**, le premier défaut du dossier                                       |
| idem                                 | « le **seul** fichier de domaine à importer `@lfd/contracts` » | quatre dans `pricing/domain`, dix-huit dans `orders/domain`                      |
| idem                                 | un gabarit « fabrique des règles de l'étage `mercuriale` »     | il écrit **une `CompanyMercuriale`** — une ligne, donc atomique                  |
| `architecture-prix-boutique.md`      | « §3 tient toujours — la liste résout à 1 »                    | la vitrine **publique ne résout pas** : elle sert le canonique du miroir (R22)   |
| `optimisation-resolution-de-prix.md` | « Le fait » : trois lectures par article, dans `resolveOne`    | quatre lectures **par lot** ; `resolveOne` n'existe plus                         |
| `../README.md` (index global)        | sept lignes périmées                                           | S5 livré, le défaut à 1,83924 € clos, B5 fermée, deux registres clos, un todo 🔴 |

### 3. Ce que l'audit avait sous-estimé

Il notait « **six** lignes périmées sur vingt-deux » dans l'index global. Il y en
a **sept** : `todos/todo-ecran-tarification-ignore-les-baremes.md` y est encore
🔴 alors que son propre fichier s'ouvre sur « ✅ Clos le 2026-09-09 », test de
fermeture cité. Un index qui contredit le document qu'il indexe est pire qu'un
index absent.

### 4. Ce que personne n'avait vu — un document qui se compte mal lui-même

Le §7 de [`comprendre-une-mercuriale.md`](mercuriales/comprendre-une-mercuriale.md)
ouvrait sur « cette section listait **cinq** limites, **quatre** sont levées ».
Elle en réécrit **cinq** au présent et en garde **une** : elle en listait donc
six. Les deux index recopiaient « six limites mesurées », ce qui se lit comme
« six limitations existent » alors que cinq sont tombées.

Ce n'est pas une coquetterie de compte : c'est un bandeau écrit pour **empêcher**
qu'on construise un contournement à un problème résolu, et il laissait croire
qu'il en restait cinq fois plus.

### 5. Ce qui n'est PAS fait, et pourquoi

**Les dates.** Le registre et les documents refaits le 2026-09-08 portent
2026-09-09. L'écart est **nommé** dans l'en-tête du registre plutôt que corrigé,
et c'est délibéré : réécrire une trentaine de dates de mémoire les transformerait
en suppositions, alors que `git log` les porte exactement. Une date fausse qui se
sait vaut mieux qu'une date fausse qui ne se sait plus.

**Le commentaire `value // bp si percent, cents si amount` de `schema.prisma`**
est faux de la même façon — mais il appartient à **R19** (treize commentaires qui
disent « centimes » sur des millicentimes), et le corriger ici en aurait fait le
quatorzième traité sans sa porte.

### 6. La méthode, pour la prochaine fois

Une doc périmée ne trompe pas comme un code faux : elle **gèle**. Personne ne
construit contre elle, tout le monde construit **à côté**. Deux traitements, dans
cet ordre :

1. **la phrase fausse est barrée, pas effacée**, et la vraie est écrite en
   dessous avec sa date. L'effacer laisse le lecteur suivant croire qu'elle a
   toujours été juste — et il ne comprend pas pourquoi le code d'à côté porte
   des cicatrices ;
2. **une section entièrement périmée est conservée pour son raisonnement** et
   marquée en tête (`optimisation-resolution-de-prix.md`, « Où le calcul vit »).
   La supprimer perdrait le POURQUOI, la seule chose qu'un document sache garder
   mieux que le code.

---

## R22 · 2026-09-09

**Constat** : [B.8](audit-du-moteur-a-la-facade.md) · **Registre** :
[R22](ce-qui-reste-a-faire.md) · **Gravité** : 🟠 un trou **commercial** — une
promotion que personne ne voit ne fait pas vendre.

### 1. Le constat, et ce qui l'a caché

`ReadShopCatalogueHandler`
(`apps/lfd-api/src/b2b/catalog/application/queries/read-shop-catalogue.ts`) sert
`item.unitPriceMillicents` du miroir — le **canonique**, jamais résolu. Une
promotion publique (`audience: all`, −10 % sur les viennoiseries) est donc
invisible au rayon et n'apparaît qu'au panier, où `/shop/quote` la résout.

**Ce qui l'a caché est une justification fausse**, et elle est dans le contrat :

> ⚠️ **C'est le prix CANONIQUE.** Un client connecté à qui l'on a consenti une
> mercuriale paiera moins, et cette route ne le sait pas — **elle est publique,
> donc sans client.**

Elle confond deux choses. Un prix **négocié** exige un client : vrai, la route
publique ne peut pas le servir. Une **promotion publique** n'en exige aucun —
`matchesAudience` rend `true` sans rien regarder pour `audience: all`. « Publique
donc canonique » est présenté comme une nécessité alors que seul « publique donc
pas de prix négocié » l'est.

**Et le raisonnement a contaminé la route reconnue** :

```ts
// read-my-shop-catalogue.ts
// Résoudre à `companyId: null` rendrait la même chose en payant quatre requêtes pour rien.
if (query.companyId === null || catalogue.items.length === 0) return catalogue;
```

Non : ça rendrait la promotion. **Deux** routes ratent donc le même prix, dont
une qui croit avoir mesuré que c'était inutile.

### 2. Le piège qu'une implémentation naïve aurait posé

`PricedItem.category` n'est **pas** le `shelfId` de la vitrine. La vitrine
expose `shelfId = categoryId` (la famille du PIM, `cat_vien`), tandis que le
tarificateur attend le **rayon** (`viennoiserie`), dérivé par
`SHELF_BY_PIM_CATEGORY` dans `apps/lfd-api/src/b2b/catalog/infrastructure/catalog-backed-product-catalog.ts`
— dont le commentaire prévient : « un rayon faux ferait appliquer les règles de
prix d'une AUTRE famille ».

Construire un `PricedItem` depuis la vue aurait donc silencieusement fait rater
toutes les règles de portée `category` sur la boutique. C'est le même genre de
divergence que celle qu'on répare.

### 3. Ce qui est décidé, et par qui

**Hugo, le 2026-09-09** : la baisse des prix publics **est le but** ; on veut le
prix promo **et** le tarif pro barré ; la logique doit être **uniforme** entre
les deux routes ; **pas de barré quand il n'y a pas d'écart**.

### 4. La conception

**Une seule logique, deux appelants qui ne diffèrent que par `companyId`.**

Un service `ShopCataloguePricing` dans `b2b/catalog/application/` :

```
listSellable → shopCatalogueOf → PricingMaterialsLoader.pricerFor(items, {companyId}, at)
             → LoadedPricer.priceAll(items, quantité 1)
             → prix résolu ; canonique barré SI et SEULEMENT SI les deux diffèrent
```

- `ReadShopCatalogueHandler` appelle `priced(null)` ;
- `ReadMyShopCatalogueHandler` appelle `priced(companyId)` et **perd son
  court-circuit** ainsi que sa dépendance à `OrderLinePricing` — composer un
  panier pour obtenir des prix unitaires était déjà de trop, un catalogue n'est
  pas un panier.

**Pourquoi `PricingMaterialsLoader` et non `Pricer`.** La façade relit le
catalogue (`resolveMany`) alors qu'on l'a déjà en main : ce serait une lecture de
plus sur la seule route anonyme du dépôt. Le JSDoc de `Pricer` le dit lui-même —
« un appelant qui charge déjà en lot s'adresse au `LoadedPricer` directement ».

**Où vit la table des rayons.** `SHELF_BY_PIM_CATEGORY` descend dans `catalog/`,
d'où vient son entrée (`CatalogCategoryProjection` y tient déjà le miroir des
familles), et `orders/` l'importe — le sens autorisé, `OrdersModule` important
déjà `CatalogModule`. Sans ce déplacement, la logique partagée devrait vivre
dans `orders/`, et la route publique ne pourrait pas l'atteindre sans cycle.

**Le cycle est vérifié** : `PricingModule` n'a **aucun** `imports:`.
`CatalogModule → PricingModule` n'en crée donc pas.

### 5. Le coût, et ce qu'on ne fait pas

**Quatre lectures de plus sur la seule route anonyme** (60/min/IP, aucun cache
dans `b2b/catalog` aujourd'hui). À `companyId: null` la réponse est **identique
pour tous les visiteurs** — un cache d'une entrée suffirait. **On ne le pose
pas** : il amènerait l'invalidation, et une promotion posée doit apparaître au
rayon immédiatement, ce que `price-rules.e2e-spec.ts` exige déjà pour les
règles. Le coût est **épinglé par un test** plutôt que supposé —
`pricing-budget.e2e-spec.ts` compte les opérations ORM.

**On ne touche pas à la quantité.** La vitrine résout à **1**, comme
aujourd'hui : un palier « à partir de 50 » ne se voit pas au rayon, et c'est la
limite assumée du §3 d'`architecture-prix-boutique.md`.

### 6. Ce qui le prouvera

- un e2e : une promotion `audience: all` posée **se voit au rayon**, canonique
  barré — rouge avant ;
- un e2e : **sans** promotion, aucun champ barré, et la surface publique reste
  étroite (`shop-catalogue.e2e-spec.ts:117` énumère les clés et devra changer,
  ce qui est le point) ;
- la parité rayon ↔ devis sur le même article ;
- le budget d'opérations ORM de la route publique.

### 7. Ce que la contradiction a renversé — 2026-09-09

`vitruve` rend **trois BLOQUANT**, et **deux étaient déjà dans le code écrit**.
Les deux ont été corrigés avant le premier test vert ; le troisième est une
conséquence à assumer, pas un défaut.

#### 7.1 🔴 La vitrine anonyme serait tombée en 500 sur une famille inédite

`shelfOfCategory` **lève** sur une famille sans rayon — la bonne réponse au
checkout : mieux vaut ne pas vendre que facturer au hasard. Appliquée telle
quelle à la vitrine, une seule famille que le PIM vient d'inventer aurait fait
tomber **toute la page**, en 500, pour tous les visiteurs — alors qu'avant R22
cette route survivait, ne traversant pas la table.

Corrigé : l'article sans rayon sort **à son tarif**, non tarifé, et la page
tient. Ce n'est pas un prix inventé — c'est le canonique, exactement ce que la
route servait la veille —, et la famille inconnue reste refusée là où elle
compte : au moment de commander.

#### 7.2 🔴 Le prédicat de rature était faux dans un sens

Le plan écrivait « barré si et seulement si les deux **diffèrent** ». Or un prix
résolu peut **monter** au-dessus du tarif — une altération `increase`, une règle
`replace` posée plus haut, un plancher qui relève (`resolve-price.ts:121`). La
vitrine aurait alors barré le prix le plus **BAS** et affiché une référence
mensongère sur une page publique.

Corrigé : la rature exige une **baisse**. Le prix servi, lui, suit dans les deux
sens — c'est celui qui sera facturé.

> ⚠️ **Le défaut existait déjà**, dans le `priced()` de la route reconnue, avec
> le même `!==`. Il est parti avec elle : les deux routes partagent désormais la
> fonction corrigée.

#### 7.3 🟠 Se connecter peut faire MONTER les prix affichés

Une mercuriale **scelle** : un client qui en a une n'obtient pas la promotion du
moment. Avant R22 les deux routes servaient le canonique, donc l'écart était
invisible. Désormais un visiteur voit la promotion, et ce client-là voit sa
mercuriale — qui peut être **moins avantageuse** que la promo du jour.

**Ce n'est pas un défaut introduit, c'est un fait révélé** : c'est déjà le prix
que la caisse lui applique. Le masquer était l'ancien bug — un écran qui annonce
autre chose que la facture. Ce que ça ouvre est une question commerciale que le
moteur ne peut pas trancher : **une mercuriale doit-elle perdre contre une
promotion publique plus généreuse ?** Aujourd'hui elle gagne, par scellement.
Signalé à Hugo, non tranché ici.

#### 7.4 Ce que le §5 chiffrait mal

« Quatre lectures de plus » était faux dans les deux sens. À `companyId: null`,
**deux lecteurs répondent sans requête** — un visiteur n'a ni engagement ni
mercuriale —, et les trois autres passent par `PricingMaterialsCache`, qui porte
déjà son invalidation et son estampille : une rafale de visiteurs coûte une
lecture d'estampille.

Ce qui n'est pas caché, et que le plan avait raté : si un plancher visant ces
articles porte une **porte de volume**, le chargeur ajoute deux agrégats
d'historique par appel, sur la route anonyme. Aucun plancher public n'en porte
aujourd'hui ; le jour où l'un en portera, c'est là que le cache de réponse se
posera. Écrit dans le service plutôt que dans un registre.

Le refus du cache est donc reformulé : ce n'est pas « l'invalidation coûterait
trop cher » — `PricingMaterialsCache` la porte déjà — mais « un second cache
demanderait une seconde invalidation à tenir d'accord avec la première », pour
un gain nul tant que la porte de volume est absente.

#### 7.5 Ce qui a été corrigé en plus, parce que ce lot les rend fausses

Trois justifications, pas une : le JSDoc de `unitPriceMillicents` (« c'est le
prix CANONIQUE »), celui de `catalogPriceMillicents` (« la route publique n'a pas
de client, donc aucun écart à montrer ») et celui de `ShopCatalogueController`.
Toutes datées.

### 8. Ce qui le prouve

- `shop-catalogue.e2e-spec.ts` — trois cas, **rouges avant le correctif**
  (200 000 servi au lieu de 180 000) : la promotion se voit au rayon avec le
  tarif barré ; **rien n'est barré** quand le prix résolu monte ; et le rayon
  annonce **le prix que le devis chiffre**.
- Les treize cas de `my-shop-catalogue.e2e-spec.ts` passent inchangés — dont
  celui d'un demandeur sans société, qui prend le chemin `companyId: null`.
- Les deux cas qui énumèrent les clés de la vue publique passent **sans
  modification** : sans promotion, aucun champ barré n'apparaît. C'est la règle
  « pas de promo, pas de barré » vérifiée par un test qui ne la vise même pas.

---

## R23 · 2026-09-09

**Constat** : [B.9](audit-du-moteur-a-la-facade.md) · **Registre** :
[R23](ce-qui-reste-a-faire.md) · **Gravité** : 🟠 un nombre faux sur l'écran où
l'on décide de signer.

### 1. Ce que l'audit disait, et ce qui était plus grave

Il relevait une **formule interdite** : `mercuriale-row.ts` calculait
`Math.round((canonique × floor.value) / 10_000)`, que `resolve-floor.ts:67`
proscrit nommément — « les deux divergeraient d'un centime sur certaines
valeurs, et l'écran promettrait alors une marge que la caisse refuserait ».

En ouvrant les deux fichiers, le défaut n'est pas l'arrondi. Il est dans le
**champ lu** : `PriceFloorView.mode/value` porte le **mur dur**, la porte
dynamique vivant dans son champ `dynamic`. Sur un article dont la porte s'ouvre,
la grille annonçait donc le MUR là où la caisse applique la PORTE — une limite
plus HAUTE que la vraie, c'est-à-dire **moins de marge que le commercial n'en
avait**. Un écart d'un centime aurait été le moindre de ses problèmes.

Et le bon nombre était déjà servi : `negotiationRoom.floorMillicents`, « le
plancher qui s'applique, ramené en centimes sur CET article », calculé par
`floorMillicentsFor` **après** `decideFloor`. L'écran n'avait pas à calculer, il
avait à lire.

### 2. L'audit désigne la mauvaise fonction

Il écrit que `impactBp` réimplémente `discountBp`, « descendu dans `@lfd/money` ».
Non : `discountBp` borne à zéro (`Math.max(0, …)`), quand `impactBp` rend
**−1000** sur un article devenu plus cher — et l'écran affiche cette direction
(`'is-' + direction(row.impactBp)`). Les substituer aurait effacé le cas
« plus cher » d'une colonne qui existe pour le montrer.

La bonne est **`gapBp`** : même formule, même `null` quand la référence est
nulle, même convention de signe. Un calque exact.

### 3. Ce que personne n'avait compté

`gap.ts` a été créé le 2026-09-08 parce que la même division existait en **cinq
exemplaires**, avec trois réponses différentes au cas du canonique nul — son
JSDoc en dresse le tableau. `impactBp` en est un **sixième**, que l'inventaire
n'avait pas vu.

Un module écrit pour unifier une formule, et dont l'inventaire est incomplet,
laisse croire que le travail est fini. Le tableau porte désormais six lignes et
dit qu'il en portait cinq.

### 4. Ce qui a changé

| Fichier                                     | Ce qui bouge                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `mercuriale-row.ts`                         | `floorMillicentsOf` **lit** `negotiationRoom.floorMillicents` ; `impactBp` disparaît au profit de `gapBp` |
| `mercuriale-mix.ts`, `locate-simulation.ts` | les deux autres appelants suivent — même signature, un article au lieu d'un plancher et d'un canonique    |
| `packages/money/src/gap.ts`                 | le tableau passe de cinq à six exemplaires, daté                                                          |
| `__tests__/mercuriale-row.spec.ts`          | le cas de non-régression : la porte ouverte, pas le mur                                                   |

Après ce lot, **aucune formule de plancher ne subsiste au front** (vérifié par
`grep` le 2026-09-09). `effectiveFloor` y reste lu, mais pour ce qu'il est : une
identité — sa portée, son héritage, sa péremption —, jamais une valeur.

### 5. Ce qui le prouve

- `mercuriale-row.spec.ts` — « 🔴 rend la PORTE ouverte, pas le mur dur » ;
- les 96 cas de `commercial/tarification` passent, dont ceux qui décrivaient la
  limite par son ancien champ ;
- les 58 cas de `@lfd/money`.

### 6. Ce que ce lot NE ferme pas

**R2 reste entier.** La simulation rejoue toujours les paliers dans le
navigateur ; ce lot lui retire une formule fausse, il ne lui retire pas le
calcul. Les deux fichiers de `simulation/` touchés ici le sont parce qu'ils
appelaient la même fonction, pas parce que leur sujet est réglé.

---

## R25 · 2026-09-09

**Constat** : [B.11](audit-du-moteur-a-la-facade.md) · **Registre** :
[R25](ce-qui-reste-a-faire.md) · **Gravité** : 🟡 un trou dans la promesse
centrale du système — « un prix qu'on peut défendre six mois plus tard ».

### 1. Ce que l'audit annonçait, et ce qu'il y avait vraiment

Il demandait « deux colonnes additives ». En ouvrant les fichiers, le travail se
coupe en deux moitiés de nature **différente**, et l'une ne coûte pas de colonne
du tout.

**« Pourquoi ma promotion ne s'est pas appliquée ? » a trois réponses** —
expirée, évincée, scellée. Sur une commande close, la trace n'en gardait
**aucune** : dans les trois cas la règle n'apparaît nulle part.

### 2. La moitié gratuite — un fil jamais branché

`priceStepsSchema` accueille `scope` et `supersedes` **depuis le 2026-09-03**,
avec leurs défauts (`null`, `[]`) pour qu'une trace ancienne reste lisible. Mais
`jsonSteps` — le mapping qui écrit la trace — s'arrêtait à quatre champs.

Conséquence : les deux champs valaient `null` et `[]` sur **toutes** les traces,
y compris celles écrites le jour même. Le lecteur était prêt, l'écrivain n'a
jamais été branché, et **le défaut couvrait le trou** : rien ne pouvait rougir.

> 🔴 **La leçon, et elle a déjà servi deux fois aujourd'hui.** Un défaut de
> lecture posé pour la compatibilité ascendante devient indistinguable d'un fil
> non connecté. Ici il a tenu six jours ; sur `orderedQuantity` (R16) c'était un
> `0` qui passait pour une mesure. Un défaut protège d'un passé — il ne doit
> jamais rendre le présent muet.

**Et une justification fausse par-dessus.** Le contrat écrivait que `scope` vaut
`null` « sur une trace **antérieure au 2026-09-03** ». Il imputait au calendrier
ce qui était un fil débranché — et une phrase qui accuse une date empêche de
chercher la cause. Corrigée, datée.

Coût réel : **deux lignes**, aucune migration.

### 3. La moitié qui coûte — le scellement

`sealedByRuleId` et `sealedRuleIds` sont des faits de **ligne**, pas d'étage. Ils
ne peuvent pas voyager dans `pricing_steps`, qui est un **tableau** d'étages.

### 4. Est-ce qu'une colonne est vraiment la bonne réponse ?

Six formes pesées, et cinq écartées **pour des raisons différentes** :

| Forme                                                              | Pourquoi non                                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C** — changer `pricing_steps` en objet `{ steps, seal }`         | casse la forme des lignes **déjà écrites**. C'est l'inverse d'additif : chaque trace passée deviendrait illisible, donc muette                                                       |
| **D** — porter le scellement dans le `supersedes` de la mercuriale | conflerait deux des **trois** réponses. « Évincée dans son étage » et « rendue transparente par un scellement » sont des faits distincts, et c'est précisément ce qu'on veut séparer |
| **F** — une étape de synthèse par règle scellée                    | une étape **est** le fait qu'une règle a produit un effet. Une règle scellée n'en produit aucun : tout lecteur qui parcourt `steps` lirait un prix qui n'a pas eu lieu               |
| **G** — une table `order_line_pricing_seals`                       | une jointure pour un fait toujours 1:0..1, sur un instantané qui n'est pas une entité. Plus cher à lire, plus cher à relire                                                          |
| **E** — recalculer à la lecture                                    | la doctrine du dossier, mot pour mot : « c'est un fait clos, on ne le recalcule jamais, on le relit ». Et les règles peuvent avoir disparu                                           |
| **B** — deux colonnes `sealed_by_rule_id` + `sealed_rule_ids[]`    | 🔴 **une liste scalaire Prisma ne peut pas être nulle** — elle vaut `[]` par défaut. « On ne sait pas » deviendrait indistinguable de « rien n'a été scellé »                        |

**B mérite qu'on s'y arrête**, parce qu'elle avait un argument fort : deux
colonnes acceptent un `CHECK` (`(sealed_by IS NULL) = (ids IS NULL)`), donc un
refus **en base**, plus haut dans la hiérarchie des garde-fous qu'un refus
applicatif. Elle tombe sur une contrainte de l'outil, et le dépôt a déjà tranché
exactement ce cas — pour les allergènes, `schema.prisma:2314` :

> « `Json` et non `String[]`, pour une raison précise : une liste scalaire Prisma
> ne peut pas être nulle, elle vaut `[]` par défaut — or il faut distinguer TROIS
> états. »

Ici les trois états sont les mêmes : `null` = trace antérieure (on ne sait pas),
`{ sealedByRuleId: null, sealedRuleIds: [] }` = **rien n'a été scellé** (une
affirmation), une valeur = ce qui a été scellé et contre qui.

**Retenue : A — une colonne `pricing_seal` `Json?`.** Ce n'est pas « comme les
autres » par mimétisme : `pricing_floor` et `pricing_commitment` sont exactement
le même genre de fait — un instantané de décision, à trois états, écrit une fois
et jamais relu autrement. La cohérence de forme est ici la cohérence du
raisonnement.

### 5. Ce que la migration fait, et ne fait pas

- **Additive et seule** : une colonne nullable, aucun `DEFAULT`, aucune reprise
  de données. Les lignes existantes restent `NULL`, ce qui est **la vérité** —
  on ne sait pas ce qui a été scellé sur une commande d'avant.
- **Réversible en un déploiement** : rien ne dépend de la colonne tant que le
  lecteur la traite comme optionnelle.
- **Aucun renommage, aucun resserrement.** Ce n'est pas le geste en trois
  déploiements du §0 de `CLAUDE.md` — c'est le premier des trois, et il se
  suffit.

### 6. Ce qui le prouvera

- un e2e : une promotion scellée par une mercuriale laisse, sur la ligne
  persistée, **qui** a scellé et **qui** a été écarté — le cas exact du test
  existant, qui aujourd'hui affirme `supersedes: []` avec un commentaire disant
  que le trou est là ;
- la relecture d'une ligne **sans** la colonne rend `null`, pas `[]` ;
- `lecteur-de-migrations` avant toute promotion.

### 7. Ce que la contradiction a renversé — 2026-09-09

`vitruve` rend **trois BLOQUANT**. Le premier vise du code **déjà bâti et vert**,
et les deux autres démolissent la forme du §4 avant qu'une ligne en soit écrite.
C'est la contradiction la plus rentable de la journée.

#### 7.1 🔴 Le §2 rouvrait au client ce que la route `quote` a été rétrécie pour lui cacher

Vérifié : `POST /orders/quote` rend une vue **rétrécie**, et son JSDoc dit
pourquoi — elle rendait « `steps` (l'identifiant et le **libellé commercial** de
chaque règle, plus **les rivales qu'elle a évincées**), `sealedByRuleId`,
`sealedRuleIds`, `floorMillicents` (le plancher, c'est-à-dire la marge) ».

Mais `GET /orders/mine`, `GET /orders/:id` et `GET /companies/:id/orders`
servent `OrderView` **sans rétrécissement**, et `OrderLineView.pricing` est la
trace entière. Écrire `supersedes` y aurait donc envoyé au client **le nom des
promotions qu'il n'a pas eues** — « Promo grands comptes −20 % ». Deux JSDoc
côte à côte se seraient contredits, et le mauvais des deux aurait gagné.

**Décision** : `scope` est écrit, `supersedes` ne l'est pas. Il attend le
rétrécissement des trois routes, qui est un lot à part et **une entrée neuve au
registre** — le trou existe déjà, ce lot ne fait que l'élargir.

> Vérifié aussi, et c'est ce qui rend le rétrécissement peu coûteux : **aucun
> front ne lit `line.pricing`** — ni la boutique, ni le back-office. La trace
> part au client, et personne ne l'affiche.

#### 7.2 🔴 `sealedRuleIds` ne répond pas à la question qu'on lui pose

Deux fois, et les deux se lisent dans `resolve-price.ts` :

- **seul le GAGNANT de l'étage scellé y entre.** Les autres règles applicables
  de cet étage disparaissent sans trace — ni étape, ni `supersedes`, ni
  `sealedRuleIds`. C'est le cas courant dès qu'un étage a plus d'une règle ;
- **c'est une liste de `string` nus.** Tout le reste de la trace fige
  `{ ruleId, label }`, et le JSDoc de `scope` dit pourquoi : un `ruleId` survit
  volontairement à la suppression de sa règle, « donc parfois pas du tout ».
  Persister des identifiants sans libellé produit une trace **muette six mois
  plus tard** — exactement la panne que R25 prétend fermer.

Une colonne posée sur cette forme coûterait une migration pour un fait illisible.

#### 7.3 🔴 Les causes sont CINQ, pas trois

`applicable` est calculé **après** le filtre de `specificity.ts` : une règle
expirée, suspendue, hors audience, hors portée, ou dont le seuil de quantité
n'est pas atteint n'entre ni dans `supersedes`, ni dans `sealedRuleIds`.

« Trois réponses » était donc déjà faux au §1, et la colonne du §4 n'en ferme
qu'une et demie. Poser `pricing_seal` maintenant, c'est s'engager à poser une
septième colonne de trace à la prochaine question.

#### 7.4 Ce que le §4 justifiait mal, tout en concluant juste

« `pricing_floor` et `pricing_commitment` sont exactement le même genre de fait —
un instantané à trois états » est **faux**. `schema.prisma` dit de
`pricing_commitment` : « `NULL` = aucun engagement ne couvrait cette ligne » —
une affirmation à **deux** états, pas une ignorance. Suivre cette analogie ferait
écrire `NULL` pour « rien n'a été scellé », c'est-à-dire précisément la confusion
contre laquelle le §4 argumentait.

Le choix A tient ; sa justification écrite était fausse, et c'est elle qu'on
relit.

**Et B a été écartée sur un argument qui ne la visait pas.** « Une liste scalaire
Prisma ne peut pas être nulle » est vrai de `String[]` — pas d'une variante
`sealed_by_rule_id String?` + `sealed_rule_ids Json?`, qui garde le `CHECK` en
base que le §4 reconnaissait lui-même comme plus haut dans la hiérarchie.

Une **septième forme** manquait au tableau : un discriminant sur l'étape
(`outcome: "applied" | "sealed" | "expired"`, défailli à `"applied"`), zéro
colonne et zéro migration, qui porterait les **cinq** causes du 7.3 au lieu de
deux. Le refus de F décrivait le choix actuel du type, pas une impossibilité.

#### 7.5 Ce qui est livré, et ce qui ne l'est pas

**Livré** : `scope` persisté, et les trois justifications fausses corrigées —
celle qui imputait à une date un fil débranché, celle qui jugeait l'éviction sans
intérêt pour une facture, et celle du schéma de relecture.

**Pas livré, et c'est la contradiction qui l'a décidé** : la colonne. Sa forme
est à reprendre — porter `{ ruleId, label }` plutôt que des identifiants nus,
couvrir les cinq causes plutôt que deux, et peser la septième forme. Poser une
migration sur `order_lines` pour un fait incomplet et muet aurait été le pire
usage possible d'un geste irréversible.

**Et « réversible en un déploiement » était faux** : le rollback applicatif est
gratuit, le `DROP COLUMN` détruit les scellements écrits entre-temps sans reprise
possible — et le §0 de `CLAUDE.md` interdit de supprimer une colonne. Une phrase
qu'on relit sous pression ne doit pas promettre ça.

---

## R26 · 2026-09-09 — lot 1

**Plan** : [`architecture-la-porte-du-prix.md`](architecture-la-porte-du-prix.md) ·
**Registre** : [R26](ce-qui-reste-a-faire.md) · **Portée** : le premier des
quatre lots.

### 1. Ce que ce lot fait, et pourquoi c'est le premier

`ProductCatalogReader` — **l'autorité de prix du checkout**, celle dont le JSDoc
dit « ne jamais faire confiance au prix envoyé par le client » — vivait dans
`orders/domain/ports/`. Son unique adaptateur de production ne fait pourtant que
**traduire** `CatalogReader`, le port de `catalog/` : deux ports empilés, dont
l'autoritaire logé dans le contexte qui n'en est pas la source.

C'est ce qui faisait importer `orders` par `pricing` **neuf fois**, pour une
donnée qui n'y est pas.

Le port descend donc dans `catalog/`, avec son adaptateur, son double en
mémoire, sa spec — et `UnknownSkuError`, qui est le refus que le catalogue
oppose à ce qu'il ne connaît pas.

> 🔴 **Le code d'erreur ne bouge PAS.** `UnknownSkuError` garde
> `"orders.sku.unknown"` : un code est une **valeur servie**, pas un nom de
> fichier. Le renommer serait un contrat cassé pour tout client qui l'aiguille.
> Même règle que `VAT_HANDLE_PREFIX`, qui vaut toujours `"tva-"`.

### 2. Ce qui a bougé

| Ce qui se déplace                                  | D'où → vers                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `product-catalog.reader.ts`                        | `orders/domain/ports/` → `catalog/domain/ports/`                                      |
| `catalog-backed-product-catalog.ts` **et sa spec** | `orders/infrastructure/` → `catalog/infrastructure/`                                  |
| `in-memory-product-catalog.ts`                     | idem                                                                                  |
| `UnknownSkuError`                                  | `orders/domain/errors/order-errors.ts` → `catalog/domain/errors/unknown-sku.error.ts` |
| le **fournisseur** Nest                            | `OrdersModule` → `CatalogModule`, qui l'exporte                                       |
| `PricerModule`, `PricingAdminModule`               | importaient `OrdersModule`, importent `CatalogModule`                                 |

### 3. Ce que ça ferme

- **`pricing` n'importe plus rien d'`orders`** — vérifié par `grep` : zéro
  import, contre neuf fichiers et deux modules avant ;
- **le JSDoc de `PricerModule` cesse de mentir.** Il justifiait sa propre
  existence par « le catalogue vit dans `OrdersModule`, qui importe déjà
  `PricingModule` : le ranger là-bas fermerait le cycle ». Le catalogue n'y vit
  plus. La contrainte, elle, **tient toujours** — mais pour une autre raison,
  écrite à sa place : `CatalogModule` importe `PricingModule` depuis que la
  vitrine tarife (R22).

### 4. Ce que ça NE fait pas

Aucune signature ne change, aucun comportement ne bouge. C'est un
**déménagement**, et c'est exactement ce qu'on lui demande : rendre les trois
lots suivants possibles sans avoir rien engagé.

⚠️ La v1 du plan appelait ce lot « à risque nul ». Il ne l'est pas : il touche
neuf fichiers, deux modules Nest et un port que la caisse consulte à chaque
commande. Ce qui est vrai, c'est qu'**aucun test n'a eu à être réécrit** — seule
une spec a suivi son code, comme `lint:tests-colocated` l'exige.

### 5. Ce qui le prouve

- **1 239 tests** de `src/b2b`, 142 suites, sans une assertion modifiée ;
- `lint:import-cycles` — aucun cycle ; `lint:context-boundaries` — tenues sans
  exception ; `lint:tests-colocated` — 278 specs ; `lint:price-pipeline` —
  toujours **1 entrée**, le moteur n'a pas été touché.

---

## R26 · 2026-09-09 — lot 2

**Plan** : [`architecture-la-porte-du-prix.md`](architecture-la-porte-du-prix.md) §4.2 · Le
deuxième des quatre lots : **la marque**.

### 1. Ce que la marque protège

Le port du catalogue porte la doctrine du checkout depuis toujours : « ne jamais
faire confiance au prix envoyé par le client ». Elle tenait par la
**discipline** — chaque appelant résolvait le catalogue avant de tarifer, et
rien ne vérifiait qu'il l'avait fait. **Six sites** construisaient l'article à
tarifer à la main, en traduisant `unitPriceMillicents` (le catalogue) en
`canonicalMillicents` (le moteur). Il aurait suffi qu'un seul se trompe de champ.

`CatalogArticle` porte un `unique symbol` **non exporté** : hors du fichier qui
le déclare, la clé n'est pas nommable, donc l'objet ne se construit pas. Le port
le pose sur chaque `CatalogItem`, et `PricingMaterialsLoader.pricerFor`
**l'exige** — c'est là que la marque mord.

Les six traductions sont devenues **une**, dans la frappe.

### 2. Ce que la marque ne fait PAS, vérifié plutôt que supposé

Une première rédaction du plan affirmait qu'« un canonique fabriqué ne compile
pas ». Essayé, le 2026-09-09 :

| Ce qu'on écrit                 | TypeScript |
| ------------------------------ | ---------- |
| `{ sku, canonicalMillicents }` | ✅ refusé  |
| `{ … } as CatalogArticle`      | ⚠️ compile |
| `objetTypé as CatalogArticle`  | ⚠️ compile |

`lint:no-type-escapes` ne refuse que `as unknown as`. La marque bloque donc
**l'accident** — le cas réel — et pas la **fraude**. D'où
`lint:catalogue-authority`, qui refuse hors de `b2b/catalog/` la frappe **et**
`as CatalogArticle`. Cran 1 de la hiérarchie pour ce qui se fait par mégarde,
cran 4 pour ce qui se ferait exprès.

### 3. 🔴 Ce que la marque a trouvé le jour même

La lecture datée du tableau (`GET /admin/pricing?at=`) rejoue le tarif d'alors.
Elle le faisait **par un spread** :

```ts
return { ...item, unitPriceMillicents: past.unitPriceMillicents };
```

L'objet portait donc le prix d'**hier** dans un champ, et celui d'**aujourd'hui**
dans son article scellé — deux vérités, dont c'est la mauvaise que le
tarificateur lit. Un e2e a rougi dans l'heure, en nommant l'écart : 200 000
attendu, 999 000 reçu.

**Le défaut n'existait pas avant** — il n'y avait qu'une vérité. Mais la forme
qui le crée est exactement celle que la marque rend **visible**, et c'est ce
qu'on lui demande.

Le correctif nomme le geste : `atCanonicalPrice` vit dans `catalog/`, parce que
**changer le tarif d'un article est un geste du catalogue** et non une retouche
d'objet chez le lecteur qui l'affiche. Il **refrappe** le sceau — un article dont
le prix change ne peut pas garder l'ancien.

### 4. Une règle que j'ai dû retirer en la bâtissant

La porte interdisait aussi la frappe **dans les suites**, au motif qu'un cast
dans un test coûte plus cher qu'ailleurs (`CLAUDE.md` §6).

L'argument ne tient pas ici, et l'essayer l'a montré : le cast du §6 est
dangereux parce qu'il laisse un **doublé dériver** du port qu'il prétend jouer.
La frappe, elle, **est** la fonction du port — il n'y a rien dont dériver.
Interdire aux specs de déclarer leur catalogue les forçait à traverser un double
asynchrone pour éprouver une fonction pure : un test moins lisible, pour une
production pas plus sûre.

L'exception est écrite dans la porte, avec sa raison.

### 5. Ce que la construction a appris au passage

**Les specs ne passent pas dans `tsc --noEmit`** — `nest` ne les compile pas, et
c'est `tsconfig.test.json` qui les couvre. Quatre fixtures ont donc échoué au
**runtime** là où un typecheck aurait suffi. D'où `UnsealedCatalogItem`, nommé
pour ce qu'il est : un article **avant sa frappe**, ce qu'une suite déclare.

### 6. Une porte fermée par la batterie elle-même

`board-item.ts::itemView` — non touché par ce lot — acceptait encore un
**littéral de même forme** là où `pricerFor` exige le sceau. Ses deux appelants
passaient déjà l'article du catalogue, donc rien n'était fabriqué ; mais la
signature, elle, aurait laissé passer n'importe quel `canonicalMillicents`.

Relevé par `cerberus` comme « la porte structurelle la plus proche encore
ouverte », et fermée le même jour. C'est ce qu'on attend d'une batterie : pas
seulement dire si c'est vert, mais voir où le vert s'arrête.

### 7. Ce qui le prouve

- **2 532 tests unitaires et 1 053 e2e**, tous verts ;
- `lint:catalogue-authority` — 7 frappes dans `catalog/`, **zéro** ailleurs en
  production ;
- le compilateur a nommé lui-même les six sites à convertir, ce qui est la
  meilleure démonstration que la marque tient : on n'a pas eu à les chercher.

---

## R26 · 2026-09-09 — lot 3

**Plan** : [`architecture-la-porte-du-prix.md`](architecture-la-porte-du-prix.md) §4.2 et §5 ·
Le troisième des quatre lots : **la porte**.

### 1. Ce que la CI a tranché à ma place

Le lot commençait par migrer un appelant. `lint:import-cycles` a refusé :

```
catalog/catalog.module.ts → pricing/pricer.module.ts → catalog/catalog.module.ts
```

La vitrine vit dans `catalog/`. Pour passer par la porte, `catalog` doit importer
`Pricer` — mais `Pricer` portait encore `for(sku)` / `forAll(skus)`, donc
injectait le port catalogue, donc `PricerModule` importait `CatalogModule`.

**C'est exactement la racine que le plan avait nommée** au §3.3 : « `Pricer`
prend des SKU, donc il doit résoudre un catalogue, donc il doit connaître un
contexte catalogue. Tout part de là. » Je l'avais écrit, et j'ai quand même
commencé par migrer un appelant sans retirer la cause. Une porte CI a rappelé un
paragraphe que j'avais rédigé la veille.

⚠️ À ne pas confondre avec le cycle **imaginaire** du §3.1, que la v1 du plan
invoquait pour périmer C.4 et qui n'existait pas. Celui-ci est réel, il a un
chemin, et il a été refusé par une commande.

### 2. `for` et `forAll` sont supprimées

Elles n'avaient **aucun appelant de production**, elles étaient la seule raison
de la dépendance au catalogue, et leur JSDoc **autorisait** le contournement que
ce lot existe pour fermer : « un appelant qui charge déjà en lot s'adresse au
`LoadedPricer` directement ».

Résoudre un SKU redevient le travail de qui a un SKU — le port est là pour ça et
refuse ce qu'il ne connaît pas.

### 3. La porte, et le lot qui connaît ses articles

```ts
const lot = await this.pricer.load({ articles, companyId, at });
lot.price(sku, 12);
```

`PricedLot` **connaît ses articles**. Avant, l'article voyageait **deux fois** —
une fois pour charger les matériaux, une fois pour tarifer — et rien n'exigeait
que ce soit le même : un appelant pouvait charger sur un article et tarifer sur
un autre sans qu'une ligne rougisse. Un SKU non chargé est désormais refusé, et
le refus dit combien d'articles le lot porte.

Trois appelants sur quatre sont passés : **la projection**, **la vitrine**, **la
caisse**. Le tableau attend le lot 4 — il écarte délibérément engagements et
historique, ce que seule la lentille sait nommer.

### 4. `lint:price-door` — ce qui rend le contournement inexprimable

Aucun code servi hors de `b2b/pricing/` n'atteint `PricingMaterialsLoader` ni
`LoadedPricer`. La porte lit les **imports** seulement, jamais la prose : un
JSDoc qui nomme `LoadedPricer` pour dire où il vit est utile, et le compter
ferait de cette porte un bruit qu'on apprend à ignorer.

Les suites en sont exemptées, et pour une raison précise : une spec qui monte
`new Pricer(new PricingMaterialsLoader(…), clock)` **construit** la production,
elle ne la contourne pas. C'est le même arbitrage que `catalogue-authority`.

### 5. Ce que le lot a corrigé au passage

Le JSDoc de la vitrine expliquait encore **pourquoi elle contournait la
façade** — un raisonnement juste la veille, faux depuis que la porte prend des
articles. Une justification qui survit à ce qui l'a périmée est ce que ce dossier
traque depuis le premier jour.

### 6. Ce qui le prouve

- **13 cas unitaires + 11 e2e retargetés** vers `load` ; deux supprimés, ceux qui
  n'éprouvaient que la résolution de SKU par la porte — le refus vit maintenant
  dans le port, et un commentaire d'une ligne le dit à l'endroit qu'ils
  occupaient ;
- « ne lit rien pour une demande vide » devient « **refuse un lot vide** » : la
  porte refuse plutôt que de rendre un tarificateur auquel on ne peut rien
  demander ;
- `lint:price-door` et `lint:import-cycles` vertes, la suite complète aussi.

---

## R26 · 2026-09-09 — lot 4

**Plan** : [`architecture-la-porte-du-prix.md`](architecture-la-porte-du-prix.md) §4.4 · Le
dernier des quatre lots : **la lentille**.

### 1. Une décision qui vivait à trois endroits

« Quelles preuves sont recevables » se décidait dans **trois** encodages :

- un booléen `measured` dans `LoadedPricer.resolve` ;
- la constante `NO_EVIDENCE`, qu'un appelant passait ou non ;
- un `commitments: []` monté à la main par l'écran de tarification.

Trois façons de dire une chose, donc trois occasions de ne pas dire la même.
**C'est par cet éparpillement que R15 s'est glissé** ce matin : la projection
ouvrait la porte d'un plancher de marge sur une quantité qu'elle avait inventée,
et aucun des trois endroits ne pouvait le voir seul.

`PriceLens` la nomme, une fois, dans un type que le chargeur lit.

### 2. Deux valeurs, et pas trois — vérifié plutôt que raconté

Le plan en annonçait trois : `measured`, `vitrine`, `unproven`. Relevé appelant
par appelant, **au chargement** :

| Appelant      | Engagements | Historique |
| ------------- | ----------- | ---------- |
| la caisse     | ✓           | ✓          |
| la vitrine    | ✓           | ✓          |
| le tableau    | ✗           | ✗          |
| la projection | ✗           | ✗          |

La caisse et la vitrine sont **identiques** ; le tableau et la projection aussi.
Ce qui sépare ces deux derniers n'est pas une lentille mais la **question
posée** — `price(sku, qty)` contre `projectAt(sku, cumul)` —, et R15 l'a déjà
tranché : une projection ne prouve ni commande ni historique, par construction.

⚠️ « `vitrine` » nommait une différence qui n'existe pas à cet endroit. C'est le
même travers que la v1 du plan, qui comptait **quatre axes** là où il y en a
deux : décrire les appelants par leur **scène** plutôt que par ce qu'ils
**admettent**. Deux fois le même document, deux fois la même faute — et deux
fois elle se voit en ouvrant les quatre appelants.

### 3. Ce que ça fait gagner, en une requête

`admitsEvidence(lens) ? this.commitments.liveFor(companyId) : []`

La projection **payait une lecture d'engagements qu'elle ignorait ensuite**.
`priceAtCumulative` n'en consulte aucun — mais le chargeur en demandait quand
même, parce que la décision vivait dans la méthode qui pose la question, donc
**trop tard pour éviter la requête**.

Un cas le tient : `commitments.asked` est vide sous `unproven`. Et la mercuriale
reste lue, ce que le même cas affirme — un tarif négocié n'est pas une preuve à
prouver, c'est une décision déjà prise pour ce client.

⚠️ **Le gain est LU dans le code, pas mesuré.** `pricing-budget.e2e-spec.ts`
compte les opérations ORM du devis et du tableau — **pas celles de la
projection**. Le doublé de `pricer.spec.ts` prouve que le port n'est pas
interrogé ; il ne prouve pas qu'une requête de moins part vers Postgres sur le
chemin réel. Dire « une lecture de moins » comme un chiffre vérifié serait faire
passer une lecture de code pour une mesure — relevé par la batterie, corrigé
ici.

### 4. Pourquoi les noms ne sont pas des scènes

`checkout` / `screen` / `projection` — les noms de C.4 — désignent des écrans.
Au cinquième appelant, on en invente un de plus, et le choix se fait par
ressemblance.

`measured` / `unproven` désignent des **preuves recevables**. Un nouvel appelant
se range en répondant à une question qu'il peut trancher seul : _qu'est-ce que je
suis en mesure de prouver ?_ C'est la bascule de R15 — l'ignorance devient
dicible, donc le défaut prudent s'hérite au lieu de se redécider.

### 5. 🔴 Ce que ce lot NE ferme pas, et pourquoi

**Le tableau ne migre pas**, et ce n'est pas un oubli : il lit ses matériaux **à
une date** (`unarchivedAt(at)`), là où le chargeur lit `archivedAt: null` en
absolu. Le faire passer par la porte demanderait que le chargeur sache lire une
date — c'est **R17**, un sujet à part et non tranché.

Donc **R21 reste ouverte** : la seconde séquence de chargement existe toujours,
et `LoadedPricer.over` garde deux appelants. Le dire ici plutôt que de laisser
croire que la porte est complète — une façade qu'on annonce fermée alors qu'un
appelant passe encore à côté est pire qu'une façade assumée partielle.

### 6. Ce qui le prouve

- le cas « ne lit AUCUN engagement pour une question qui ne prouve rien » ;
- les 14 cas de `pricer.spec.ts`, les 316 du contexte, la suite complète ;
- les 32 portes.

---

## R28 · 2026-09-09 — un oracle venu du dehors

**Origine** : aucun registre. Hugo a fourni un **devis établi par le logiciel
comptable de la maison**, indépendamment de ce dépôt, avec une question simple :
_est-ce qu'on tombe sur les mêmes montants ?_

### 1. Pourquoi ce document valait plus que nos 2 500 tests

Tous nos tests vérifient que le moteur fait ce que **son auteur** croit qu'il
doit faire. Ils ne peuvent donc pas attraper une erreur que le code et son
auteur partagent. Un document fabriqué dehors le peut — et il l'a fait dès la
première lecture.

### 2. 🔴 Ce qu'il a trouvé, que rien chez nous ne pouvait voir

`MAX_LINE_QUANTITY = 10 000` refusait **quatre des quarante-quatre lignes** du
devis — 43,6 % du montant, la plus grosse à **101 380 pièces**. Un engagement de
saison pour un village de vacances, c'est-à-dire un document parfaitement
ordinaire, ne passait pas notre API.

Le JSDoc de la borne justifiait pourtant sa valeur ainsi : « le plus gros client
de la maison prend quelques centaines de pièces par ligne : elle ne refusera
jamais une commande réelle ». **Faux, et invérifiable de l'intérieur** : c'est la
classe d'affirmation que rien dans le dépôt ne peut contredire, parce que les
tests qui l'entourent sont écrits par quelqu'un qui connaît la borne.

**Décision (Hugo)** : le devis n'est pas un panier — borne à part, aucune borne
commerciale. `quoteQuantitySchema` est né de là. Le panier garde la sienne : il
écrit, il encaisse, il part au fournil.

⚠️ Une seule borne subsiste côté devis, et **ce n'est pas une quantité** :
`.safe()`. `z.number().int()` accepte `1e308` — un entier au sens de
`Number.isInteger`, un flottant au sens de l'addition. Sans elle, un total faux
sortirait **sans qu'aucune erreur ne soit levée**.

### 3. Ce que la contradiction a renversé, dans un test cette fois

Le cas `order-quantity.spec.ts` affirmait « la borne vaut pour les quatre
portes », en se justifiant ainsi : « une borne qui n'existerait qu'au devis
laisserait entrer par la caisse ce qu'on avait interdit d'estimer ».

Le raisonnement est juste et vise **l'asymétrie inverse**. Ici le devis est le
plus large, la caisse la plus étroite : on ne peut rien commander qu'on n'ait pu
estimer. La phrase a été gardée et datée plutôt que supprimée — sinon le
prochain lecteur refait le raisonnement et « corrige » l'asymétrie.

### 4. Les montants, et l'accord qui n'est pas ce qu'il paraît

|           |     Document |             Nous |
| --------- | -----------: | ---------------: |
| HT        | 292 561,22 € | **292 561,22 €** |
| TVA 5,5 % |  16 090,87 € |  **16 090,87 €** |
| TTC       | 308 652,09 € | **308 652,09 €** |

🔴 **L'accord passe par deux différences qui s'annulent :**

1. le logiciel additionne les produits **exacts** et n'arrondit qu'une fois ;
   nous arrondissons **chaque ligne** puis nous sommons. La somme des montants
   _affichés_ sur le document fait 292 561,**21** — il ne s'additionne pas
   lui-même ;
2. une ligne tombe sur un demi exact (75 × 1,575 € = 118,125 €) : le document
   rend 118,12, nous rendons 118,13.

Ce centime rattrape exactement l'écart du point 1. **Sur un autre panier, ils ne
s'annuleraient pas** — d'où des assertions ligne à ligne, jamais sur le seul
total.

**Ne pas retourner notre arrondi sur cette base.** Le nôtre s'éloigne de zéro,
et `roundToCents` écarte explicitement l'arrondi au pair comme « indéfendable
devant un client qui recompte ». Le 118,12 du logiciel est soit cet arrondi au
pair, soit un artefact de flottant — 1,575 n'est pas représentable en binaire.
Un seul point de mesure ne départage pas deux hypothèses.

### 5. Deux validations gratuites

- **La TVA se calcule par taux sur l'assiette agrégée**, comme chez nous. Ligne
  à ligne, le document aurait porté 16 090,89 € — deux centimes de trop.
- **Les PU du logiciel ont cinq décimales** (8,72038 € · 28,43602 €). C'est
  exactement le millicentime : la conversion ne perd rien.

### 6. Ce que ça ne prouve pas

Le cas facile. Un seul taux, remise nulle partout, aucune promotion, aucun
palier, aucun plancher. La colonne vertébrale du calcul est éprouvée ; les
décisions du moteur ne le sont pas.

### 7. Ce qui le prouve

`apps/lfd-api/test/devis-comptable.e2e-spec.ts` — **7 cas**, par les vraies routes contre un
vrai Postgres : la mercuriale de 44 lignes posée par
`POST /admin/pricing/companies/:id/mercuriale`, le chiffrage par
`POST /orders/quote`. Les deux derniers cas tiennent la décision **dans les deux
sens** : le devis chiffre 101 380 pièces, la commande les refuse toujours.

L'oracle, anonymisé, vit dans `apps/lfd-api/test/devis-comptable-fixture.ts` : client,
contact, SIRET, référence de l'affaire, coordonnées bancaires et libellés
d'articles retirés. Restent les quantités et les prix — les réduire aurait
détruit la preuve, l'arrondi par ligne ne se voyant qu'à ces volumes.

---

## R27 · 2026-09-09 — le mur du prix, côté commande passée

**Origine** : trouvé en bâtissant R25. `POST /orders/quote` avait été rétrécie le
matin même ; `GET /orders/mine`, `GET /orders/:id` et `GET /companies/:id/orders`
servaient toujours `OrderView` en entier, trace de prix comprise.

### 1. Ce que l'entrée du registre disait, et qui était faux

Deux affirmations sur l'existant, écrites de mémoire. Les deux sont tombées en
ouvrant les fichiers — c'est la même racine que
[le plan des allergènes](../todos/todo-allergenes-objections-vitruve.md), et ça
reste l'artefact le plus faible du dossier.

| L'entrée disait                                                             | En fait                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « donc `pricing.steps` avec le libellé commercial de chaque règle »         | Le **libellé est écrit POUR le client** — {@link PriceStepView} le dit, et l'écran de commande l'affiche des deux côtés depuis toujours. Ce qui fuyait vraiment était à côté : `floorDecision`, c'est-à-dire **le plancher et les preuves qui l'ont ouvert**. L'entrée nommait le champ le plus visible, pas le pire. |
| « **Aucun front ne lit `line.pricing`** : le rétrécissement ne casse rien » | `packages/b2b-ui/src/order/order-pricing.ts` le lit — trois fois — et `lfd-order-detail` est monté par les **deux** fronts. Le `grep` qui a produit cette phrase a cherché dans `apps/`, pas dans `packages/`.                                                                                                        |

La seconde a changé la conception : il ne s'agissait plus de retirer `pricing`,
mais de le **trier champ par champ**.

### 2. Le tri, et les deux décisions qui ne vont pas de soi

**Part au client** : le tarif d'entrée (il est au rayon), le **libellé** de
chaque étage, et `floored`.
**Reste au comptoir** : `floorDecision`, `ruleId`, `stage`, `scope`,
`resultMillicents`, `supersedes`, `clampedToZero`, `commitment`.

🔴 **`floored` reste, alors que le devis l'a perdu.** L'asymétrie est le cœur du
lot. Sur un devis, le client choisit la quantité : faire varier la ligne jusqu'à
ce que le drapeau bascule **encadre le plancher** en quelques appels. Sur une
commande passée, il n'y a rien à faire varier — c'est un fait clos. Le même bit
est une sonde d'un côté et une pastille de l'autre.

🟡 **`commitment` part, bien qu'il ne porte que les chiffres du client.** Il
passerait la règle de tri ; aucun écran ne le lit, et l'engagement de volume n'a
pas d'écran du tout (R6). Élargir un contrat coûte un déploiement, le rétrécir en
coûte trois.

### 3. Pourquoi la vue est écrite à la main plutôt que dérivée

`Omit<OrderView, "lines">` aurait été plus court et **plus faible**. Un champ
ajouté demain à la vue staff entrerait dans la vue client, `toCustomerOrder` ne
compilerait plus, et le geste le plus court serait de le recopier — la porte
rougirait pour faire passer la fuite. Écrite à la main, elle ignore ce champ : il
n'atteint pas le client, et personne n'a eu à y penser. C'est la hiérarchie
habituelle du dépôt : **inexprimable** avant **porte CI**.

Le mapper, lui, est explicite pour la raison déjà écrite sur `toCustomerQuote` :
TypeScript accepte le surplus dès que l'objet n'est pas un littéral, donc un
`...view` laisserait tout passer sans qu'une ligne rougisse.

### 4. Ce qui le tient

- `packages/contracts/src/__tests__/customer-order.spec.ts` — le **jeu de clés
  exact**, jamais une liste d'absences.
- `apps/lfd-api/test/admin-orders.e2e-spec.ts` — les **deux publics sur la même
  commande** : six clés de trace au comptoir, trois au client, et le même prix
  des deux côtés. Rouge avant le correctif (trois clés en trop), vert après.
- `packages/b2b-ui` prend désormais la vue **client** en entrée. `OrderView` lui
  est structurellement assignable, donc le back-office passe la sienne sans rien
  convertir — mais le gabarit partagé ne peut plus _atteindre_ un champ de
  comptoir, donc plus l'afficher par accident.

### 5. Ce que ça débloque, et ce que ça ne touche pas

`supersedes` — le nom des promotions évincées — peut maintenant être persisté :
c'est ce que le commentaire de `prisma-order.repository.ts` attendait, et c'est
la moitié manquante de « pourquoi ma promotion ne s'est pas appliquée ». Il
reste à décider de sa forme (R25).

⚠️ **`/admin/orders/*` n'est pas touchée**, et c'est le point : la trace entière
reste servie au comptoir. L'écran d'explication de la trace par reconstruction se
bâtira dessus — le rétrécissement le protège au lieu de le gêner.

---

## R25 · 2026-09-09 — lots 1 et 2 : ce que le moteur a écarté

**Plan** : [`plan-la-trace-qui-explique.md`](plan-la-trace-qui-explique.md), §11
(la forme v3, après deux contradictions). **Arbitrage de Hugo** : une colonne
additive, plutôt qu'une trace qui assume de ne pas répondre.

### 1. Ce qui est livré

Le moteur consigne désormais **ce qu'il a regardé sans l'appliquer**, avec sa
raison : `superseded`, `sealed`, `below_threshold`, plus les quatre causes
d'`applies` qu'il ne voit qu'en test. Chaque entrée porte son **libellé** — une
règle se renomme, donc l'identifiant seul serait muet six mois plus tard.

Trois choses ont demandé plus qu'un champ :

- **`assembled()` rend ses recalés.** Un barème ou une mercuriale dont aucun
  palier n'est atteint ne devient jamais une règle : il n'atteignait donc pas la
  boucle, et « pourquoi n'ai-je pas eu mon prix de volume ? » — la question de
  seuil la plus posée — n'avait aucune réponse.
- **La cause se décide prédicat par prédicat** (`rejectionCauseOf`). Écrire
  `!applies(...) ⇒ seuil` aurait fait dire « palier non atteint » d'une
  promotion **expirée**. En production ces causes-là n'atteignent pas le moteur,
  mais `resolvePrice` est pure et doit rester juste sur un tableau fabriqué à la
  main — ce que fait chacun de ses tests.
- **`sealedRuleIds` est devenu une dérivation.** Deux listes tenues en parallèle
  finissent par diverger d'un cas.

### 2. 🔴 Les deux pièges que la contradiction a évités, et qui étaient réels

**Une cause fausse en masse.** `mercuriale.asRuleFor` rend `null` **d'abord
parce que la grille ne porte pas l'article**, et seulement ensuite parce que le
palier n'est pas atteint — et la mercuriale est passée au moteur **entière, non
filtrée par portée**. Confondre les deux aurait écrit « palier non atteint » sur
chaque ligne de chaque commande de chaque client sous mercuriale, pour tout
article hors grille. `missesTierFor` sépare les deux, et un cas le tient.

**Une règle regardée passant pour une règle qui a facturé.** `hasPriced`
interroge `pricing_steps` en containment jsonb pour refuser de reposer une
décision qui a produit une facture. **Joué contre Postgres le 2026-09-09** :

```
[{"ruleId":"promo","cause":"below_threshold"}] @> [{"ruleId":"promo"}]   →  true
[{"ruleId":"merc","supersedes":[{"ruleId":"promo"}]}] @> [{"ruleId":"promo"}] → false
```

La première ligne est la raison d'être de la colonne **séparée** : loger les
écartées dans `pricing_steps` aurait fait refuser au staff la repose d'une
promotion n'ayant jamais produit un centime. Un e2e le tient de bout en bout —
il pose, fait évincer par un scellement, range, et **repose sur la même
période**.

La seconde ligne dit qu'écrire `supersedes` ne tromperait pas cette porte. On ne
l'écrit pas quand même : son défaut de relecture est `[]`, donc l'écrire rendrait
à jamais indistinguables « aucune rivale » et « on ne consignait pas ». Le fait
tient dans `pricing_rejected`, qui est nullable.

### 3. Les trois états, tenus de bout en bout

`NULL` = on ne consignait pas · `[]` = **affirmation** que rien n'a été écarté ·
une valeur = qui et pourquoi. Tenu à l'écriture (`Prisma.DbNull`, jamais
`rejected ?? []`), à la relecture (`safeParse().data ?? null`), et dans le
domaine (une ligne neuve écrit toujours l'un des deux derniers).

Une entrée illisible ne fait perdre que le commentaire, jamais la commande —
même indulgence que le plancher et l'engagement, et il fallait le décider plutôt
que l'hériter.

### 4. Ce que ça n'a pas emporté

Le **lot 3** (l'écran) et le **lot 4** (les causes non figées) restent. Et la
réserve du lot 4 est écrite au plan : la fenêtre, l'audience et la portée d'une
règle sont **immuables** — les commandes qui existent sont créer, suspendre,
reprendre, archiver, renommer —, donc la règle d'aujourd'hui dit la vérité. La
seule donnée détruite est la période de pause, que `resume()` efface et que le
journal garde.

⚠️ **Un écran qui affiche `NULL` comme « aucune règle écartée » détruirait tout
ce lot.** C'est la seule façon de perdre la distinction qu'il construit.
