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

| Entrée                  | Constat                                                            | Statut                                                                           |
| ----------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [R15](#r15--2026-09-09) | la projection ouvre le plancher dynamique sur une quantité fictive | 🟠 **à moitié** — le prix faux est parti, la fidélité du banc reste (2026-09-09) |

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
