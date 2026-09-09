# La trace qui explique — reprise de R25

**Ouvert le 2026-09-09.** Reprend la moitié de [R25](journal-de-remediation.md)
que la contradiction a refusé de laisser bâtir : la **forme** du scellement.

> 🔴 **Les §1 à §8 décrivent une forme MORTE.** `vitruve` l'a démolie en six
> points (§9), dont quatre fatals. La forme à bâtir est au **§10** ; ce qui
> précède est gardé parce que l'idée qu'il porte est la plus naturelle du sujet,
> et que quelqu'un la reproposera. Le §1 (les faits ouverts) reste valable, à sa
> ligne d'attribution corrigée près.

> **Ce que ce plan remplace.** Le §4 du journal retenait « une colonne
> `pricing_seal Json?` ». `vitruve` l'a démolie sur trois points, tous vérifiés :
> elle portait des identifiants **nus** (donc muets dès qu'une règle est
> supprimée), elle ne nommait que le **gagnant** de l'étage scellé, et elle ne
> fermait qu'une cause et demie sur cinq. Ce plan ne corrige pas cette colonne :
> **il montre qu'elle n'a pas lieu d'être.**

---

## 1. Ce que j'ai ouvert

Tout ce qui suit est un fichier lu le 2026-09-09, pas un souvenir.

| Fait                                                                                                                               | Où                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| La trace d'une ligne est **une colonne JSON déjà nullable**, qui stocke un **tableau** d'étages                                    | `prisma/schema.prisma:954` (`pricingSteps Json?`)                                      |
| Le schéma de relecture accueille les champs neufs avec un **défaut**, pour qu'une trace ancienne reste lisible                     | `packages/contracts/src/pricing.ts:559` (`priceStepsSchema`)                           |
| L'éviction est déjà consignée sur l'étage gagnant, en `{ruleId, label}`                                                            | `resolve-price.ts:111`                                                                 |
| Le scellement, lui, ne garde que **l'identifiant nu du gagnant** de l'étage écarté                                                 | `resolve-price.ts:97` (`sealedRuleIds.push(winner.id)`)                                |
| Un écran staff **dessine déjà** le chemin du prix, éviction comprise (« supplantée », barré sur la barre gagnante)                 | `pricing-format.ts:400`, `price-path.html:91`                                          |
| …mais sur une résolution **vivante**, jamais sur une commande passée                                                               | il prend un `PricingItemView`, pas une `OrderLineView`                                 |
| 🔴 Une règle expirée, suspendue ou hors audience **n'atteint jamais le moteur** : l'adaptateur la filtre au chargement             | `prisma-price-rule.reader.ts:49` (`inForceFor(all, scopes)`)                           |
| ⚠️ La **portée**, elle, n'est PAS filtrée là — ce fichier dit l'inverse en toutes lettres, et ce plan le lui a attribué trois fois | `prisma-price-rule.reader.ts:43-47`, puis `pricing-materials.ts:85` / `scope-index.ts` |
| Le seuil de quantité, lui, est jugé **dans** le moteur, donc la règle recalée y est encore                                         | `specificity.ts` (`applies`), appelée par `resolve-price.ts:88`                        |

---

## 2. Le résultat principal : aucune migration

`pricing_steps` est **déjà** une colonne JSON nullable qui porte un tableau. Un
étage écarté est un élément de plus dans ce tableau. Il n'y a donc ni colonne à
poser, ni `DEFAULT`, ni reprise de données — et le geste irréversible que R25
préparait sur `order_lines` **disparaît**.

C'est la septième forme que `vitruve` reprochait au §4 de n'avoir pas pesée. Elle
tient, mais pas sous la forme qu'il proposait — voir le §3.

⚠️ **Conséquence sur le registre** : R25 cesse d'être une entrée « migration de
données ». Elle reste un plan qui touche à l'argent, donc contredit avant Hugo.

---

## 3. La forme retenue — une entrée par règle CONSIDÉRÉE, une issue par entrée

### 3.1 Ce qu'on écrit

Le tableau persisté cesse d'être « les étages qui ont agi » pour devenir « les
règles que le moteur a **regardées**, et ce qu'il en a fait ». Chaque entrée
gagne une `outcome` :

| `outcome`         | Ce que ça dit                                            | Aujourd'hui                                                      |
| ----------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| `applied`         | la règle a produit ce prix                               | c'est le seul cas écrit                                          |
| `sealed`          | la mercuriale a rendu son étage transparent              | `sealedRuleIds`, en identifiants nus, **jamais persistés**       |
| `superseded`      | une règle plus spécifique a gagné son étage              | `supersedes`, sur l'étage gagnant — **jamais persisté** non plus |
| `below_threshold` | son seuil de quantité n'était pas atteint à cette mesure | **rien** : la règle disparaît sans trace                         |

Une entrée non appliquée ne porte **pas** `resultMillicents` : elle n'a produit
aucun prix, et lui en donner un ferait lire à tout parcours de la trace un prix
qui n'a pas eu lieu — c'est l'objection qui avait fait écarter la forme F.

### 3.2 Pourquoi la relecture des traces déjà écrites ne casse pas

`outcome` est **défailli à `applied`**. Et ce défaut-là est le seul honnête du
dossier : dans les traces déjà en base, **seules** les règles appliquées ont été
écrites. Le défaut n'invente rien, il énonce ce qui est vrai de ces lignes.

> ⚠️ C'est exactement la construction qui a mal tourné deux fois aujourd'hui
> (R25 §2, R16) : un défaut de relecture qui couvre un fil non branché. La
> différence tient en une phrase, et elle est vérifiable : ici le défaut décrit
> le **passé**, et le présent écrit toujours la valeur. Le §7 le fait rougir si
> ça cesse d'être vrai.

### 3.3 Pourquoi le CONTRAT, lui, ne change pas de sens

`steps` veut dire « ce qui a agi » dans six lecteurs, dont un gabarit Angular qui
en tire des libellés destinés au client. Élargir ce mot ferait afficher, sur
l'écran d'une commande, le nom d'une promotion que le client **n'a pas eue**.

La vue expose donc **deux tableaux**, et le mapper les sépare :

- `steps` — inchangé : les étages appliqués, avec leur `scope`, leur
  `resultMillicents` et leurs `supersedes` ;
- `rejected` — neuf : les entrées non appliquées, `{stage, ruleId, label, cause}`.

Aucun lecteur existant ne bouge. `price-path` continue de barrer les supplantées
sur la barre du gagnant, ce qui est le bon endroit pour dessiner un duel.

### 3.4 La règle qui empêche un fait d'avoir deux domiciles

- une règle battue dans un étage **qui a produit un étage** → `supersedes` du
  gagnant, et **rien** dans `rejected` ;
- une règle battue dans un étage **scellé** (il n'y a pas de gagnant à décorer) →
  `rejected`, cause `superseded` ;
- le gagnant d'un étage scellé → `rejected`, cause `sealed` ;
- une règle sous son seuil → `rejected`, cause `below_threshold`.

`sealedByRuleId` ne se persiste pas : c'est l'étage `mercuriale` appliqué, et le
déduire de la trace ne coûte rien. Persister deux fois la même règle est
précisément ce qui fait diverger deux réponses.

### 3.5 🔴 Et le client ?

`toCustomerOrder` (R27, posé ce matin) ne recopie **pas** `rejected` : il porte
le nom des promotions qu'un client n'a pas obtenues. C'est le champ pour lequel
le mur a été construit, et il est écrit champ par champ — donc l'oubli n'est pas
une omission, c'est une décision à prendre.

---

## 4. Les cinq causes — ce qui se fige, ce qui se reconstruit

`vitruve` a raison sur le fond : les causes sont cinq. Mais elles ne sont pas de
même nature, et **trois d'entre elles n'atteignent jamais le moteur** —
l'adaptateur les a écartées au chargement (`prisma-price-rule.reader.ts:49`).

| Cause                       | Vue par le moteur ? | Comment on y répond                                                           |
| --------------------------- | ------------------- | ----------------------------------------------------------------------------- |
| évincée par plus spécifique | oui                 | **figée** — `supersedes` / `rejected`                                         |
| scellée par la mercuriale   | oui                 | **figée** — `rejected`                                                        |
| seuil non atteint           | oui                 | **figée** — `rejected`                                                        |
| expirée / pas en vigueur    | **non**             | **reconstruite** : la règle porte ses bornes, la commande porte son instant   |
| suspendue                   | **non**             | **reconstruite**, même mécanique (`suspendedFrom` est comparé à l'instant)    |
| hors audience / hors portée | **non**             | **reconstruite** : `audience` et `scope` de la règle, contre le contexte figé |

**Décision proposée** : on fige ce que seul l'instant sait, on reconstruit ce que
la règle sait encore. Faire remonter les règles écartées jusqu'au moteur pour les
consigner ferait grossir sans borne la trace de **chaque ligne de chaque
commande** avec des règles qui n'ont rien à voir avec elle — et le cache de
matériaux existe précisément pour ne pas les transporter.

⚠️ **La limite, et elle doit être écrite sur l'écran, pas seulement ici** : une
règle **supprimée** depuis n'est plus reconstructible. Les trois causes figées
survivent à sa suppression (elles portent son libellé) ; les trois autres non.
L'écran dira « cette règle n'existe plus » plutôt que d'affirmer une cause.

---

## 5. Ce que ça débloque — l'écran d'explication

C'est la demande de Hugo (2026-09-09) : cliquer une ligne d'une commande en
back-office et voir **pourquoi ce prix**.

Le composant existe déjà : `price-path` dessine la chaîne, les évictions barrées,
la limite en pointillé et le prix final. Il consomme aujourd'hui un
`PricingItemView` — une résolution **vivante**. Le lot 3 lui donne une seconde
source : la trace **figée** d'une ligne de commande, projetée dans la même forme
de jambes.

🔴 **Et l'écran doit dire laquelle des deux il montre.** Un chemin reconstitué et
un chemin figé se ressemblent, et c'est le seul endroit du dossier où confondre
les deux coûterait cher : sur un litige, on défend ce qui a été facturé, pas ce
que le moteur ferait aujourd'hui.

---

## 6. Les lots

| Lot   | Ce qu'il fait                                                                                                                          | Migration |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **1** | `outcome` dans le domaine et le moteur : `resolvePrice` pousse les entrées écartées au lieu de les compter (`sealedRuleIds` disparaît) | aucune    |
| **2** | Le contrat : `rejected` dans la vue staff, le défaut de relecture, le mapper client qui ne le recopie pas, le schéma persisté          | aucune    |
| **3** | L'écran : `price-path` prend la trace figée d'une ligne, et dit qu'elle est figée                                                      | aucune    |
| **4** | La reconstruction des trois causes absentes, côté staff — une lecture qui confronte la règle d'aujourd'hui à l'instant de la commande  | aucune    |

Les lots 1 et 2 vont ensemble : entre les deux, le moteur écrirait une forme que
le contrat ne relit pas. Les lots 3 et 4 sont indépendants l'un de l'autre.

---

## 7. Ce qui le prouvera

- **Le cas qui manquait** : une promotion scellée par une mercuriale laisse, sur
  la ligne persistée, **qui** a scellé et **qui** a été écarté, avec leurs
  libellés. Il existe déjà, il affirme `supersedes: []`, et son commentaire dit
  que le trou est là.
- **Une règle sous son seuil** apparaît dans `rejected` — aujourd'hui elle
  n'existe nulle part.
- **La relecture d'une trace ancienne** (sans `outcome`) rend des étages
  `applied`, et un `rejected` **vide** — pas absent, vide : on sait qu'on ne sait
  pas, et ces lignes n'ont eu aucune règle écartée consignée.
- **Le mur client** : `toCustomerOrder` ne rend pas `rejected`. Jeu de clés
  exact, comme les deux cas posés ce matin.
- **Le défaut ne couvre pas un fil débranché** : un cas qui résout une chaîne
  scellée et vérifie que la trace persistée porte l'entrée — c'est-à-dire que
  l'écrivain est branché, pas seulement le lecteur.

---

## 8. Ce que ce plan n'a PAS vérifié

- Le volume réel de `rejected` sur une commande grasse. Une ligne a quelques
  règles candidates ; je n'ai pas mesuré sur les données de production, et
  l'accès prod manque (R12).
- Si `price-path` accepte une seconde source **sans** se déformer. Je l'ai lu,
  je ne l'ai pas branché.
- Ce que `lint:dated-decisions` dit d'une entrée `rejected` : elle n'entre pas
  dans la résolution du prix, mais elle en décrit une.

---

## 9. Ce que la contradiction a renversé — 2026-09-09

`vitruve` rend **six BLOQUANT**. J'en ai rouvert quatre moi-même dans le code ;
les six tiennent, et **quatre d'entre eux tuent la forme retenue au §3**. Ce plan
n'est donc pas à corriger, il est à refaire — ce qui est très exactement ce que la
contradiction est là pour apprendre avant qu'une ligne soit écrite.

| #                                            | Ce que le plan disait                                          | Ce qui est vrai                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** `order-line.ts:154-160`                | « une entrée non appliquée ne porte pas `resultMillicents` »   | 🔴 `assertConsistent` lit `steps.at(-1).resultMillicents` pour vérifier que la trace **s'accorde au prix facturé**. Une entrée écartée poussée après le dernier étage appliqué — le cas COURANT du scellement — fait retomber le contrôle sur le canonique et **refuse la ligne**. Un 500 sur le chemin qui encaisse, le défaut R1 rouvert d'une autre main                  |
| **2** `prisma-priced-decisions.reader.ts:59` | « aucun lecteur existant ne bouge »                            | 🔴 `hasPriced` interroge la trace en `array_contains: [{ruleId}]` — une **containment** jsonb, que les clés en plus ne gênent pas. Une règle simplement regardée deviendrait « elle a facturé », et quatre handlers refuseraient de reposer une règle qui n'a jamais produit un centime. Le port existe pour distinguer exactement ces deux-là                               |
| **3** zod 4.4.3                              | « `outcome` est défailli à `applied`, donc le passé se relit » | 🔴 Un `.default()` sur le **discriminant** n'est pas lu avant la discrimination, et `parseTrace` est du tout-ou-rien : la lecture naturelle du §3.2 rendrait muettes **toutes les commandes déjà passées**. Réparable, mais le plan ne nommait aucune forme de schéma — il affirmait la propriété sans le mécanisme                                                          |
| **4** doctrine du dépôt                      | « un `rejected` **vide** : on sait qu'on ne sait pas »         | 🔴 Un tableau vide **affirme**, il n'avoue pas. C'est écrit quatre fois dans le dépôt, et c'est la raison même pour laquelle la forme B avait été écartée. Il faut trois états, le plan en offrait deux — sur le champ neuf. Troisième occurrence du même défaut en une semaine, dans le document qui prétendait s'en immuniser                                              |
| **5** `pricing-rule.ts:207`                  | « suspendue → reconstruite »                                   | 🔴 `resume()` fait `pausedAt: null` — **la reprise efface l'intervalle**. Une promotion suspendue le 12 et reprise le 13, sur une commande du 12 : la reconstruction conclut « elle était en vigueur ». L'écran de litige n'aurait pas une réponse manquante, il aurait une réponse **fausse**                                                                               |
| **6** `volume-ladder.ts:98`                  | « seuil non atteint → vue par le moteur, donc figée »          | 🔴 Vrai d'une règle qui porte `minQuantity`. Faux des **deux matériaux dont le seuil est la raison d'être** : `ladderAsRule` et `mercuriale.asRuleFor` rendent `null` quand aucun palier n'est atteint, donc rien n'entre dans `rules`. « Pourquoi n'ai-je pas eu mon prix de volume ? » est la question la plus posée, et c'est celle que la forme ne pouvait pas consigner |

**Et l'affirmation centrale du §2 tombe avec.** « Aucune migration » était vrai de
Prisma, pas des données : les lignes écrites après le lot 1 ne se relisent plus
par la version précédente, et `parseTrace` rend `null` pour la trace **entière**
dès qu'une entrée résiste. C'est une migration de format **que ni Prisma ni la CI
ne voient** — donc sans `lecteur-de-migrations`, sans revue SQL, et aussi
irréversible que la colonne qu'elle prétendait éviter.

### Ce qui survit, et la question qui reste à Hugo

Trois acquis :

1. **Les entrées écartées ne peuvent pas voyager dans `pricing_steps`.** Deux
   mécanismes vivants lisent ce tableau comme « ce qui a facturé » — l'invariant
   de la ligne et la porte de repose. Leur domicile doit être ailleurs.
2. **La reconstruction depuis la règle d'aujourd'hui ment.** Si ces causes se
   répondent, c'est depuis le **journal**, qui est append-only et où l'intervalle
   de suspension survit à la reprise — ce que le JSDoc de `specificity.ts` dit
   déjà.
3. **Le seuil des barèmes se perd dans `assembled()`**, avant le moteur. Le
   consigner demande que l'assemblage dise ce qu'il a laissé tomber.

Reste une décision qui n'est pas la mienne : **une colonne additive
`pricing_rejected Json?` sur `order_lines`** — nullable, donc les trois états du
point 4, et un domicile propre pour le point 1 — ou **aucune colonne**, et une
trace qui assume de ne pas répondre à trois des causes.

---

## 10. La forme v2 — après contradiction et arbitrage

**Arbitrage de Hugo, 2026-09-09** : une colonne additive, plutôt qu'une trace qui
assume de ne pas répondre.

### 10.1 Deux faits vérifiés contre Postgres, que la v1 avait supposés

Joués sur le conteneur de dev, pas déduits :

| Cas                                                                             | Résultat  | Ce qu'il décide                                                                                                                                        |
| ------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[{"ruleId":"promo","outcome":"below_threshold"}] @> [{"ruleId":"promo"}]`      | **true**  | 🔴 L'objection 2 est réelle : une entrée écartée logée dans `pricing_steps` ferait dire à `hasPriced` qu'une règle **a facturé**. Elle sort du tableau |
| `[{"ruleId":"merc","supersedes":[{"ruleId":"promo"}]}] @> [{"ruleId":"promo"}]` | **false** | Un rival **imbriqué** n'est pas atteint par la containment : écrire enfin `supersedes` ne trompe pas cette porte                                       |

### 10.2 Le domicile

Une colonne **`pricing_rejected Json?`** sur `order_lines`, à côté de
`pricing_steps` et non dedans. Elle donne les trois états que l'objection 4
exige :

- `NULL` — ligne écrite avant ce lot : **on ne consignait pas**, on ne sait pas ;
- `[]` — une **affirmation** : le moteur n'a écarté aucune règle sur cette ligne ;
- une valeur — ce qui a été écarté, et pourquoi.

Chaque entrée : `{ stage, ruleId, label, scope, cause }`. Le **libellé** y est,
parce qu'un `ruleId` survit volontairement à la suppression de sa règle — c'est
le reproche exact que la contradiction avait fait à `sealedRuleIds`.

⚠️ **Aucun `resultMillicents`**, et cette fois c'est sans danger : rien ne lit
cette colonne pour vérifier un prix. C'est précisément ce que la v1 ne pouvait
pas dire.

### 10.3 Où vit chaque fait — un seul domicile chacun

| Ce qui est arrivé à la règle                    | Où c'est écrit                        | Pourquoi là                                                                              |
| ----------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| elle a agi                                      | `pricing_steps`, inchangé             | c'est ce que le mot veut dire dans douze lecteurs                                        |
| battue dans un étage **qui a produit un étage** | `supersedes` du gagnant               | l'écran barre le perdant sur la barre du gagnant : un duel se dessine là où il a eu lieu |
| battue dans un étage **scellé**                 | `pricing_rejected`, `superseded`      | il n'y a pas de barre de gagnant à décorer — l'étage entier est transparent              |
| gagnante d'un étage scellé                      | `pricing_rejected`, `sealed`          | —                                                                                        |
| sous son seuil de quantité                      | `pricing_rejected`, `below_threshold` | —                                                                                        |

`sealedByRuleId` et `sealedRuleIds` **ne se persistent pas** : le premier est
l'étage `mercuriale` appliqué, le second se **dérive** des entrées `sealed`. Une
seule source dans le domaine, deux formes dans les vues vivantes qui les servent
déjà — pas deux vérités.

### 10.4 🔴 Le barème et la mercuriale, que la v1 croyait couverts

`ladderAsRule` et `mercuriale.asRuleFor` rendent **`null`** quand aucun palier
n'est atteint (`volume-ladder.ts:98`) : le matériau n'entre alors pas dans
`rules`, et le moteur ne peut pas le voir. Or « pourquoi n'ai-je pas eu mon prix
de volume ? » est la question de seuil la plus posée.

**`assembled()` doit donc dire ce qu'il a laissé tomber** — rendre
`{ rules, dropped }` au lieu d'un tableau. C'est le seul endroit du dossier qui
connaît à la fois le matériau et la mesure qui l'a recalé.

### 10.5 Ce qu'on ne fige pas, et comment on y répond quand même

Expiration, suspension, audience, portée : ces règles n'atteignent jamais le
moteur — l'adaptateur et l'index de portée les ont écartées avant. Les figer
demanderait de transporter jusqu'au moteur, pour **chaque ligne de chaque
commande**, des règles qui ne la concernent pas.

🔴 **Et on ne les reconstruit pas depuis la règle d'aujourd'hui** : `resume()`
efface `pausedAt` (`pricing-rule.ts:207`), donc une promotion suspendue puis
reprise se relirait comme « elle était en vigueur ». Sur l'écran du litige, ce
n'est pas une réponse manquante, c'est un **mensonge**.

Elles se répondent depuis le **journal**, qui est append-only et où la pose, la
pause et la reprise sont des actes datés. C'est ce que le JSDoc de
`specificity.ts:141` dit déjà : « cet intervalle vit dans le journal, qui est
l'endroit fait pour ça ». Lot 4.

### 10.6 Ce que la migration fait, et ce qu'elle ne défait pas

- **Additive et seule** : une colonne nullable, aucun `DEFAULT`, aucune reprise.
- **Le rollback applicatif est gratuit** — rien ne dépend de la colonne tant que
  le lecteur la traite comme optionnelle.
- 🔴 **Le `DROP COLUMN`, lui, n'est pas un rollback** : il détruit sans reprise
  possible tout ce qui aura été écrit entre-temps, et le §0 de `CLAUDE.md`
  l'interdit sur la production. La v1 promettait « réversible en un
  déploiement » ; c'était faux, et une phrase qu'on relit sous pression ne doit
  pas promettre ça.
- `lecteur-de-migrations` avant toute promotion vers `main`.

### 10.7 Les lots

| Lot   | Ce qu'il fait                                                                                                                          | Migration |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **1** | Domaine : `assembled()` rend ses recalés, `resolvePrice` rend `rejected`, `sealedRuleIds` en devient une **dérivation**                | aucune    |
| **2** | Persistance : la colonne, son schéma de relecture, `jsonSteps` qui écrit **enfin** `supersedes`, et la vue staff qui expose `rejected` | **une**   |
| **3** | L'écran : `price-path` prend une seconde source, et **dit** laquelle il montre                                                         | aucune    |
| **4** | Les trois causes non figées, reconstruites **depuis le journal**, nommées comme reconstruites                                          | aucune    |

### 10.8 Ce qui le prouvera

- Une promotion scellée laisse `{ruleId, label, cause:"sealed"}` sur la ligne
  persistée — le cas existe, il affirme `supersedes: []`, son commentaire dit que
  le trou est là.
- Un barème dont le palier n'est pas atteint apparaît en `below_threshold`.
  Aujourd'hui il n'existe nulle part (§10.4).
- 🔴 **`hasPriced` ne lit PAS la nouvelle colonne** : une règle regardée puis
  écartée n'a rien facturé, et la porte de repose doit continuer de l'autoriser.
  Un cas rouge sans ce garde-fou.
- Une trace ancienne relit `pricing_rejected: null` — pas `[]`.
- `toCustomerOrder` ne rend pas `rejected` : jeu de clés exact.
- Les **cinq** assertions `expect(line.pricingSteps).toEqual([…])` de
  `price-rules.e2e-spec.ts` (l. 198, 209, 238, 262, 552) changent avec l'arrivée
  de `supersedes` : elles sont dans le lot 2, pas une surprise.

### 10.9 Ce que la v2 n'a pas vérifié

- Que `price-path` accepte une seconde source sans se déformer : il prend un
  `PricingItemView` (canonique, plancher effectif, marge, élasticité) dont une
  trace figée n'a rien. Le lot 3 est soit un adaptateur, soit une refonte de sa
  signature — **et un adaptateur qui fabriquerait un `PricingItemView` synthétique
  serait une résolution vivante contrefaite**, ce que le §5 interdit.
- Le coût en lectures du lot 4, et l'absence de cas de budget sur le détail d'une
  commande.
- Le volume réel de `pricing_rejected` (l'accès prod manque, R12).

---

## 11. La forme v3 — la contradiction a simplifié, deux fois

`vitruve`, seconde passe : les quatre objections fatales de la v1 sont bien
refermées par le §10, et deux BLOQUANT neufs le corrigent. Les deux ont été
rouverts dans le code ; les deux **retirent** de l'ouvrage plutôt qu'ils n'en
ajoutent.

### 11.1 🔴 Le §10.5 se trompait de magasin — et de problème

Le journal ne porte **aucun champ structuré** d'audience, de portée ou de
fenêtre : `pricing_events` a `subjectType`, `subjectId`, `act`, `actor`,
`occurredAt`, `reason` et un `summary` qui est une **phrase française** produite
pour l'œil. Y répondre à « cette règle visait-elle ce client ? » demanderait de
parser un libellé d'affichage pour tenir un litige.

Mais la vraie découverte est l'inverse, et elle vaut mieux : **la fenêtre,
l'audience et la portée d'une règle ne changent jamais.** Les commandes qui
existent sont `Create`, `Pause`, `Resume`, `Archive`, `Rename` — et rien d'autre
(vérifié dans `pricing.commands.ts` le 2026-09-09) ; un barème ou une mercuriale
qu'on repose prend un **nouvel identifiant** ; et `archive()` **borne `validTo`**
au lieu de l'effacer.

Donc **lire la règle d'aujourd'hui dit la vérité** sur trois des quatre causes.
La seule donnée réellement détruite est l'intervalle de pause — `resume()` remet
`pausedAt` à `null` — et celle-là, et elle seule, se retrouve au journal par
l'`occurredAt` des actes `paused` / `resumed`.

**Correction du §10.5** : on ne « répond pas depuis le journal ». On lit la règle,
qui est immuable là où ça compte, et on ne va au journal que pour la pause.

⚠️ Deux réserves qui restent, et qui doivent être écrites sur l'écran : un
libellé se **renomme**, donc un nom reconstruit n'est pas forcément le nom
facturé ; et `entryFromRow` aplatit tout verbe inconnu en `posed`, ce qui
interdit de bâtir une frise naïve sur ce lecteur.

### 11.2 🔴 Le §10.4 aurait écrit une cause FAUSSE, en volume non borné

`mercuriale.asRuleFor` rend `null` **d'abord parce que la grille ne porte pas cet
article** (`company-mercuriale.ts:254`), et ne juge le palier qu'ensuite. Or la
mercuriale est passée **entière, non filtrée par portée** au moteur.

Écrire `below_threshold` sur tout `null` aurait donc marqué « palier non
atteint » sur **chaque ligne de chaque commande de chaque client sous
mercuriale**, pour tout article hors grille. Une cause fausse, en masse, sur
l'écran fait pour le litige.

**Correction** : un matériau qui ne vise pas l'article n'est pas une règle
écartée — il n'a rien à dire, et il ne va pas dans `rejected`. Seul « la mesure
n'atteint aucun palier » y va. `asRuleFor` et `ladderAsRule` doivent donc dire
**pourquoi** ils rendent `null`, au lieu de rendre `null`.

### 11.3 La simplification que l'objection 5 impose — un seul domicile

`priceStepsSchema` déclare `supersedes` avec un défaut `[]` (et non
`.nullable().default(null)` comme `scope`). Tant que rien ne l'écrit, ce `[]`
veut dire « on ne consignait pas » ; le jour où le lot 2 l'écrit, il veut dire
« aucune rivale » — et **plus rien ne distinguera jamais** les traces d'avant de
celles d'après. C'est le grief de l'objection 4, sur le champ voisin, et il est
irréversible dès le premier déploiement.

**Donc `supersedes` n'est PAS persisté, ni maintenant ni plus tard.** Il reste ce
qu'il est : un champ de la vue **vivante**, que le tableau de tarification
affiche sur une résolution du jour.

Et le tableau du §10.3 s'effondre en une ligne : **tout ce qui n'a pas produit
d'étage va dans `pricing_rejected`**, avec sa cause — évincée, scellée, sous le
seuil. Un seul domicile, une seule colonne, trois états, aucune ambiguïté à
créer sur un champ existant.

### 11.4 Ce qui reste à trancher avant de bâtir

- **La cause se décide prédicat par prédicat.** `applies` en conjoint cinq, et
  `resolvePrice` est pure : elle doit rester juste sur un tableau fabriqué à la
  main, ce que chacun de ses tests fait. Écrire « `!applies` ⇒ seuil » la ferait
  mentir là. La cause se nomme donc en rejouant les prédicats dans l'ordre, ou
  `rejected` n'est peuplé que sur le chemin pré-filtré — à écrire, pas à
  supposer.
- **Le chemin de plomberie n'est ni nommé ni chiffré** : `ResolvedPrice` →
  `PricedArticle` → `priceLine` → `OrderLineInput` → `OrderLine` → `Order.place`
  → dépôt → reader → vue. Sept sites, aucun cité par le §10.7.
- **`Prisma.DbNull` et non `null`** à l'écriture, sans quoi les trois états
  s'effondrent en deux dès la première ligne écrite.
- **`parseTrace` est du tout-ou-rien** : il faut dire si une entrée `rejected`
  illisible emporte la trace entière, ou seulement elle-même.

### 11.5 Trois justifications à corriger, qu'aucun lot ne portait

- `jsonSteps` (`prisma-order.repository.ts:254`) et
  `PriceStepView.supersedes` (`pricing.ts:530`) disent tous deux que l'écriture
  « attend le rétrécissement des trois routes ». Il a shippé ce matin (R27), et
  la v3 décide de **ne pas** écrire ce champ : les deux phrases sont périmées
  pour deux raisons différentes, et un lecteur les défendrait pour un mur qui
  n'existe plus.
- Le §10.2 justifie le libellé figé par « un `ruleId` survit à la suppression de
  sa règle ». Il n'y a **aucune suppression** — `archive` est un effacement doux.
  La vraie raison est `RenamePriceRuleCommand`, qui existe et qui ship.
