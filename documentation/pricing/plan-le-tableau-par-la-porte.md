# R21 — faire passer le tableau par la porte du prix

> **Plan, 2026-09-09.** Rien n'est bâti. Il touche l'argent : `vitruve` avant
> Hugo, et ses objections `BLOQUANT` / `SÉRIEUX` remontent avec lui.

## 1. Ce qui est vrai aujourd'hui, vérifié dans le code

Il existe **deux séquences de chargement**, et cinq endroits du dépôt écrivent
qu'il n'y en a qu'une (`pricing.module.ts:31`, `pricing-materials.loader.ts:44`,
`pricer.ts:73`, `comment-un-prix-se-fabrique.md`, `architecture-pricer.md`).

|            | La porte                                         | Le tableau                                                 |
| ---------- | ------------------------------------------------ | ---------------------------------------------------------- |
| entrée     | `Pricer.load({ articles, companyId, lens, at })` | `prisma.priceRule.findMany` + `prisma.priceFloor.findMany` |
| portée lue | `inScopes(scopes)` / `inScopesAt(scopes, at)`    | `listAll(at)` — **tout**, sans portée                      |
| preuves    | `lens` → `admitsEvidence`                        | `commitments: []` + `NO_EVIDENCE`, montés à la main        |
| époque     | `epochOf(at, now)`                               | `unarchivedAt(at)`, toujours                               |
| rend       | `PricedLot`                                      | `BoardMaterials` (dont un `LoadedPricer`) **+ des vues**   |

Deux consommateurs de la seconde : `PrismaPricingBoardReader` (l'écran général,
`infrastructure/`) et `CompanyPricingQuery` (l'onglet Tarifs d'une fiche client,
`application/queries/`). Le second **injecte `PrismaService`**, ce que
`CLAUDE.md` §4 interdit explicitement à un handler.

🔴 **Le blocage nommé par le lot 4 de R26 est levé.** Le journal écrivait : « le
tableau ne migre pas parce qu'il lit à une date, là où le chargeur lit
`archivedAt: null` en absolu — c'est R17, non tranché ». R17 est close depuis :
le chargeur lit une date par `PriceEpoch`, et `replay` contourne le cache.

## 2. L'obstacle réel, et il n'est pas celui qu'on croit

Ce n'est pas la date. C'est que **le tableau a besoin de deux choses des mêmes
lignes** :

- ce qui **calcule** — `PriceRule`, `ScopedPriceFloor` (le domaine) ;
- ce qui **s'affiche** — `PriceRuleView`, `PriceFloorView`.

Or les vues se fabriquent depuis la **LIGNE** (`ruleViewFromRow`), pas depuis
l'objet de domaine : `PriceRule` ne porte ni `createdBy`, ni `createdAt`, ni
`archiveReason`, et fond `pausedAt` et `archivedAt` en un seul `suspendedFrom`
— délibérément, « le calcul n'a aucune raison de les distinguer ». La porte, qui
ne rend que du domaine, ne peut donc pas rendre les vues.

⚠️ **C'est ce qui rend la solution évidente fausse.** « Le tableau prend son
pricer à la porte et garde sa lecture de vues » ferait **deux lectures des mêmes
tables**, avec deux clauses `where` distinctes — une portée d'un côté, tout de
l'autre. C'est exactement la forme de R17 : deux vérités sur les mêmes lignes,
qui restent d'accord jusqu'au jour où l'une bouge.

## 3. La branche proposée : une seule lecture, deux produits

La porte gagne **une seconde entrée**, et une seule :

```ts
// Pricer
async board(request: BoardRequest): Promise<PricedBoard>;

interface PricedBoard {
  readonly lot: PricedLot;
  readonly rules: readonly LoadedRule[];   // domaine + vue, appariés
  readonly floors: readonly LoadedFloor[];
}
```

Elle charge **une fois**, par le même chargeur, sous la lentille `unproven` —
qui est mot pour mot ce que `boardMaterials` monte à la main aujourd'hui
(`commitments: []`, `NO_EVIDENCE`). L'appariement domaine ↔ vue se fait **dans
l'adaptateur**, à l'endroit où la ligne existe encore.

Conséquences :

- `boardMaterials` cesse de construire un `LoadedPricer` : il le reçoit ;
- `CompanyPricingQuery` n'injecte plus `PrismaService` ; il dépend de la porte
  et du port de société pour son 404 ;
- `LoadedPricer.over` retrouve **un seul** appelant, le chargeur.

## 4. Les trois points où je peux me tromper

### 4.1 La portée lue n'est pas la même

La porte lit `inScopes(scopes)`, dérivée des articles du lot ; le tableau lit
`listAll(at)`. Avec le catalogue entier pour lot, les portées couvrent tout ce
qui peut s'appliquer — mais **pas** une règle qui vise un SKU absent du
catalogue, que l'écran veut pouvoir montrer comme ne visant plus rien.

Réponse envisagée : les ports gagnent `listAllWithViews(at)`, et la porte
`board()` l'emprunte au lieu de `inScopes`. Le lot reste scopé pour le calcul.
⚠️ Ça rouvre le risque de deux lectures — à trancher.

### 4.2 Le filtre d'audience de la fiche client est structurel

`CompanyPricingQuery` filtre l'audience **dans le SQL**, et son JSDoc dit
pourquoi : « une règle d'un tiers ne peut alors ni gagner un étage, ni évincer,
ni apparaître dans une trace — la garantie est structurelle plutôt que
surveillée à l'affichage ».

La porte ne filtre pas à la lecture : elle s'en remet à `applies()` pendant la
résolution. Le résultat calculé est le même ; la **garantie** ne l'est pas.
Passer par la porte échangerait donc une garantie structurelle contre une
garantie surveillée — et c'est précisément le mouvement que `CLAUDE.md`
interdit dans sa hiérarchie de garde-fous.

### 4.3 `PrismaPricingBoardReader` est un adaptateur

Il vit dans `infrastructure/` et implémente un port d'application. Lui faire
appeler `Pricer` mettrait un adaptateur au-dessus d'un service applicatif.

## 5. Ce que ce plan ne fait pas

Il ne touche ni la caisse, ni la vitrine, ni la projection : leur chemin est
déjà la porte. Il ne change **aucun prix** — la lentille `unproven` reproduit à
l'identique ce que `boardMaterials` monte, et c'est le critère de recette :
l'écran doit afficher les mêmes nombres avant et après.
