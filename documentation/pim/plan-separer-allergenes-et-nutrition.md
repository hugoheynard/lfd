# Plan — séparer les allergènes de la nutrition (v5)

> **État : 📐 conception, bâtissable.** Rien n'est bâti sauf les quatre
> correctifs du §2.
>
> **Ouvert le 2026-09-22**, réécrit **quatre fois** le même jour. `vitruve` a
> rendu 3, 4 puis 5 BLOQUANT sur les v1 à v3 ; la v5 les absorbe, et **une mesure
> en a fait tomber la moitié d'un coup** (§3). Le §9 dit ce que chaque version
> affirmait de faux.
>
> 🔴 **Donnée RÉGLEMENTAIRE** — une erreur finit sur une étiquette. Ce qui suit
> reste vrai même si rien n'est publié aujourd'hui.

---

## 1. Le problème, en une phrase

**Enregistrer la fiche enregistre les allergènes ET la nutrition ensemble.** La
requête remplace tout, donc celui qui écrit doit renvoyer ce qu'il ne modifie
pas — et s'il en oublie un bout, ce bout est effacé.

Trois couches traitent déjà les deux comme des sujets distincts (le domaine, la
validation, la publication) ; quatre les soudent (route, port, table, écran).

---

## 2. Quatre bugs vivants, corrigés en concevant

| #   | Ce qui se passait                                                               | Commit      |
| --- | ------------------------------------------------------------------------------- | ----------- |
| 0a  | Enregistrer la fiche **effaçait les traces** « peut contenir »                  | `c7d9034ad` |
| 0b  | S'aligner sur le défaut **détruisait le tarif propre** de la déclinaison        | `85eb56359` |
| 0c  | Enregistrer sans rien cocher **affirmait « aucun allergène »**                  | `35a8ad60e` |
| 0d  | L'outil agent **recopiait la fiche du défaut** sur n'importe quelle déclinaison | `35a8ad60e` |

🔴 **Aucun n'était prévu**, et **0c** fabriquait depuis l'écran normal
l'affirmation même que ce plan veut rendre impossible.

⚠️ **0b et 0d sont la même faute** : écrire une valeur **résolue** dans une
colonne **propre**. Elle se rejouerait à l'identique au lot 2 (§6).

---

## 3. 🔴 La mesure qui a fait tomber la moitié du plan

Comptée en production le 2026-09-22 :

|                                 |                                            |
| ------------------------------- | ------------------------------------------ |
| Fiches                          | **92, toutes en brouillon** — zéro publiée |
| Déclinaisons                    | 93 — une seule fiche en a deux             |
| **Déclarations réglementaires** | **0**                                      |

**Il n'y a rien à migrer.** Les v2 à v4 ont écrit une cérémonie de bascule —
recopie, double écriture, relecture conditionnelle, retour arrière — pour zéro
ligne.

Ce qui tombe avec : la migration sélective, la re-déclaration forcée, et le
premier bloquant de `vitruve` (les `[]` indistinguables — il n'y en a aucun).

⚠️ **Et ça dit autre chose, hors sujet mais vrai** : aucune fiche n'est
publiable, parce que l'invariant 7 exige une déclaration par déclinaison active.
Le référentiel n'est pas bloqué par du code, il est bloqué par de la **saisie**.

---

## 4. Les six décisions (Hugo, 2026-09-22)

| #      | Question                                   | Réponse                                                      |
| ------ | ------------------------------------------ | ------------------------------------------------------------ |
| **D1** | Un drapeau d'alignement, ou deux ?         | **Deux** — un allergènes, un nutrition                       |
| **D2** | La publication n'exige que les allergènes  | **Confirmée** — art. 44 §1 et annexe V pt 19 (ci-dessous)    |
| **D3** | « Nutrition sans déclaration d'allergène » | **On le dit** — état nommé, non publiable                    |
| **D4** | Un fait de journal, ou deux ?              | **Deux**                                                     |
| **D5** | Séparer la table ?                         | **Oui** — a survécu à trois alternatives (§5)                |
| **D6** | Où vit « aucun allergène » ?               | **Avec les allergènes** — « pas de nutrition, si on sépare » |

### 🟢 D2 — confirmée le 2026-09-22, et l'exemption est DOUBLE

Vérifié sur le texte consolidé du règlement (UE) n° 1169/2011 (EUR-Lex,
02011R1169 — 01.01.2018), pas de mémoire. Deux bases couvrent La Folie Coffee, et
**pas la même selon le produit** :

| Ce qu'on vend                                       | Base                | Ce qu'elle exempte                    |
| --------------------------------------------------- | ------------------- | ------------------------------------- |
| Le **frais**, en boutique (non préemballé)          | **art. 44 §1**      | tout l'art. 9 §1 **sauf le point c)** |
| Les **confiseries**, stock propre, vendues par nous | **annexe V, pt 19** | la déclaration nutritionnelle         |

🔴 **L'asymétrie est dans le texte, pas dans notre découpe.** L'article 9 §1 trie
exactement comme ce plan : le point **c)** est _« tout ingrédient […] énuméré à
l'annexe II provoquant des allergies ou des intolérances »_, le point **l)** est
_« une déclaration nutritionnelle »_. L'article 44 §1 rend le **c) obligatoire**
et dit des autres qu'ils **ne le sont pas**. Les allergènes ne sont exemptés par
aucune des deux bases ; la nutrition l'est par les deux.

➡️ L'invariant 7 ne **desserre** donc rien : il cesse d'exiger ce que le
règlement n'exige pas. C'est un redressement, pas une dérogation — et c'est la
raison pour laquelle il peut s'écrire.

**Côté français**, le décret n° 2015-447 du 17 avril 2015 est la mesure nationale
prise au titre de l'art. 44 §1 b). Il ajoute des **modalités** d'information sur
les allergènes (sur la denrée ou à proximité, document d'accompagnement des
livraisons aux collectivités) — il **n'ajoute pas** la déclaration
nutritionnelle. L'exemption tient donc en France.

⚠️ **Les deux bases n'ont pas la même fragilité, et c'est ce qu'il faut
retenir** :

- L'article 44 ne dépend **d'aucun volume**. Tant que le frais se vend non
  préemballé en boutique, rien ne peut le périmer.
- Le point 19 porte **trois conditions que le PIM ne modélise pas** — _faibles
  quantités_, _directement par le fabricant_, _établissements de détail
  **locaux**_ — et le règlement ne chiffre pas « faibles quantités ». Ce sont
  des faits d'entreprise, pas des faits de donnée : ils peuvent cesser d'être
  vrais **sans qu'une ligne de code bouge**.

➡️ Le jour où une confiserie préemballée part chez un revendeur non local, elle
sort des deux exemptions et la nutrition redevient obligatoire **pour elle
seule**. D2 deviendrait alors conditionnelle au canal, et l'invariant 7 avec.
Rien à bâtir aujourd'hui — mais c'est le seul événement qui rouvre ce
paragraphe, et il ne s'annoncera pas depuis le code.

---

## 5. Le modèle, et pourquoi deux tables

| Table               | Colonnes                                               | Absente quand        |
| ------------------- | ------------------------------------------------------ | -------------------- |
| `variant_allergens` | `allergens`, `mayContain` — la déclaration de sécurité | personne n'a déclaré |
| `nutrition_values`  | les **7** valeurs de l'annexe XV + l'indice glycémique | aucune valeur saisie |

Les deux en `PK = FK` sur la déclinaison. Le tri-état devient littéral : **pas de
ligne** = silence · **ligne à tableau vide** = « aucun allergène », affirmation ·
**ligne remplie** = déclaration.

### Les trois options écartées

| Option                                 | Rang | Ce qui cloche                                                        |
| -------------------------------------- | ---- | -------------------------------------------------------------------- |
| Règle d'agrégat seule                  | 3    | ne garde que ce qui passe par lui — or l'écriture le CONTOURNE       |
| Booléen `allergens_declared` + `CHECK` | 1    | **redondance** : la contrainte avoue que deux choses se contredisent |
| Colonne `allergens` **nullable**       | 1    | deux façons de dire « personne n'a parlé » : pas de ligne, ou `NULL` |

🔴 **L'argument qui tranche** : un booléen encode « quelqu'un a-t-il parlé ? »
comme une **donnée**, posée à côté de la donnée dont elle parle. L'absence de
ligne l'encode comme une **structure**. Une donnée peut être fausse ; une
structure, non.

⚠️ Le front porte la preuve du piège : `declaresNone` vit à côté de `selected`,
rien ne les tient d'accord, et à l'enregistrement **le booléen gagne en jetant la
liste**.

⚠️ **Sept valeurs, pas huit** : l'indice glycémique est explicitement **hors**
annexe XV. Il suit les valeurs faute de meilleur foyer.

🔴 **`mayContain` change de côté** : c'est une déclaration d'allergène, soumise au
même référentiel et à la même garde de chevauchement. Le laisser sous `nutrition`
avec deux drapeaux le ferait résoudre par le mauvais.

---

## 6. 🔴 Trois pièges qui survivent à la mesure

Ils ne tiennent pas aux données : ils tiennent au code déjà déployé.

### a. L'écriture ne revient PAS dans `save()`

`save()` a **douze appelants** — publier, archiver, renommer, régler un taux.
Aujourd'hui il ne touche **pas** la fiche réglementaire, donc publier un produit
ne peut pas écraser une déclaration. Lui confier la fiche étendrait le _lost
update_ à douze gestes, sur de la donnée d'étiquette.

```
product.declareAllergens(variantId, …)   ← l'agrégat porte la RÈGLE
allergens.save(variantId, declaration)   ← un port qui n'écrit QUE cette table
```

L'agrégat reste le seul à voir la déclinaison **et** son défaut, donc le seul à
dire « couverte ». Il n'emporte pas la fiche dans chaque enregistrement.

🔴 **Ce que ça fait, en une phrase** (Hugo, 2026-09-22) : **une unité d'écriture
plus courte.** Douze gestes pouvaient toucher la fiche ; un seul le peut.

⚠️ **Et ce que ça ne fait pas.** La concurrence ne disparaît pas, sa SURFACE se
réduit. Deux personnes qui éditent la même section allergènes s'écrasent
toujours — l'écriture reste un `upsert` nu, sans version ni `If-Match`.

> Le port dédié ne rend pas l'écriture sûre. Il fait qu'une écriture ne peut plus
> en détruire une autre **qu'elle ne visait pas**.

La v1 promettait « le _lost update_ disparaît » ; il ne disparaît pas, il cesse
d'être **atteignable par accident**. Le reste demanderait un verrou optimiste,
qui n'existe nulle part dans le dépôt.

⚠️ Et quand il écrira, ce sera depuis `persistenceSnapshot()` — jamais
`snapshot()`, qui résout. C'est la faute 0b/0d.

### b. Les tables exhaustives — il y en a TROIS, pas deux

Le lot 1 en a rencontré une que les cinq versions du plan ignoraient :
`schema-parity.spec.ts` tient la liste de **tous** les modèles hors du schéma
`public`, et refuse dès qu'un modèle apparaît sans y être déclaré
(`schema-ops.counter.ts`). Elle a attrapé les deux tables neuves — sur le lot le
plus simple du chantier, celui qui ne fait que créer deux tables vides.

| Garde                   | Ce qu'elle tient                                  |
| ----------------------- | ------------------------------------------------- |
| `schema-parity.spec.ts` | tout modèle Prisma hors `public`                  |
| `content-facts.ts`      | tout fait de produit, et s'il périme la signature |
| `attribution.ts`        | à quel champ de révision un fait s'attribue       |

⚠️ **Ce sont des tests, pas des compilations.** Le seul vrai refus de compiler
est `phrase-registry.ts`, un `Record<JournalFactType, Phrase>` complet.

### c. Le nom des faits décide de la couverture des gardes

`attribution.ts` filtre `startsWith("product.")`, et le test de `content-facts`
**interdit** un préfixe autre. Or le nommage naturel serait `variant.*` — le
sujet est la déclinaison.

🔴 Un fait `variant.allergens_saved` serait **invisible des deux gardes** : sauver
les allergènes cesserait de périmer la signature « publiable ».

➡️ **`product.allergens_saved` et `product.nutrition_saved`.** Le préfixe ment un
peu sur le sujet ; il dit vrai sur ce qui protège.

| Aussi                                                   | Pourquoi                                      |
| ------------------------------------------------------- | --------------------------------------------- |
| L'ancien fait passe en `retired(...)`                   | ses lignes doivent rester lisibles            |
| …et **reste à `true`** dans `CONTENT_FACTS`             | sinon les faits passés cessent de périmer     |
| …et **garde** son `["allergens"]` dans `attribution.ts` | sinon les changements passés perdent l'auteur |
| Le fait allergènes **hérite** `["allergens"]`           | la révision n'a que ce champ                  |
| Le fait nutrition s'attribue à `[]`                     | voir ci-dessous                               |
| **Deux phrases françaises** dans `phrase-registry.ts`   | c'est le seul vrai refus de compiler          |

🟢 **La nutrition s'attribue à `nutrition`** — le champ entre dans la révision
dès ce lot (Hugo, 2026-09-22 : « j'accepte la bascule d'empreintes »).

Les v1 à v5 le reportaient à un chantier séparé, au motif qu'ajouter un champ
change **toutes** les empreintes — un SHA-256 de l'article entier — et ferait
apparaître le catalogue modifié de bout en bout. **C'était supposé, pas mesuré.**

La production porte **zéro révision**. Il n'y a donc aucune empreinte à
rebasculer, et rien à quoi comparer : le faux diff redouté n'a pas de lecteur.
Reporter aurait coûté un second chantier pour épargner un coût nul — et laissé
entre temps un fait de nutrition attribué à `[]`, c'est-à-dire un écran qui dit
« personne n'a touché à ce champ » d'un champ que quelqu'un vient d'écrire.

⚠️ Ce qui reste vrai : le jour où des révisions existeront, ajouter un champ
d'article sera une bascule d'empreintes, et elle se paiera. La fenêtre est
**maintenant**, et c'est la seule raison de la prendre maintenant.

### c bis. La lecture bascule dans le MÊME lot

Le plan mettait la bascule des lectures au lot 5, derrière les deux drapeaux et
D2. Mesuré le 2026-09-22, c'était une découpe faite de mémoire : la fiche
réglementaire est lue à **deux endroits** — `toVariant` de
`prisma-product.repository.ts`, vingt lignes, et
`pim/ingredients/infrastructure/prisma-variant-declaration.reader.ts`, qui
alimente l'écran de composition — et écrite dans **un seul fichier**.

🔴 **Ce paragraphe a dit « un seul endroit » jusqu'au lot 3.** Le second lecteur
a été trouvé en bâtissant, par deux e2e de `pim-ingredients` qui ont rougi. La
mesure qui a redressé la découpe des lots était elle-même incomplète : j'avais
cherché les lecteurs de `toVariant`, pas ceux de la table. Compter en partant du
code qu'on connaît trouve ce qu'on connaît.

Ça ne change pas la conclusion — ça l'appuie. Deux lecteurs, c'est une fenêtre
deux fois plus large, et le second est précisément l'écran où une déclaration
d'allergène se relit.

Les séparer coûtait plus que les joindre : entre le lot 3 et le lot 5, les
écritures seraient parties dans les tables neuves pendant que la lecture
interrogeait encore l'ancienne. Toute déclaration faite dans cette fenêtre aurait
été **invisible de l'écran qui vient de l'enregistrer**.

➡️ Le lot 3 emporte la lecture. Le lot 5 garde ce qui dépend vraiment des
drapeaux : l'invariant 7 et la couverture.

---

### d. Les contrats servis au back-office

Le catalogue est vide, **le front ne l'est pas** — il est déployé et appelle ces
routes.

| Quoi                                         | Ce qu'il faut                                        |
| -------------------------------------------- | ---------------------------------------------------- |
| `VariantNutritionView` perd `mayContain`     | déprécier, puis retirer                              |
| L'enum `aspect` — **trois** endroits, pas un | `contracts`, `pim-contracts` (la requête), l'agrégat |

➡️ `"regulatory"` reste **acceptée en écriture** jusqu'au retrait du front qui
l'envoie ; les valeurs s'**ajoutent**, on ne renomme pas. Et le drapeau nutrition
naît à la **même valeur** que celui qu'il dédouble.

#### Quelle colonne hérite de quel drapeau (tranché le 2026-09-22)

**UNE seule colonne neuve : `nutrition_follows_default`.** L'existante,
`regulatory_follows_default`, devient **le drapeau des allergènes** sans changer
de nom.

Le dédoublement se lit en trois lignes, et la dernière est le gabarit exact de
`20260903140000_alignement_par_section` :

```sql
ALTER TABLE "pim"."product_variant"
  ADD COLUMN "nutrition_follows_default" BOOLEAN NOT NULL DEFAULT false;

-- Le drapeau naît à la valeur de celui qu'il dédouble : une déclinaison
-- alignée l'était sur la fiche ENTIÈRE. Partir à `false` la désalignerait
-- silencieusement côté nutrition, ce que personne n'a décidé.
UPDATE "pim"."product_variant"
  SET "nutrition_follows_default" = "regulatory_follows_default";

-- Même raison que les deux autres : le défaut ne peut pas se suivre lui-même.
ALTER TABLE "pim"."product_variant"
  ADD CONSTRAINT "product_variant_default_feeds_itself"
  CHECK (NOT ("is_default" AND "nutrition_follows_default"));
```

🔴 **Pourquoi pas deux colonnes neuves et l'ancienne dépréciée**, ce que le
« étendre, basculer, resserrer » du `CLAUDE.md` §0 prescrirait : ce protocole
protège un **déplacement de données**, c'est-à-dire le cas où une lecture en vol
trouverait la colonne vidée. Ici la colonne n'est ni vidée, ni déplacée, ni
resserrée — elle **garde sa valeur et ses lecteurs**, et n'en perd qu'une moitié
de sens. Ajouter `allergens_follows_default` aurait fait vivre trois colonnes
pour deux drapeaux, avec une fenêtre où deux d'entre elles se prétendent
autoritaires sur le même fait.

⚠️ Ce qui se paie : **le nom de la colonne ment un peu sur son sujet**, comme le
préfixe `product.` des deux faits. Il dit vrai sur ce qu'il protège — le `CHECK`
et les lecteurs existants — et il dira faux sur ce qu'il décrit jusqu'au lot 7,
qui peut le renommer d'une migration additive si quelqu'un la juge rentable.

---

## 7. Les lots

| Lot   | Contenu                                                                      | Bloque par |
| ----- | ---------------------------------------------------------------------------- | ---------- |
| ~~0~~ | ✅ Les quatre correctifs (§2)                                                | —          |
| 1     | Les deux tables — **vides**, aucune reprise (§3)                             | —          |
| 2     | La règle dans l'agrégat, l'écriture dans un port dédié (§6a)                 | 1          |
| 3     | Les deux routes, les deux faits, l'ancien en `retired`, **la lecture** (§6c) | 2          |
| 4     | Les deux drapeaux — colonne, `CHECK`, valeur d'enum **ajoutée** (§6d)        | 2          |
| 5     | L'invariant 7 s'écrit sur les allergènes seuls ; la couverture (D2)          | 3, 4       |
| 6     | L'écran : deux sections, deux enregistrements, **et les traces**             | 5          |
| 7     | L'ancienne table et l'ancienne route partent ; `mayContain` sort de la vue   | 6          |

⚠️ **Le resserrage choisit et le dit** : l'ancienne route qui reçoit encore
`allergens` **refuse** (400). Sur du réglementaire, un `200` qui n'écrit rien est
pire que le refus.

### Irréversible au premier merge dans `main`

- le **nom des deux faits** — et il décide de la couverture (§6c) ;
- le **nom des deux tables** et de leurs colonnes ;
- les **valeurs ajoutées** à l'enum `aspect` ;
- la forme de `VariantNutritionView` ;
- le champ **`nutrition`** d'un article de révision — il change toutes les
  empreintes, et la fenêtre où ça ne coûte rien est celle où il n'y a aucune
  révision. Elle se referme à la première ancre posée.

### 🔴 Le seul geste destructeur, et il n'est PAS dans le dépôt

`pim.nutrition_declaration` n'est plus ni lue ni écrite depuis le lot 3, et le
lot 7 l'a rendue **inatteignable** depuis `src/pim/`. Elle n'est pas supprimée,
et sa suppression **n'existe volontairement pas en migration**.

La raison est mécanique, vérifiée le 2026-09-22 dans
`.github/workflows/deploy_lfd_api.yml:340` : le déploiement lance
`prisma migrate deploy`. **Toute migration présente dans le dépôt s'applique
seule au merge.** Écrire le `DROP` ici, même sans l'appliquer en local, l'aurait
envoyé en production sans que personne le décide — exactement ce que le
`CLAUDE.md` §0 interdit : _« proposer le geste et laisser Hugo décider, ne pas
l'exécuter d'autorité »_.

Le modèle Prisma reste donc déclaré. Il décrit une table que plus aucun code
n'ouvre, et ce désaccord entre le schéma et l'usage est **le signal**, pas un
oubli.

**Le jour où on la supprime — d'abord compter, ensuite seulement supprimer :**

```sql
-- 1. À LANCER D'ABORD, en production. Le chantier a été bâti sur la mesure
--    « zéro ligne » du 2026-09-22 ; elle se re-mesure, elle ne se suppose pas.
SELECT count(*) FROM "pim"."nutrition_declaration";

-- 2. Seulement si le compte est 0. Sinon, s'arrêter : une ligne signifie
--    qu'un chemin d'écriture a survécu au lot 3, et c'est LUI le sujet.
DROP TABLE "pim"."nutrition_declaration";
```

Et dans le même déploiement, mais pas avant : retirer le modèle
`NutritionDeclaration` de `prisma/schema/pim/regulatory-sheet.prisma`, le dos de
relation `nutrition` sur `ProductVariant`, et l'entrée de
`platform/database/schema-ops.counter.ts` — que la porte `schema-parity` tient.

---

## 8. Ce qu'on ne fait PAS

| ❌                                                | Pourquoi                                                  |
| ------------------------------------------------- | --------------------------------------------------------- |
| Ajouter un champ `nutrition` à la révision        | Change **toutes** les empreintes — chantier séparé        |
| Renommer la valeur `regulatory`                   | Valeur servie, déjà dans des faits posés                  |
| Ramener l'écriture de la fiche dans `save()`      | Étendrait le _lost update_ à douze gestes                 |
| Nommer les faits `variant.*`                      | Les rendrait invisibles des deux gardes                   |
| Toucher l'invariant 7 autrement que pour l'écrire | C'est une garde de sécurité ; la déplacer se décide seule |

---

## 9. Ce que les versions précédentes affirmaient de faux

| V   | Affirmation                                 | Ce qui l'a démentie                                  |
| --- | ------------------------------------------- | ---------------------------------------------------- |
| v1  | « Deux routes, la même table » suffit       | Crée un produit publiable sans déclaration           |
| v1  | « Le _lost update_ disparaît »              | Non : l'`upsert` reste nu                            |
| v2  | `products.save()` n'existe peut-être pas    | Il existe — et persistait l'instantané résolu (0b)   |
| v2  | « écrites en parallèle »                    | Aucune reprise prévue                                |
| v3  | « `[]` se recopie tel quel »                | Les `[]` étaient indistinguables (0c les fabriquait) |
| v3  | « l'écriture revient dans `save()` »        | Étendrait le _lost update_ à douze gestes            |
| v3  | Les gardes « refusent de compiler »         | Ce sont des **tests** — et `variant.*` leur échappe  |
| v3  | « les 8 valeurs de l'annexe XV »            | Sept — la 8ᵉ est hors annexe                         |
| v4  | Une migration sélective, une re-déclaration | 🔴 **Il n'y a aucune ligne à migrer** (§3)           |

🔴 **La même faute, cinq fois : décrire l'existant sans l'ouvrir.** La mesure du
§3 tient en quatre chiffres et aurait dû précéder la v1 — elle a été demandée à
la v3. Les quatre correctifs du §2, eux, sont tous sortis d'une lecture.
