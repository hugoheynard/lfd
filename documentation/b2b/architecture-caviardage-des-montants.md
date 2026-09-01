# Caviardage des montants — design

> **Qui a le droit de voir combien.** Le back-office montre du chiffre
> d'affaires, des encours et des marges à tout le staff qui entre ; tout le
> staff n'a pas à les lire.
>
> La décision qui structure tout : **le mode de masquage suit la NATURE de la
> surface, pas le goût de celui qui pose le décorateur.** Une statistique se met
> à l'échelle, un montant opérationnel se caviarde — et l'un ne remplace jamais
> l'autre.
>
> Décidé le **2026-09-01**. Prérequis lu :
> [`architecture-acces-staff.md`](architecture-acces-staff.md) (rôles,
> dérogations, résolution d'accès).
>
> **Statut : 📐 doc-first. Rien n'est codé.**

---

## 0. Le problème

`growth:read` ouvre le cockpit commercial, et le cockpit montre tout ce qu'il
contient : chiffre d'affaires par compte, encours, momentum, classements. Il n'y
a aujourd'hui **aucun cran** entre « voit le pipeline » et « voit les montants
du pipeline ». Un stagiaire commercial, un prestataire, un poste partagé au
fournil : les trois lisent les mêmes euros.

## 1. Deux modes, et leur emploi est une règle

| La surface montre…                                                                     | Mode       | Pourquoi celui-là et pas l'autre                                                                                |
| -------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| une **statistique** — agrégat, courbe, classement, part                                | `scaled`   | la **forme** est l'information. Caviarder un graphique ne le masque pas, il le supprime.                        |
| un **montant opérationnel** — total d'une commande, d'une facture, encours d'un client | `redacted` | on **agit** dessus. Un chiffre plausible et faux se cite au client, et rien à l'écran ne dit lequel on regarde. |

Ce tableau n'est pas une suggestion de mise en page : c'est ce qui empêche le
mode dangereux d'arriver là où il fait mal. Un montant mis à l'échelle sur une
fiche client est un **mensonge plausible** — le commercial lit « 1 234 € », le
vrai chiffre est 4 113 €, il le répète au téléphone. Sur un graphique, personne
ne devise à partir d'une barre.

## 2. Ce qu'un facteur d'échelle préserve — et ce qu'il détruit

C'est le cœur du sujet, parce que trois choses très différentes s'appellent
« mettre à l'échelle ».

**Un facteur UNIQUE et STABLE, appliqué à tout l'écran.** Tous les rapports sont
exacts, tous les classements sont exacts, toutes les tendances sont exactes.
C'est un graphique **vrai** avec un axe faux : la seule information perdue est le
niveau absolu, et c'est précisément celle qu'on voulait cacher. ✅

**Un facteur tiré PAR VALEUR** (l'aléa `0,xx < 0,5` de la proposition initiale).
Deux montants égaux deviennent inégaux, un classement s'inverse, une courbe plate
se met à osciller. Ce n'est plus un masque, c'est une **falsification de la
forme** — c'est-à-dire de la seule chose qu'un écran de statistiques sert à lire.
❌ **Refusé.**

**Un facteur qui change entre deux sessions.** Le même tableau de bord annonce
deux chiffres lundi et mardi, et quelqu'un ouvre un ticket sur une régression qui
n'existe pas. Le facteur est **configuré**, pas tiré à chaque fois. ❌

> Le facteur est un **secret de déploiement**, au même titre qu'une clé. Publié,
> il rend le masque décoratif : une division suffit.

## 3. Ce qui ne se met jamais à l'échelle

Le masque porte sur **l'argent, et rien d'autre**.

|                                                | Pourquoi                                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Pourcentages et taux**                       | 12 % mis à l'échelle donne 3,6 % — un fait **faux**, indiscernable d'un vrai 3,6 %. Un taux de conversion n'a pas de niveau à cacher.   |
| **Comptes** (commandes, leads, comptes actifs) | « 17 commandes » qui devient « 5 » ne cache pas un montant : ça invente une activité. Caviardés, à la rigueur ; jamais mis à l'échelle. |
| **Dates, délais, durées**                      | rien à cacher, et tout à casser.                                                                                                        |

## 4. Reconnaître un montant — la convention devient portante

Un intercepteur de route ne voit qu'une charge utile imbriquée. Pour masquer, il
faut savoir **quels champs sont de l'argent**.

Le dépôt a déjà la réponse : **l'argent est en centimes, entiers**, et les champs
le disent (`totalCents`, `unitPriceCents`, `paidCents`). Le masque s'appuie donc
sur le suffixe — mais une convention qui n'est qu'espérée laisse un trou dès le
premier `total` en euros, et un masque troué est pire qu'aucun masque : il
rassure.

**D'où le gate** : échouer si un contrat expose un montant dont le nom ne finit
pas par `Cents`. La convention cesse d'être une habitude et devient la condition
de fonctionnement du masque.

⚠️ La liste des exceptions (un champ en `Cents` qu'il ne faut PAS masquer, s'il
en existe) est **explicite et courte**, jamais un `if` dans l'intercepteur.

## 5. Le mur

Une ressource **`amounts`**, en lecture, dans le catalogue de
[`staff-access.ts`](../../packages/contracts/src/staff-access.ts).

- elle se dérogé par personne avec le mécanisme existant — « Marc voit les
  montants bien que son rôle ne les voie pas » — sans inventer un second modèle ;
- elle se coche dans l'éditeur de rôles, comme les autres ;
- `superadmin` l'a par construction, comme tout le reste.

⚠️ **Entorse assumée** à la règle « on ne nomme pas une ressource sans routes » :
`amounts` n'est pas une surface, c'est une **capacité** qui traverse les
surfaces. L'alternative — un booléen sur le rôle — créerait un second axe
d'autorisation à côté de celui qui existe, et les dérogations n'y auraient pas
accès.

## 6. L'écran doit le dire, en permanence

Un tableau de bord masqué et non marqué finit en capture d'écran dans un comité.
Toute page où le masque est actif porte un **bandeau persistant** — « montants à
l'échelle » ou « montants masqués » — et les axes de graphique perdent leur
unité. Ce n'est pas de la courtoisie : c'est ce qui distingue un masque d'une
erreur de données.

## 7. Le décorateur

```ts
@PrivateFinancialData("scaled")    // sur une route de statistiques
@PrivateFinancialData("redacted")  // sur une route opérationnelle
```

Un **intercepteur** lit le décorateur, résout `amounts:read` sur le `Principal`
déjà en place, et transforme la réponse. Il ne descend **pas** dans le domaine :
les agrégats calculent sur les vrais chiffres, et le masque est la dernière chose
qui arrive avant la sérialisation. Un domaine qui connaîtrait le masque serait un
domaine qu'on ne peut plus tester sans lui.

Sans décorateur, aucun masque : c'est **opt-in**. Le contraire — masquer par
défaut — donnerait un back-office où la moitié des chiffres manquent sans qu'on
sache pourquoi, et la première réaction serait de désarmer le mécanisme.

## 8. Ce qui rendrait tout ça décoratif ⚠️

Le masque fuit dès que **le même montant sort non masqué par une autre porte**.
Trois sont ouvertes aujourd'hui :

- l'**export CSV** de facturation (`fiche-client/facturation/billing-csv.ts`) ;
- les **e-mails** qui portent des montants ;
- tout **PDF** de facture, le jour où la facturation existera.

Deux sorties possibles, à trancher **avant** de coder : soit ces portes entrent
dans le périmètre (l'export refuse à qui n'a pas `amounts:read`), soit on assume
que le masque protège l'écran et pas la donnée — et on l'écrit, parce qu'un
masque dont on croit à tort qu'il protège est plus dangereux que pas de masque.

**Recommandation : la première.** Un export est le geste le plus courant pour
sortir un chiffre d'un back-office.

## 9. Découpage

| #     | Tranche                 | Contenu                                                                                        | Preuve attendue                                                               |
| ----- | ----------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **1** | **La ressource**        | `amounts` au catalogue, cochable dans l'éditeur de rôles, dérogeable par personne.             | Un rôle sans `amounts:read` existe et s'attribue.                             |
| **2** | **Le gate de nommage**  | Échoue si un contrat expose un montant hors convention `*Cents`. Liste d'exceptions explicite. | Un champ `total` ajouté à un contrat fait rougir la CI.                       |
| **3** | **Le caviardage**       | Décorateur + intercepteur, mode `redacted` seul.                                               | Aucun chiffre ne sort d'une route décorée pour qui n'a pas le droit.          |
| **4** | **La mise à l'échelle** | Mode `scaled`, facteur secret de déploiement, appliqué aux montants seuls.                     | Les rapports entre deux montants d'une même réponse sont conservés à l'exact. |
| **5** | **Le bandeau**          | Marquage permanent des écrans masqués, axes sans unité.                                        | Une capture d'écran d'un tableau de bord masqué le dit d'elle-même.           |
| **6** | **Les autres portes**   | Export CSV et e-mails, cf. §8.                                                                 | L'export refuse à qui n'a pas `amounts:read`.                                 |

La tranche **3 livre seule** : caviarder est utile sans mise à l'échelle. La
tranche **4 ne se livre pas sans la 5** — des montants à l'échelle sans
marquage, ce sont des chiffres faux en circulation.
