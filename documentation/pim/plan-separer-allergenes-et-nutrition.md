# Plan — séparer les allergènes de la nutrition (v4)

> **État : 📐 conception. Rien n'est bâti**, sauf les quatre correctifs du §2.
>
> **Ouvert le 2026-09-22**, réécrit **trois fois** le même jour après `vitruve` :
> 3 BLOQUANT sur la v1, 4 sur la v2, 5 sur la v3. Le §10 dit ce que chacune
> affirmait de faux.
>
> 🔴 **Donnée RÉGLEMENTAIRE** — une erreur s'imprime sur une étiquette.
>
> ⚠️ **Hugo, 2026-09-22 : « c'est en service mais pas actif, donc on est un peu
> libre. »** Ça retire la cérémonie de migration, **pas** les fautes de
> conception. Le §5 dit précisément ce que la latitude achète, et ce qu'elle
> n'achète pas.

---

## 1. Le problème, en une phrase

**Enregistrer la fiche enregistre les allergènes ET la nutrition ensemble.** La
requête remplace tout, donc celui qui écrit doit renvoyer ce qu'il ne modifie
pas — et s'il en oublie un bout, ce bout est effacé.

Trois couches traitent pourtant déjà les deux comme des sujets distincts (le
domaine, la validation, la publication) ; quatre les soudent (route, port, table,
écran).

---

## 2. Quatre correctifs livrés — et ils sont la preuve du plan

| #   | Ce qui se passait                                                               | Commit      |
| --- | ------------------------------------------------------------------------------- | ----------- |
| 0a  | Enregistrer la fiche **effaçait les traces** « peut contenir »                  | `c7d9034ad` |
| 0b  | S'aligner sur le défaut **détruisait le tarif propre** de la déclinaison        | `85eb56359` |
| 0c  | Enregistrer sans rien cocher **affirmait « aucun allergène »**                  | `35a8ad60e` |
| 0d  | L'outil agent **recopiait la fiche du défaut** sur n'importe quelle déclinaison | `35a8ad60e` |

🔴 **Aucun n'était prévu.** Tous sont sortis d'une lecture du code pendant la
conception, et **0c est le plus grave** : il fabriquait, depuis l'écran normal,
l'affirmation même que ce plan veut rendre impossible. Un produit devenait
publiable sans que personne ait déclaré.

⚠️ **0b et 0d sont la même faute, à deux endroits** : écrire une valeur
**résolue** dans une colonne **propre**. Le lot 2 doit s'en souvenir (§6).

---

## 3. Les six décisions (Hugo, 2026-09-22)

| #      | Question                                   | Réponse                                                      |
| ------ | ------------------------------------------ | ------------------------------------------------------------ |
| **D1** | Un drapeau d'alignement, ou deux ?         | **Deux** — un allergènes, un nutrition                       |
| **D2** | La publication n'exige que les allergènes  | **On l'écrit** — la nutrition est facultative                |
| **D3** | « Nutrition sans déclaration d'allergène » | **On le dit** — état nommé, non publiable                    |
| **D4** | Un fait de journal, ou deux ?              | **Deux**                                                     |
| **D5** | Séparer la table ?                         | **Oui** — a survécu à trois alternatives (§4)                |
| **D6** | Où vit « aucun allergène » ?               | **Avec les allergènes** — « pas de nutrition, si on sépare » |

### D2 attend toujours sa ligne

« La nutrition est facultative à la publication » **engage l'étiquette**. Le
règlement 1169/2011 prévoit des exemptions, et le dépôt vend majoritairement non
préemballé — mais tant que la phrase n'est pas écrite, c'est une préférence
technique déguisée en décision réglementaire.

🔴 **Le lot 5 ne s'écrit pas sans elle.** La v3 nommait l'ignorance puis
planifiait par-dessus ; c'est corrigé — D2 **bloque** son lot.

---

## 4. Pourquoi deux tables, et pas les trois autres options

| Option                                 | Rang | Ce qui cloche                                                        |
| -------------------------------------- | ---- | -------------------------------------------------------------------- |
| Règle d'agrégat seule                  | 3    | ne garde que ce qui passe par lui — or l'écriture le CONTOURNE       |
| Booléen `allergens_declared` + `CHECK` | 1    | **redondance** : la contrainte avoue que deux choses se contredisent |
| Colonne `allergens` **nullable**       | 1    | deux façons de dire « personne n'a parlé » : pas de ligne, ou `NULL` |
| **Deux tables**                        | 1    | coûteux                                                              |

🔴 **L'argument qui tranche** : un booléen encode « quelqu'un a-t-il parlé ? »
comme une **donnée**, posée à côté de la donnée dont elle parle. L'absence de
ligne l'encode comme une **structure**. Une donnée peut être fausse ; une
structure, non.

⚠️ **Le booléen nu était le piège**, et le front en porte la preuve :
`declaresNone` vit à côté de `selected`, rien ne les tient d'accord, et à
l'enregistrement **le booléen gagne en jetant la liste**.

⚠️ **Le repli, si le chantier s'arrête en route** : rendre `allergens` nullable.
Le schéma **contredit son domaine** (`NOT NULL` contre `string[] | null`) ;
80 % du résultat pour 10 % du prix.

### Le modèle cible

| Table               | Colonnes                                               | Absente quand        |
| ------------------- | ------------------------------------------------------ | -------------------- |
| `variant_allergens` | `allergens`, `mayContain` — la déclaration de sécurité | personne n'a déclaré |
| `nutrition_values`  | les **7** valeurs de l'annexe XV + l'indice glycémique | aucune valeur saisie |

⚠️ **Sept, pas huit** : l'indice glycémique est explicitement **hors** annexe XV
(le schéma le dit). Il suit les valeurs, faute de meilleur foyer — c'est un
renseignement produit, pas une mention obligatoire.

🔴 **`mayContain` change de côté.** C'est une déclaration d'allergène, soumise au
même référentiel et à la même garde de chevauchement. Le laisser sous `nutrition`
avec **deux drapeaux** le ferait résoudre par le mauvais.

🔴 **Et « pas de ligne » dans `nutrition_values` veut dire la même chose que dans
l'autre** : personne n'a rien saisi. La v3 ne le tranchait pas, et sa condition
de relecture s'en trouvait incohérente (§5).

---

## 5. Ce que « en service mais pas actif » achète — et ce qu'il n'achète pas

| ✅ Tombe                                       | 🔴 Reste entier                   |
| ---------------------------------------------- | --------------------------------- |
| La double écriture                             | Le nommage des faits (§7)         |
| Le retour arrière « gratuit » du déploiement 2 | L'extension du _lost update_ (§6) |
| Les trois déploiements                         | Les contrats servis au front (§8) |
| La relecture conditionnelle par comptage       | D2, qui engage l'étiquette        |

### 🔴 Et la reprise change de nature

La v3 disait : « `allergens: []` se recopie tel quel — c'est une affirmation ».
**C'est faux sur l'existant**, et 0c explique pourquoi : jusqu'à aujourd'hui,
enregistrer la section sans rien cocher **fabriquait** un `[]`. La base contient
donc des tableaux vides **indistinguables** — les uns déclarés, les autres
sous-produits.

**Aucune règle de tri ne peut les départager.** Ni la date (le bug a vécu tout du
long), ni le journal (le diff enregistre le `[]`, pas l'intention).

➡️ **La latitude résout ça, et c'est son seul vrai gain** : puisque rien n'est
servi pour de vrai, on **ne recopie pas les `[]` ambigus**. Ils deviennent « non
déclaré », et la fiche redemande une déclaration.

| Ce qu'on trouve                    | Ce qu'on recopie                     |
| ---------------------------------- | ------------------------------------ |
| `allergens` non vide               | tel quel — une déclaration explicite |
| `mayContain` non vide              | tel quel                             |
| `allergens = []` **seul**          | 🔴 **rien** — ligne non créée        |
| Au moins une valeur nutritionnelle | une ligne dans `nutrition_values`    |

⚠️ **Ce choix rend des produits non publiables** tant que personne n'a
re-déclaré. C'est voulu : un produit publiable sur une affirmation que personne
n'a faite est pire qu'un produit à re-déclarer.

🔵 **À mesurer avant d'écrire la migration** — c'est la seule porte du lot 1 :

```sql
SELECT count(*) FILTER (WHERE jsonb_array_length(allergens) > 0)   AS declares,
       count(*) FILTER (WHERE allergens = '[]'::jsonb)             AS vides_ambigus,
       count(*) FILTER (WHERE jsonb_array_length(may_contain) > 0) AS avec_traces,
       count(*)                                                     AS total
FROM pim.nutrition_declaration;
```

Si `vides_ambigus` est grand, la re-déclaration n'est plus un détail — c'est un
chantier de saisie, et il se décide avant, pas après.

---

## 6. 🔴 L'écriture revient dans l'agrégat — mais PAS dans `save()`

La v3 disait « l'écriture revient dans l'agrégat ». `vitruve` a montré ce que ça
coûterait : `save()` a **douze appelants** (publier, archiver, renommer, régler
un taux…). Aujourd'hui il ne touche **pas** la fiche réglementaire — publier un
produit ne peut donc pas écraser une déclaration.

**Lui confier la fiche étendrait le _lost update_ à douze gestes**, sur de la
donnée d'étiquette. Une déclaration enregistrée pendant qu'un collègue renomme
une déclinaison serait perdue en silence.

➡️ **La correction** : l'agrégat porte la **règle**, un port dédié porte
l'**écriture**.

```
product.declareAllergens(variantId, …)   ← l'agrégat REFUSE ce qui doit l'être
   puis
allergens.save(variantId, declaration)   ← un port qui n'écrit QUE cette table
```

L'agrégat reste le seul à voir la déclinaison **et** son défaut, donc le seul à
pouvoir dire « couverte ». Mais il n'emporte pas la fiche dans chaque
enregistrement de produit.

⚠️ **Et quand l'écriture passera par l'agrégat, ce sera depuis
`persistenceSnapshot()`** — jamais `snapshot()`, qui résout. C'est la faute 0b/0d,
et elle se rejouerait à l'identique sur le réglementaire.

⚠️ **L'atomicité est déjà tenue** : `transactional-prisma.ts` route `$transaction`
vers l'unité de travail ambiante. La v3 posait une question que le code avait
résolue.

---

## 7. 🔴 Le nommage des faits décide de la couverture des gardes

La v3 rangeait le nom des deux faits en simple « irréversible ». Il décide en
réalité si les gardes les voient :

- `attribution.ts` filtre `type.startsWith("product.")` ;
- le test de `content-facts` **interdit** d'y inscrire un fait qui ne commence pas
  par `product.`.

Or le nommage **naturel** serait `variant.*` — le sujet est la déclinaison, comme
`variant.added`, `variant.renamed`, `variant.aligned`.

🔴 **Un fait nommé `variant.allergens_saved` serait invisible des deux gardes** :
sauver les allergènes cesserait de périmer la signature « publiable », et le
champ `allergens` d'une révision perdrait son auteur.

➡️ **Décision : `product.allergens_saved` et `product.nutrition_saved`.** Le
préfixe ment un peu sur le sujet ; il dit la vérité sur la **couverture**, et
c'est elle qui protège.

| Ce qu'il faut faire                                     | Pourquoi                                                |
| ------------------------------------------------------- | ------------------------------------------------------- |
| L'ancien fait passe en `retired(...)`                   | ses lignes doivent rester lisibles                      |
| …**et reste à `true`** dans `CONTENT_FACTS`             | sinon les faits passés cessent de périmer une signature |
| …**et garde** son `["allergens"]` dans `attribution.ts` | sinon chaque changement passé perd son auteur           |
| Le fait allergènes **hérite** `["allergens"]`           | la v3 ne parlait que de la nutrition                    |
| Le fait nutrition s'attribue à `[]`                     | 🔵 voir ci-dessous                                      |

### La nutrition n'a nulle part où s'attribuer

`revision.ts` ne porte **que** `allergens`. Lui ajouter un champ changerait
**toutes les empreintes** — c'est un SHA-256 de l'article entier — et le catalogue
apparaîtrait modifié de bout en bout sans qu'une fiche ait bougé.

➡️ **`[]` d'abord**, et le champ de révision dans un chantier séparé. ⚠️ Prix à
dire : l'écran de révision affichera « auteur non défini » sur un tableau
nutritionnel qui vient de changer, alors que le fait existe, daté et signé, à
deux tables de là. **Sur une donnée réglementaire.**

⚠️ **Deux phrases françaises obligatoires** : `phrase-registry.ts` est un
`Record<JournalFactType, Phrase>` **complet** — c'est le seul vrai refus de
compiler, et la v3 ne le nommait pas.

---

## 8. Les contrats servis

| Quoi                                         | Ce qu'il faut                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `VariantNutritionView` perd `mayContain`     | **déprécier, puis retirer** — deux déploiements                              |
| L'enum `aspect` — **trois** endroits, pas un | `contracts` (le fait), `pim-contracts` (la requête `PUT …/align`), l'agrégat |

🔴 **L'enum de requête est servie au back-office en ligne.** Y ajouter
`"allergens"` et `"nutrition"` donne une API à **quatre** aspects dont deux
écrivent la même colonne. La v3 promettait « l'ancienne passe en lecture seule »
sans dire **qui refuse, ni quand**.

➡️ La valeur `"regulatory"` reste **acceptée en écriture** jusqu'au retrait du
front qui l'envoie, et le drapeau nutrition naît à la **même valeur** que celui
qu'il dédouble — sinon chaque déclinaison alignée perd le tableau du défaut.

---

## 9. Les lots

| Lot   | Contenu                                                                    | Bloque par   |
| ----- | -------------------------------------------------------------------------- | ------------ |
| ~~0~~ | ✅ Les quatre correctifs (§2)                                              | —            |
| 1     | Les deux tables + **la migration sélective** (§5) + sa relecture           | mesure §5    |
| 2     | La règle dans l'agrégat, l'écriture dans un port dédié (§6)                | 1            |
| 3     | Les deux routes, les deux faits `product.*`, l'ancien en `retired` (§7)    | 2            |
| 4     | Les deux drapeaux — colonne, `CHECK`, valeur d'enum **ajoutée** (§8)       | 2            |
| 5     | Les lectures basculent ; l'invariant 7 s'écrit                             | 3, 4, **D2** |
| 6     | L'écran : deux sections, deux enregistrements, **et les traces**           | 5            |
| 7     | L'ancienne table et l'ancienne route partent ; `mayContain` sort de la vue | 6            |

### Irréversible au premier merge dans `main`

- le **nom des deux faits** (et il décide de la couverture, §7) ;
- le **nom des deux tables** et de leurs colonnes ;
- les **valeurs ajoutées** à l'enum `aspect` ;
- la forme de `VariantNutritionView`.

---

## 10. Ce que les versions précédentes affirmaient de faux

| V   | Affirmation                              | Ce que `vitruve` a montré                                          |
| --- | ---------------------------------------- | ------------------------------------------------------------------ |
| v1  | « Deux routes, la même table » suffit    | Crée un produit publiable sans déclaration                         |
| v1  | « Le handler perd son contournement »    | `alreadyDeclared` sert aux codes archivés                          |
| v1  | « Le _lost update_ disparaît »           | Non : l'`upsert` reste nu                                          |
| v2  | `products.save()` n'existe peut-être pas | Il existe — et persistait l'instantané résolu (0b)                 |
| v2  | « écrites en parallèle »                 | **Aucune reprise** : le catalogue partait au canal sans allergènes |
| v2  | Le drapeau, en une demi-ligne            | Colonne + `CHECK` + **trois** enums servies                        |
| v3  | « `[]` se recopie tel quel »             | Les `[]` existants sont **indistinguables** (0c les fabriquait)    |
| v3  | « l'écriture revient dans `save()` »     | Étendrait le _lost update_ à **douze** gestes                      |
| v3  | Les gardes « refusent de compiler »      | Ce sont des **tests** — et le nom `variant.*` leur échappe         |
| v3  | « `save` ignore son ticket »             | Faux : le port l'exige, et l'atomicité est déjà tenue              |
| v3  | « les 8 valeurs de l'annexe XV »         | Sept — la 8ᵉ est hors annexe                                       |

⚠️ **Le motif se répète, trois fois** : la faute vient d'avoir décrit l'existant
**de mémoire**. Les quatre correctifs du §2, eux, sont sortis d'une lecture.
