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

| Entrée                  | Constat                                                            | Statut                                                                                   |
| ----------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [R15](#r15--2026-09-09) | la projection ouvre le plancher dynamique sur une quantité fictive | 🟠 **à moitié** — le prix faux est parti, la fidélité du banc reste (2026-09-09)         |
| [R16](#r16--2026-09-09) | un engagement de portée famille est mesuré par SKU                 | 🔵 **analyse renversée par la contradiction** — la question est commerciale (2026-09-09) |
| [R20](#r20--2026-09-09) | la documentation de référence contredit le code                    | ✅ **close** — 2026-09-09                                                                |
| [R22](#r22--2026-09-09) | la vitrine publique ne passe pas par le fabricant de prix          | ✅ **close** — 2026-09-09                                                                |

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
`SHELF_BY_PIM_CATEGORY` dans `orders/infrastructure/catalog-backed-product-catalog.ts`
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
