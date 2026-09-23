# Séparer les allergènes de la nutrition

> **État : ✅ BÂTI ET FUSIONNÉ**, le 2026-09-22 — `427f21912` (les lots 3 à 7)
> et `1a2908ea` (la vue). Les lots 1 et 2 l'étaient déjà (`3661c71a1`,
> `4bee4c160`). Ce document décrit désormais **ce qui existe**, au présent.
>
> Il reste écrit comme un plan parce qu'il l'a été : ouvert le 2026-09-22 et
> réécrit **quatre fois** le même jour, `vitruve` ayant rendu 3, 4 puis 5
> BLOQUANT sur les v1 à v3. Ce qu'il raconte de sa propre fabrication — le §3,
> le §9 — n'est pas de la nostalgie : c'est la partie qui empêche de refaire les
> mêmes fautes, et elle disparaîtrait d'une description propre.
>
> 🔴 **Donnée RÉGLEMENTAIRE** — une erreur finit sur une étiquette.
>
> **Un seul geste reste à faire, et il est destructeur** : supprimer la table
> `pim.nutrition_declaration`, hors service depuis le lot 3. Le SQL est au §7,
> il n'existe **volontairement pas** en migration, et il se compte avant de
> s'exécuter.

---

## 1. Le problème, en une phrase

**Enregistrer la fiche enregistrait les allergènes ET la nutrition ensemble.**
La requête remplaçait tout, donc celui qui écrivait devait renvoyer ce qu'il ne
modifiait pas — et s'il en oubliait un bout, ce bout était effacé.

Trois couches traitaient déjà les deux comme des sujets distincts (le domaine,
la validation, la publication) ; quatre les soudaient — route, port, table,
écran. **Les quatre sont défaites.**

---

## 2. Quatre bugs vivants, corrigés en concevant

| #   | Ce qui se passait                                                               | Commit      |
| --- | ------------------------------------------------------------------------------- | ----------- |
| 0a  | Enregistrer la fiche **effaçait les traces** « peut contenir »                  | `c7d9034ad` |
| 0b  | S'aligner sur le défaut **détruisait le tarif propre** de la déclinaison        | `85eb56359` |
| 0c  | Enregistrer sans rien cocher **affirmait « aucun allergène »**                  | `35a8ad60e` |
| 0d  | L'outil agent **recopiait la fiche du défaut** sur n'importe quelle déclinaison | `35a8ad60e` |

🔴 **Aucun n'était prévu**, et **0c** fabriquait depuis l'écran normal
l'affirmation même que ce chantier a rendue impossible.

⚠️ **0b et 0d sont la même faute** : écrire une valeur **résolue** dans une
colonne **propre**. Elle s'est rejouée à l'identique — non dans le code du lot 2, mais dans
**six doubles de test** qui persistaient l'instantané résolu là où l'adaptateur
persiste l'instantané propre (§6a). Une régression de cette forme y restait
verte ; le lot 5 les a corrigés.

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

➡️ Depuis le lot 5, ce qu'il exige est **la déclaration d'allergènes seule** —
pas les valeurs nutritionnelles (D2). Le blocage reste entier, mais il ne
demande plus que la moitié du travail de saisie.

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

Les deux en `PK = FK` sur la déclinaison. Le tri-état **est** littéral : **pas de
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

⚠️ Le front **portait** la preuve du piège : `declaresNone` vivait à côté de
`selected`, rien ne les tenait d'accord, et le booléen l'emportait en jetant la
liste. Le lot 6 l'a remplacé par le même tri-état que la base
(`product-form/allergen-declaration.ts`) : `[]` ne naît plus que d'un geste
explicite, et décocher la dernière case retombe au silence.

🔵 **Une nuance trouvée en le réparant** : la divergence ne naissait pas du
geste — `declareNoAllergen(true)` vidait déjà la liste — mais de
**l'hydratation**. La conclusion tient, sa démonstration était plus faible que
sa formulation.

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

⚠️ Il écrit depuis `persistenceSnapshot()` — jamais `snapshot()`, qui résout.
C'est la faute 0b/0d.

🔴 **Et c'est là que le chantier a failli se faire avoir.** Six doubles de
`ProductRepository`, dans les specs d'application, persistaient `snapshot()` —
le RÉSOLU. Le code de production était juste ; les tests censés le protéger
jouaient la faute. Une régression écrivant la fiche du défaut dans la colonne
propre d'une déclinaison alignée serait passée **au vert**. Un doublé qui
diverge du port qu'il prétend jouer ne protège rien, et rien ne rougit pour le
dire.

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

| Aussi                                                   | Pourquoi                                        |
| ------------------------------------------------------- | ----------------------------------------------- |
| L'ancien fait passe en `retired(...)`                   | ses lignes doivent rester lisibles              |
| …et **reste à `true`** dans `CONTENT_FACTS`             | sinon les faits passés cessent de périmer       |
| …et **garde** son `["allergens"]` dans `attribution.ts` | sinon les changements passés perdent l'auteur   |
| Le fait allergènes **hérite** `["allergens"]`           | la révision n'a que ce champ                    |
| Le fait nutrition s'attribue à **`["nutrition"]`**      | le champ est entré dans la révision, ci-dessous |
| **Deux phrases françaises** dans `phrase-registry.ts`   | c'est le seul vrai refus de compiler            |

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

⚠️ **La fenêtre s'est refermée avec le merge du 2026-09-22.** Le champ est
entré pendant qu'il n'existait aucune révision : coût nul, aucun lecteur pour
voir un faux diff. La prochaine ancre posée fige les empreintes de la nouvelle
forme — à partir de là, ajouter un champ d'article se paiera.

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

Le catalogue était vide, **le front ne l'était pas** — déployé, il appelait ces
routes. C'est ce qui a imposé d'ajouter les valeurs d'enum plutôt que de les
renommer, et de déployer les deux côtés dans le même merge.

| Quoi                                           | Ce qui a été fait                                                                            |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `VariantNutritionView` perd `mayContain`       | **fait** — `allergenSheet: { declared, mayContain }`                                         |
| L'enum `aspect` — **cinq** endroits, pas trois | `contracts`, `pim-contracts`, l'agrégat, et **deux dictionnaires du journal** au back-office |

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
et les lecteurs existants — et il dit faux sur ce qu'il décrit. Le lot 7 ne l'a
**pas** renommé : une migration de colonne pour un demi-mot de justesse ne se
paie pas d'elle-même. `ASPECT_FLAG`, dans `variant.ts`, est le seul endroit où
`"regulatory"` et `"allergens"` se rejoignent — c'est là qu'un renommage
commencerait.

---

## 7. Les lots

| Lot   | Contenu                                                                      | Commit      |
| ----- | ---------------------------------------------------------------------------- | ----------- |
| ~~0~~ | Les quatre correctifs (§2)                                                   | voir §2     |
| ~~1~~ | Les deux tables — **vides**, aucune reprise (§3)                             | `3661c71a1` |
| ~~2~~ | La règle dans l'agrégat, l'écriture dans un port dédié (§6a)                 | `4bee4c160` |
| ~~3~~ | Les deux routes, les deux faits, l'ancien en `retired`, **la lecture** (§6c) | `427f21912` |
| ~~4~~ | Les deux drapeaux — colonne, `CHECK`, valeur d'enum **ajoutée** (§6d)        | `427f21912` |
| ~~5~~ | L'invariant 7 s'écrit sur les allergènes seuls ; la couverture (D2)          | `427f21912` |
| ~~6~~ | L'écran : deux sections, deux enregistrements, **et les traces**             | `427f21912` |
| ~~7~~ | Le code mort part ; `mayContain` sort de la vue                              | `1a2908ea`  |

⚠️ **Les lots 3 à 6 partagent un commit, et ce n'est pas un raccourci.** Ils ont
réécrit tour à tour **les mêmes fichiers** — `variant.ts` quatre fois. L'arbre
porte leur état cumulé, pas sept états séparables : les découper aurait demandé
un tri par hunks dont aucun état intermédiaire n'aurait compilé, donc n'aurait
été testé. Sept commits dont six faux valent moins qu'un commit vrai.

🔴 **Le lot 7 ne supprime PAS la table.** Voir plus bas : le seul geste
destructeur n'existe pas en migration, exprès.

⚠️ **Le resserrage choisit et le dit** : l'ancienne route qui reçoit encore
`allergens` **refuse** (400). Sur du réglementaire, un `200` qui n'écrit rien est
pire que le refus.

### Ce que le merge a rendu irréversible

Cette liste était un avertissement ; elle est maintenant un **constat**. Ces
formes sont servies, et les changer demanderait désormais de déprécier avant de
retirer :

- le **nom des deux faits** — et il décide de la couverture (§6c) ;
- le **nom des deux tables** et de leurs colonnes ;
- les **valeurs ajoutées** à l'enum `aspect` ;
- la forme de `VariantView.allergenSheet` et de `VariantNutritionView` — c'est
  pour la tenir dans cette fenêtre que `mayContain` a changé de côté **avant** le
  merge, et pas au chantier suivant ;
- le champ **`nutrition`** d'un article de révision. Il change toutes les
  empreintes, et la fenêtre où ça ne coûtait rien était celle où il n'existait
  **aucune** révision. Elle s'est refermée avec ce merge : la prochaine ancre
  posée fige les empreintes de la nouvelle forme.

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

## 8. Ce qu'on ne fait PAS — et ce que le chantier a fini par faire

| ❌                                                | Pourquoi                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| ~~Ajouter un champ `nutrition` à la révision~~    | 🔴 **Fait.** L'interdit reposait sur un coût supposé ; la prod portait zéro révision (§6c) |
| Renommer la valeur `regulatory`                   | Valeur servie, déjà dans des faits posés — **tient toujours**                              |
| Ramener l'écriture de la fiche dans `save()`      | Étendrait le _lost update_ à douze gestes                                                  |
| Nommer les faits `variant.*`                      | Les rendrait invisibles des deux gardes                                                    |
| Toucher l'invariant 7 autrement que pour l'écrire | C'est une garde de sécurité ; la déplacer se décide seule                                  |

🔴 **La première ligne est la leçon du tableau.** Un « on ne fait pas » qui
repose sur un coût **supposé** n'est pas une règle, c'est une mesure qu'on n'a
pas faite. Celui-ci a survécu à cinq versions du plan ; il est tombé en une
requête. Les quatre autres tiennent parce qu'ils reposent sur une propriété du
code — un contrat servi, un préfixe qui filtre, douze appelants, une garde de
sécurité — et pas sur une estimation.

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

### Et ce que la v5 — celle-ci — a affirmé de faux pendant qu'on la bâtissait

Le tableau ci-dessus s'arrêtait aux versions mortes. Celle qui a été bâtie s'est
trompée **huit fois de plus**, et les huit ont été trouvées par des agents qui
ouvraient le code au lieu de le croire :

| Affirmation de la v5                             | Ce qui l'a démentie                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| La fiche est lue à **un seul** endroit (§6c bis) | Deux — l'écran de composition aussi. Deux e2e l'ont dit                                        |
| Chaque commande appelle `declareRegulatorySheet` | Impossible côté nutrition : forcerait `allergens: []`, c'est-à-dire le bug 0c                  |
| L'enum `aspect` vit à **trois** endroits         | Cinq — deux dictionnaires du journal en plus                                                   |
| L'écran laisse croire que la nutrition bloque    | Non : `completeness.ts` n'a jamais exigé qu'elle. D2 ne demandait qu'un **mot**                |
| « Le booléen gagne en jetant la liste » (§5)     | Vrai du transport, pas du geste : la divergence naissait à l'hydratation                       |
| `mayContain` « change de côté » à l'écran        | Il n'était **nulle part** : aucun écran ne le saisissait                                       |
| L'ancienne route reste à retirer au lot 7        | Elle était déjà partie au lot 3                                                                |
| L'inventaire des lecteurs de `mayContain`        | Faux sur quatre fichiers, et il en **oubliait trois**, dont un e2e qui déclare son propre type |

⚠️ **Deux de ces huit se seraient vues à l'exécution seulement.** L'e2e qui
déclare sa propre interface aurait cassé au runtime sans un mot du typecheck ;
et une spec du back-office redéclarait `VariantView` champ pour champ — rattrapée
par la seule racine, ni par `tsc -p tsconfig.app.json` (qui ne voit pas les
specs), ni par les portes de chaque périmètre.

➡️ **La leçon n'est pas « mesurer ».** La v5 mesurait. C'est le POINT DE DÉPART
de la mesure qui décide de ce qu'elle peut trouver : compter les appelants d'une
fonction qu'on vient de lire ne trouve que ce qu'on connaît déjà. Pour compter
les lecteurs de quelque chose, on part de la **ressource** — le nom de la table,
de la colonne, de la relation — jamais du mapper qu'on a sous les yeux.

### Ce que la PROMOTION a appris (2026-09-22, après le merge)

Quatre choses que ni la conception ni la construction ne pouvaient dire, parce
qu'elles ne se voient qu'en poussant.

**1. Une migration présente dans le dépôt part toute seule.**
`deploy_lfd_api.yml:340` lance `prisma migrate deploy` à chaque push sur `main`.
Un `DROP TABLE` écrit « pour plus tard » se serait exécuté sans que personne le
décide. C'est la raison pour laquelle le §7 porte du SQL et pas un dossier de
migration — et la raison est **mécanique**, pas prudentielle.

**2. La fenêtre entre les deux déploiements existe, et elle se mesure.**
Un seul merge déclenche les deux workflows en parallèle, mais ils ne durent pas
pareil. Mesuré : API **11 min 39**, back-office **12 min 49**. Pendant
**70 secondes**, l'API neuve servait un front ancien qui appelait les anciennes
routes. Un merge unique ne supprime pas la fenêtre — il la réduit à l'écart des
deux durées.

➡️ Le corollaire tient pour tout chantier qui touche les deux côtés : on ne
promet pas « aucune fenêtre », on promet « la plus courte possible », et on dit
laquelle.

**3. Le `CHECK` de la migration ne pouvait pas échouer, et c'est structurel.**
Le backfill remplit `nutrition_follows_default` avec la valeur de
`regulatory_follows_default`, dont l'invariant est **déjà prouvé vrai en base**
par le `CHECK` de septembre. Une ligne qui satisfaisait l'ancien satisfait le
nouveau par construction. Les trois instructions étant dans une seule
transaction, une interruption n'aurait rien laissé à moitié écrit — le risque
n'était pas la donnée, mais l'opérationnel (Prisma marque la migration en échec
et bloque le déploiement suivant).

**4. `main` a reçu 32 commits, pas 3.** Le chantier dépendait des lots 1 et 2,
jamais fusionnés, et l'historique de `dev` enchâsse le reste avec eux — le
retrait de la chaîne Shopify, le tri de la liste des produits, des docs d'auth.
Promouvoir `dev` promeut **tout** `dev` : le périmètre d'un merge n'est pas le
périmètre du chantier, et ça se vérifie avant de pousser, pas après.

### Ce que les deux gardiens ont ajouté

| Gardien                 | Ce qu'il a apporté que je n'avais pas                                       |
| ----------------------- | --------------------------------------------------------------------------- |
| `lecteur-de-migrations` | **Deux** migrations non déployées, pas une — celle du lot 1 attendait aussi |
| `cerberus-le-portier`   | A **rejoué de force** hors cache les trois paquets que turbo donnait verts  |

⚠️ Le lecteur de migrations a lui-même affirmé une chose fausse — que
`nutrition_follows_default` « fait le travail des allergènes ». C'est l'inverse.
Sa conclusion ne reposait pas dessus, mais un contradicteur se relit comme le
reste : **il n'est pas une autorité, il est un second regard.**

### Ce qui reste ouvert

| Sujet                                                             | Pourquoi ce n'est pas tranché                                                                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Le **poids net** voyage par le tarif, s'affiche avec la nutrition | Le déplacer touche le prix — décision d'Hugo. L'écran, lui, est honnête : le champ se ferme quand il ne s'écrira pas          |
| La **création** n'accepte pas les valeurs nutritionnelles         | La grille est fermée à la création plutôt que menteuse. L'ouvrir est un chantier, pas un correctif                            |
| **D3** n'est nommée qu'au serveur                                 | Le refus de publier nomme le cas ; l'écran ne le dit pas encore                                                               |
| `"regulatory"` encore **acceptée en écriture**                    | Le front qui l'envoyait est retiré mais pas déployé ; refuser maintenant casserait la version en ligne                        |
| `product-form-store.ts` à **2113 lignes**                         | Plafond ≲300. La découpe évidente est la machinerie de brouillon par déclinaison, qui n'a rien à faire avec les appels réseau |
