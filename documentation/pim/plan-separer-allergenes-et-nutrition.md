# La fiche réglementaire — allergènes et valeurs nutritionnelles

> **Doc d'architecture.** Décrit ce qui tourne en production depuis le
> 2026-09-22 (`1e3f25a07`).
>
> ⚠️ **Le fichier garde un nom de plan**, et c'est délibéré : deux
> `migration.sql` **déjà appliquées** le citent, et une migration appliquée ne
> se modifie pas — son checksum Prisma changerait. Le contenu, lui, n'est plus
> un plan.
>
> 🔴 **Donnée RÉGLEMENTAIRE** — une erreur finit sur une étiquette.

---

## 1. Ce que la fiche réglementaire est

Deux sujets distincts, **deux tables**, jamais écrites ensemble.

| Table                   | Ce qu'elle porte                                        | Absente quand        |
| ----------------------- | ------------------------------------------------------- | -------------------- |
| `pim.variant_allergens` | `allergens`, `may_contain` — la déclaration de sécurité | personne n'a déclaré |
| `pim.nutrition_values`  | les **7** valeurs de l'annexe XV + l'indice glycémique  | aucune valeur saisie |

Les deux en **`PK = FK`** sur `product_variant` : la clé primaire _est_ la clé
étrangère, donc deux fiches pour une même déclinaison sont structurellement
impossibles. `ON DELETE CASCADE` — une déclinaison effacée n'a plus de fiche à
porter.

⚠️ **Sept valeurs, pas huit** : l'indice glycémique est explicitement **hors**
annexe XV. Il vit avec les valeurs faute de meilleur foyer.

### 🔴 Le tri-état, et pourquoi il est structurel

|                         | Ce que ça veut dire                       |
| ----------------------- | ----------------------------------------- |
| **Pas de ligne**        | personne ne s'est prononcé                |
| **Ligne, tableau vide** | « aucun allergène » — une **affirmation** |
| **Ligne remplie**       | une déclaration                           |

C'est tout l'objet de la séparation : **écrire une valeur nutritionnelle ne peut
plus créer d'affirmation d'allergène, parce qu'il n'y a pas de colonne à
remplir.**

Trois alternatives ont été écartées, et la raison vaut au-delà de ce sujet :

| Écarté                                 | Ce qui cloche                                                        |
| -------------------------------------- | -------------------------------------------------------------------- |
| Booléen `allergens_declared` + `CHECK` | **redondance** : la contrainte avoue que deux choses se contredisent |
| Colonne `allergens` **nullable**       | deux façons de dire « personne n'a parlé » : pas de ligne, ou `NULL` |
| Une règle d'agrégat seule              | ne garde que ce qui passe par lui — or l'écriture le contourne       |

> Un booléen encode « quelqu'un a-t-il parlé ? » comme une **donnée**, posée à
> côté de la donnée dont elle parle. L'absence de ligne l'encode comme une
> **structure**. **Une donnée peut être fausse ; une structure, non.**

### `mayContain` est un allergène, pas une valeur

Les traces « peut contenir » vivent avec les allergènes : même référentiel de
codes, même garde de chevauchement (un code ne peut pas être à la fois présent
et en trace). Les ranger sous la nutrition les ferait résoudre par le mauvais
drapeau d'alignement.

---

## 2. Écrire — deux routes, un port par table

```
PUT /pim/products/:id/variants/:variantId/allergens    → allergens + mayContain
PUT /pim/products/:id/variants/:variantId/nutrition    → les 7 valeurs + l'IG
```

🔴 **La route nutrition REFUSE (400) si le corps porte `allergens` ou
`mayContain`.** Sur de la donnée réglementaire, un `200` qui n'écrit pas ce
qu'on lui a envoyé est pire qu'un refus : il a l'exacte apparence du succès.

Chaque route passe par l'agrégat pour la **règle**, puis par un port qui n'écrit
**que sa table** :

```
product.declareAllergens(variantId, …)        ← l'agrégat porte la RÈGLE
allergens.save(variantId, declaration)        ← VariantAllergensRepository
nutritionValues.save(variantId, values)       ← NutritionValuesRepository
```

### Pourquoi l'écriture ne passe PAS par `save()`

`ProductRepository.save()` a **douze appelants** — publier, archiver, renommer,
régler un taux — et réécrit toutes les déclinaisons. Lui confier la fiche ferait
qu'un renommage pourrait écraser une déclaration faite entre-temps.

> Le port dédié ne rend pas l'écriture sûre. Il fait qu'une écriture ne peut
> plus en détruire une autre **qu'elle ne visait pas**.

⚠️ **Ce que ça ne règle pas** : deux personnes qui éditent la même section
s'écrasent toujours. L'écriture reste un `upsert` nu, sans version ni
`If-Match`. Un verrou optimiste n'existe nulle part dans le dépôt.

⚠️ L'écriture part de `persistenceSnapshot()` — **jamais** de `snapshot()`, qui
résout l'héritage. Écrire une valeur **résolue** dans une colonne **propre** est
la faute qui a produit deux des quatre bugs d'origine, et les doubles de test
doivent persister comme l'adaptateur, sous peine de laisser la régression passer
au vert.

---

## 3. Lire — deux sites, et c'est tout

| Site                                                     | Pour qui               |
| -------------------------------------------------------- | ---------------------- |
| `prisma-product.repository.ts` → `toVariant`             | la fiche produit       |
| `pim/ingredients/…/prisma-variant-declaration.reader.ts` | l'écran de composition |

La vue servie sépare les deux moitiés comme la base :

```ts
readonly allergenSheet: { declared: string[]; mayContain: string[] } | null;
readonly nutrition:     VariantNutritionView | null;   // les 8 valeurs
```

🔴 `allergenSheet` est **un objet nullable, pas deux champs**. Les deux moitiés
viennent d'une seule ligne : on ne peut pas lire les traces sans avoir traité le
cas « personne ne s'est prononcé ».

---

## 4. L'alignement sur la déclinaison par défaut

Une déclinaison peut **suivre** la fiche du défaut plutôt que d'en porter une.
Depuis la séparation, cette décision se prend **par moitié**.

| Colonne                      | Ce qu'elle commande                   |
| ---------------------------- | ------------------------------------- |
| `regulatory_follows_default` | **les allergènes** (traces comprises) |
| `nutrition_follows_default`  | les valeurs nutritionnelles           |
| `pricing_follows_default`    | le prix et le poids                   |

Chacune porte un `CHECK` : **le défaut ne peut pas se suivre lui-même.**

⚠️ **`regulatory_follows_default` n'a pas été renommée**, et son nom ment donc
d'un demi-mot : elle ne porte plus que les allergènes. Une migration de colonne
pour cette seule justesse ne se paie pas. `ASPECT_FLAG`, dans `variant.ts`, est
le **seul** endroit où `"regulatory"` et `"allergens"` se rejoignent — c'est là
qu'un renommage commencerait.

L'enum `aspect` du journal porte **quatre** valeurs : `regulatory`, `pricing`,
`allergens`, `nutrition`. `"regulatory"` n'est plus jamais **envoyée**, mais
reste **lisible** : des faits déjà posés la portent, et une valeur de donnée ne
se renomme pas, elle se migre.

---

## 5. Publier — l'invariant 7

**On ne met pas en vente ce qu'on ne peut pas étiqueter.** `Product.publish()`
refuse si une déclinaison **active** ne déclare pas ses allergènes, et nomme les
SKU en cause.

- `[]` compte comme déclaré — « aucun allergène » est une affirmation.
- Une déclinaison alignée est couverte par le défaut (`declaresAllergens`).
- Les déclinaisons arrêtées ne comptent pas : elles ne partent chez aucun canal.

### 🟢 Les valeurs nutritionnelles ne sont PAS exigées

Vérifié sur le texte consolidé du règlement (UE) n° 1169/2011 (EUR-Lex,
02011R1169). L'article 9 §1 trie exactement comme cette architecture : le point
**c)** est _« tout ingrédient […] provoquant des allergies ou des
intolérances »_, le point **l)** est _« une déclaration nutritionnelle »_.

| Ce qu'on vend                                       | Base                | Ce qu'elle exempte                    |
| --------------------------------------------------- | ------------------- | ------------------------------------- |
| Le **frais**, en boutique (non préemballé)          | **art. 44 §1**      | tout l'art. 9 §1 **sauf le point c)** |
| Les **confiseries**, fabriquées et vendues par nous | **annexe V, pt 19** | la déclaration nutritionnelle         |

Les allergènes ne sont exemptés par **aucune** des deux bases ; la nutrition
l'est par les deux. L'invariant 7 ne desserre donc rien — **il cesse d'exiger ce
que le règlement n'exige pas.**

Côté français, le décret n° 2015-447 du 17 avril 2015 est la mesure nationale
prise au titre de l'art. 44 §1 b) : il ajoute des **modalités** d'information sur
les allergènes, pas la déclaration nutritionnelle.

⚠️ **Les deux bases n'ont pas la même fragilité.** L'article 44 ne dépend d'aucun
volume. Le point 19, lui, porte trois conditions que le PIM **ne modélise pas** —
_faibles quantités_, _directement par le fabricant_, _établissements de détail
**locaux**_ — et le règlement ne chiffre pas la première.

➡️ **Le jour où une confiserie préemballée part chez un revendeur non local**,
elle sort des deux exemptions : la nutrition redevient obligatoire pour elle
seule, et l'exigence devient conditionnelle au canal. Rien dans le code ne
préviendra.

---

## 6. Le journal et la révision

Deux faits, et leur préfixe est une contrainte, pas une préférence :

```
product.allergens_saved
product.nutrition_saved
product.declaration_saved   ← retired() : plus personne ne l'écrit, il se lit encore
```

🔴 **Pourquoi `product.` et pas `variant.`**, alors que le sujet est la
déclinaison : `attribution.ts` et `content-facts.ts` filtrent tous deux
`startsWith("product.")`. Un fait `variant.allergens_saved` serait **invisible
des deux gardes** — enregistrer des allergènes cesserait de périmer la signature
« publiable ». _Le préfixe ment un peu sur le sujet ; il dit vrai sur ce qui
protège._

L'ancien fait reste à `true` dans `CONTENT_FACTS` et garde son `["allergens"]`
dans `attribution.ts` : sinon les lignes déjà posées perdraient leur effet et
leur auteur.

**La révision porte un champ `nutrition`** à côté d'`allergens`. Sans lui, un
fait de nutrition s'attribuerait à `[]` — un écran qui dit « personne n'a touché
à ce champ » d'un champ que quelqu'un vient d'écrire.

### Les gardes, et ce qu'elles sont vraiment

| Garde                   | Ce qu'elle tient                                  |
| ----------------------- | ------------------------------------------------- |
| `schema-parity.spec.ts` | tout modèle Prisma hors du schéma `public`        |
| `content-facts.ts`      | tout fait de produit, et s'il périme la signature |
| `attribution.ts`        | à quel champ de révision un fait s'attribue       |
| `phrase-registry.ts`    | une phrase française par type de fait             |

⚠️ **Les trois premières sont des TESTS, pas des compilations.** Seul
`phrase-registry.ts` refuse de compiler — c'est un
`Record<JournalFactType, Phrase>` complet.

---

## 7. L'écran

La fiche se saisit en **deux sections**, deux boutons, deux requêtes :
`form-sections/allergens/` et `form-sections/nutrition/`. Enregistrer l'une
n'envoie rien de l'autre.

Le tri-état vit dans `product-form/allergen-declaration.ts`, pur et testé : `[]`
ne naît que d'un geste explicite, décocher la dernière case retombe au silence,
et présent/trace sont exclusifs.

⚠️ **Deux champs sont volontairement fermés plutôt que menteurs** :

- le **poids net** est grisé quand le tarif est aligné — il appartient alors au
  défaut, et l'enregistrement ne l'écrirait pas ;
- la **grille nutritionnelle** n'apparaît qu'à l'édition : la création ne sait
  pas encore recevoir ces valeurs. Le poids, lui, part bien à la création.

---

## 8. Les règles qui tiennent

| ❌                                                | Pourquoi                                                  |
| ------------------------------------------------- | --------------------------------------------------------- |
| Renommer la valeur `regulatory`                   | Valeur servie, déjà dans des faits posés                  |
| Ramener l'écriture de la fiche dans `save()`      | Étendrait le _lost update_ à douze gestes                 |
| Nommer les faits `variant.*`                      | Les rendrait invisibles des deux gardes                   |
| Toucher l'invariant 7 autrement que pour l'écrire | C'est une garde de sécurité ; la déplacer se décide seule |
| Un doublé de test qui persiste `snapshot()`       | Laisse passer au vert la faute qu'il devrait attraper     |

---

## 9. 🔴 Le seul geste qui reste, et il est destructeur

`pim.nutrition_declaration` est **hors service** : plus aucun code ne l'ouvre, et
elle n'est plus atteignable depuis `src/pim/`. Elle n'est **pas** supprimée, et
sa suppression **n'existe volontairement pas en migration**.

La raison est mécanique : `deploy_lfd_api.yml` lance `prisma migrate deploy` à
chaque push sur `main`. **Toute migration présente dans le dépôt s'applique
seule.** Un `DROP` écrit « pour plus tard » partirait en production sans que
personne le décide.

Le modèle Prisma reste donc déclaré. Ce désaccord entre le schéma et l'usage est
**le signal**, pas un oubli.

```sql
-- 1. D'ABORD, en production. Le chantier a été bâti sur la mesure « zéro
--    ligne » du 2026-09-22 ; elle se re-mesure, elle ne se suppose pas.
SELECT count(*) FROM "pim"."nutrition_declaration";

-- 2. Seulement si le compte est 0. Sinon s'arrêter : une ligne signifierait
--    qu'un chemin d'écriture a survécu, et c'est LUI le sujet.
DROP TABLE "pim"."nutrition_declaration";
```

Dans le même déploiement, mais pas avant : retirer le modèle
`NutritionDeclaration` de `prisma/schema/pim/regulatory-sheet.prisma`, le dos de
relation `nutrition` sur `ProductVariant`, et l'entrée de
`platform/database/schema-ops.counter.ts` — que `schema-parity` tient.

---

## 10. Ce qui reste ouvert

| Sujet                                                             | Pourquoi ce n'est pas tranché                                                                             |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Le **poids net** voyage par le tarif, s'affiche avec la nutrition | Le déplacer touche le prix. L'écran est honnête en attendant : le champ se ferme quand il ne s'écrira pas |
| La **création** n'accepte pas les valeurs nutritionnelles         | La grille est fermée plutôt que menteuse. L'ouvrir est un chantier                                        |
| **D3** — « nutrition sans allergènes » n'est nommé qu'au serveur  | Le refus de publier dit le cas ; l'écran ne le dit pas                                                    |
| `"regulatory"` encore **acceptée en écriture**                    | Plus rien ne l'envoie. La retirer se fait en une valeur, dans `ASPECT_FLAG` et le schéma                  |
| `product-form-store.ts` à **2113 lignes**                         | Plafond ≲300. La découpe évidente est la machinerie de brouillon par déclinaison                          |
| Le **verrou optimiste** n'existe pas                              | Deux éditeurs de la même section s'écrasent. Vrai partout dans le dépôt, pas ici seulement                |

---

## 11. Deux choses à savoir avant de toucher à ce domaine

**Une migration présente dans le dépôt s'applique seule au merge.** Ce n'est pas
une précaution, c'est le comportement de `migrate deploy`. Un geste destructeur
s'écrit en SQL dans un document, jamais en dossier de migration, tant que
personne ne l'a décidé.

**L'API et le back-office se déploient dans deux workflows de durées
différentes.** Un merge unique ne supprime pas la fenêtre entre les deux, il la
réduit à leur écart — mesuré le 2026-09-22 : **70 secondes**, entre 11 min 39 et
12 min 49. Tout changement qui touche les deux côtés en traverse une.

---

## Historique

Le chantier, ses quatre bugs d'origine, ses six décisions, et les huit
affirmations qu'il a faites de faux en se bâtissant : commits `3661c71a1`,
`4bee4c160`, `427f21912`, `1a2908ea`, et le merge `1e3f25a07` du 2026-09-22.

Une seule leçon mérite d'être répétée ici, parce qu'elle se rejoue ailleurs :
**une mesure a un point de départ, et c'est lui qui décide de ce qu'elle peut
trouver.** Ce document a affirmé que la fiche était lue à un seul endroit ; elle
l'était à deux. La mesure avait compté les appelants d'une fonction connue au
lieu des lecteurs de la table.
