# Durcir le calcul des prix

**Écrit le 2026-09-08, réécrit le 2026-09-09.** ✅ **Quatre chantiers sur cinq
sont bâtis.**

> Ce document répondait à une question posée telle quelle : **« que faudrait-il
> pour passer de 7,5 à 9 ? »** Il notait la chaîne qui fabrique un prix — du
> tarif du référentiel jusqu'au montant écrit sur la ligne de commande.
>
> Il est réécrit au **présent** : quatre de ses cinq chantiers sont faits, et un
> chantier décrit comme à faire alors qu'il est fait envoie quelqu'un le refaire.
> La note par axe garde ses deux colonnes — la photo qui a motivé le travail, et
> l'état vérifié contre le code. Le §7 dit les deux fois où ce document s'est
> trompé.
>
> Le travail restant vit dans [`ce-qui-reste-a-faire.md`](ce-qui-reste-a-faire.md).

---

## 1. La note, par axe — et ce qu'elle est devenue

Revérifiée contre le code le **2026-09-09**. La colonne de gauche est la photo du
2026-09-08 ; celle de droite est ce qui est vrai.

| Axe                  | 09-08 | 09-09 | Ce qui a bougé                                                                                                                                      |
| -------------------- | ----- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **La résolution**    | 9     | **9** | Inchangée sur le fond. Elle a gagné un objet nommé — `LoadedPricer` — et 22 cas sans un seul doublé, vérifiés par mutation.                         |
| **Les garde-fous**   | 8     | **9** | `lint:prisma-model-ownership` ferme le trou que ce document nommait au chantier 3 : un bloc qui lit la table d'un autre est désormais **visible**.  |
| **Les unités**       | 9     | **9** | Inchangée. Le cran restant est le type nominal, qui est un chantier de compilateur.                                                                 |
| **L'assemblage**     | 5     | **9** | 🔴 Cinq appelants de `resolvePrice` → **un**. `lint:price-pipeline` est passée de cinq entrées à une.                                               |
| **Le temps**         | 5     | **8** | `lint:business-day` sur les fenêtres tarifaires. Pas 9 : dix-neuf sites hors tarification convertissent encore un jour en minuit UTC (R9).          |
| **La documentation** | 8     | **8** | Tenue dans le même commit que le code, et un **registre unique** remplace quatre listes concurrentes. Mais elle s'est encore trompée deux fois ici. |
| **Les écrans**       | —     | **5** | 🔴 Axe qui manquait à cette table. La simulation du back-office résout un prix **dans le navigateur** — la cinquième occurrence du motif (R2).      |

**7,5 hier, 8 aujourd'hui**, et la moyenne ment toujours un peu : l'axe qui tire
vers le bas n'est plus l'assemblage mais l'écran qui recalcule, c'est-à-dire le
même défaut de famille déplacé d'un cran.

## 2. Ce que « 9 » voulait dire — deux propriétés sur trois acquises

1. ✅ **Aucun écran ne peut annoncer un prix que la caisse ne facturerait pas.**
   Pas « ne le fait plus » : `LoadedPricer` est le seul appelant de
   `resolvePrice`, une porte CI le tient, et un e2e exige l'accord.
   ⚠️ Vrai du **serveur**. La simulation du back-office, elle, calcule à part.
2. ✅ **Une fenêtre tarifaire s'ouvre à l'heure qu'un commercial a en tête.**
3. ✅ **Ce qui était tenu par de la discipline l'est par autre chose** — là où la
   conversion était possible. `prisma-model-ownership` était la dernière.

---

## 3. Les cinq chantiers — quatre bâtis

Ce qui suit était écrit au futur. C'est réécrit au **présent**, parce qu'un
chantier décrit comme à faire alors qu'il est fait envoie quelqu'un le refaire.

### ✅ Chantier 1 — l'assemblage · **2026-09-09**

Cinq fichiers appelaient `resolvePrice`, chacun construisant son contexte,
cherchant son plancher, décidant sa porte dynamique et assemblant ses étages.
Deux s'étaient trompés sans que rien ne rougisse — un prix auquel il manque un
étage reste plausible.

Les six gestes vivent dans **`LoadedPricer`**, seul appelant de `resolvePrice`
du dépôt ; `lint:price-pipeline` est passée de cinq entrées à **une**. Les
variantes de la question sont ses **méthodes**, chacune portant ce qu'elle
écarte : la projection n'ouvre pas la porte d'un plancher dynamique, le
comparatif n'applique ni barème ni plancher.

**La preuve que rien n'a bougé** : les huit cas de `price-line.spec` passent sans
qu'une assertion change. La recette a changé de maison, aucune décision n'a bougé.

### ✅ Chantier 2 — le temps de Paris · **2026-09-08**

Les fenêtres se construisaient à minuit **UTC** : « à partir du 15 septembre »
ouvrait à 02 h 00 heure de Paris l'été. Sans effet sur une borne basse ouverte,
nuisible sur une borne haute — une mercuriale « jusqu'au 31 décembre » cessait
d'agir le 31 à 01 h 00.

`businessDayStart` les construit, et `lint:business-day` échoue sur toute
conversion de jour en minuit UTC dans les quatre dossiers de tarification. Deux
dérogations déclarées, toutes deux des étiquettes de date dont l'instant ne sort
pas.

⚠️ **Dix-neuf sites hors tarification** convertissent encore. Ils sont
inventoriés et triés — aucun défaut avéré, deux questions ouvertes — et suivis
en **R9**.

### ✅ Chantier 3 — ce qui n'était tenu que par de la discipline · **2026-09-09**

`lint:cross-schema-join` lit le SQL écrit à la main ; `lint:context-boundaries`
lit le graphe d'imports. Ni l'un ni l'autre ne voyait une classe interrogeant en
Prisma direct les tables d'un bloc qui n'est pas le sien, et `CLAUDE.md` écrit
que c'est arrivé **deux fois**.

`lint:prisma-model-ownership` le voit. 🔴 **Et la propriété est dérivée, jamais
écrite à la main** : le propriétaire d'un modèle est le bloc qui l'**écrit**.
Rien à maintenir — c'est le chemin inverse de celui qu'a dû faire
`lint:cross-schema-join`, qui recopiait la liste des schémas jusqu'à ce qu'elle
devienne fausse.

Sur 93 modèles, deux anomalies : `platform` lisait `prisma.user` — corrigé par un
port —, et `b2b` lit `staffUser` en direct, déclaré et daté.

**Ce que ça ne ferme pas**, et qui était déjà écrit ici : la frontière reste une
discipline de découpe. Une jointure `b2b → pim` marcherait toujours. La porte la
rend **visible**, pas impossible.

### 🟡 Chantier 4 — les écrans qui recalculent · **à moitié**

Ce qui est fait : l'écart au tarif est descendu dans `@lfd/money` (`gapBp`,
`discountBp`, `averageGapBp`), et les deux côtés l'importent.

Ce qui ne l'est pas — et c'est le critère de clôture que ce document s'était
lui-même donné, _« aucun `Math.round` sur un prix dans un composant Angular »_ :
`commercial/tarification/simulation/` résout un prix unitaire dans le navigateur
et réimplémente les trois régimes d'engagement, **sans jamais appeler le
serveur**. Suivi en **R2**.

### ✅ Chantier 5 — la charge · **2026-09-08**

Il n'y avait **aucune mesure**. Il y a `pricing-budget.e2e-spec.ts`, qui compte
les **opérations ORM** et non les millisecondes — un chronomètre en CI mesure la
machine autant que le code, et une suite qui rougit sans raison finit désactivée.

Ce qu'il tient : dix lignes coûtent **exactement** ce qu'une ligne coûte, et
l'écran de tarification ne lit pas la base une fois par article. L'égalité est
stricte, ce qui n'est possible que parce que la mesure est un compte et non une
durée.

---

## 4. Ce qui périme — les affirmations datées

**Le fait.** Le 2026-09-08, un JSDoc affirmait qu'une mercuriale « peut être
posée en `alter` », et s'en servait pour **justifier** le passage du benchmark
par `resolvePrice`. C'était faux depuis le premier commit qui a permis d'écrire
une règle. Une justification fausse ne vieillit pas comme une phrase fausse :
elle fait **garder un mécanisme pour une raison qui n'existe pas**, et défendre
l'inverse le jour où quelqu'un propose de le simplifier.

**✅ Fait le 2026-09-08.** La convention est écrite au §8 de `CLAUDE.md`, dans
la section qui fait autorité sur le JSDoc : _une justification qui parle
d'ailleurs porte sa date_. Elle est réservée aux affirmations **porteuses** —
celles qui justifient de garder, d'écarter ou de dupliquer quelque chose. Dater
une description rendrait le signal illisible, ce qui est la façon habituelle de
tuer une convention.

Appliquée aux six affirmations de la chaîne des prix qui décident d'un
mécanisme : « `ladderAsRule` n'est appelé par aucun lecteur » (deux fois, aux
deux endroits qu'elle justifie), « trois appelants font varier la quantité »,
« les trois refus étaient écrits deux fois », « `paris-time` sert déjà les
créneaux », et le tableau des cinq écarts divergents.

**Ce qui n'est pas fait, et ne le sera pas par une porte.** Aucun garde-fou
mécanique ne peut vérifier qu'une phrase est vraie. Ce que la date change est
plus modeste et suffit : elle dit **jusqu'où on a regardé**, et donne au lecteur
suivant le droit de ne pas croire.

`auditeur-de-justifications` reste l'outil qui les rouvre, et il ne tourne qu'à
la demande.

## 5. Ce que je ne ferais pas

- **Fusionner l'écran de tarification et la caisse.** Ils répondent à deux
  questions — « qu'a-t-on décidé » et « que facture-t-on ». Les fondre supprimerait
  la divergence en supprimant un écran utile.
- **Remplacer les contraintes d'exclusion par des vérifications applicatives**
  parce qu'elles rendent des messages illisibles. Le pré-contrôle qui **nomme**
  ce qu'il faut clore existe déjà à côté d'elles ; c'est le bon couple.
- **Rendre `resolvePrice` asynchrone** pour qu'elle lise elle-même ses
  matériaux. Elle cesserait d'être éprouvable sans base, et c'est la seule pièce
  de la chaîne dont la valeur ne dépend pas du transport.
- **Découper les prix en microservice.** Le problème n'est pas la distance entre
  les modules, c'est le nombre d'endroits qui assemblent.

## 6. L'ordre — parcouru, et ce qui reste

L'ordre proposé était : chantier 1, puis 2, puis 5, puis 3 et 4. Il a été suivi,
et il tenait — le 1 pesait bien deux points à lui seul, et le 5 a mesuré avant
que la charge ne décide à notre place.

**Ce qui reste est le 4**, à moitié, et c'est le seul qui touche un front. Il
demande une conception : soit la simulation passe par la projection du serveur —
mais elle est interactive, et un aller-retour par curseur déplacé serait une
régression d'usage —, soit son moteur descend dans un paquet pur que les deux
côtés importent. C'est ce qui a déjà marché deux fois.

Il touche l'argent : `vitruve` avant de bâtir.

---

## 7. Ce que ce document s'est trompé à dire

Deux fois, et les deux méritent d'être écrites parce qu'elles sont du même genre.

- Il annonçait le **chantier 4 fermé** alors que son propre critère de clôture ne
  l'était pas. Décrire un travail comme fait est la faute symétrique de décrire
  comme absent ce qui existe, et elle coûte plus cher : personne ne va vérifier.
- Sa **note par axe** est restée affichée comme actuelle pendant que quatre
  chantiers la périmaient. Elle est désormais donnée en deux colonnes — la photo
  et l'état —, ce qui la rend relisable sans être crue.
