# Audit de la fiche produit — flux, statuts, publication

**Date** : 2026-09-01 · **Portée** : `apps/lfc-B2B-admin-frontend/src/app/pim/catalogue/`
(fiche produit, liste, rail de publication) et `apps/lfd-api/src/pim/catalogue/`
(produit, révision) · **Nature** : audit de l'existant, à charge.

> Lecture : tout ce qui suit a été vérifié dans le code, référence à l'appui. Ce
> qui relève de mon jugement plutôt que d'un fait est marqué **[opinion]**.

> ## ✅ État des réparations — 2026-09-01
>
> Les **tranches 1 à 5** du §16 sont faites : celles qui ne dépendaient d'aucune
> décision. Les constats qu'elles corrigent sont conservés au passé dans le
> corps du document — un audit qu'on réécrit après coup perd la trace de ce qui
> a été vu, et c'est cette trace qui justifie les tests de non-régression.
>
> | §   | Défaut                                         | État                                                                                                                                         |
> | --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
> | 1   | « Restaurer » ne restaure rien, journal faussé | ✅ corrigé                                                                                                                                   |
> | 2   | Multi-déclinaisons impubliable                 | ⏳ ouvert — attend §15.4                                                                                                                     |
> | 3   | Dérivation allergènes non branchée             | ✅ corrigé                                                                                                                                   |
> | 4   | « Mettre en vente » ne met rien en vente       | ⏳ ouvert — attend §15.2                                                                                                                     |
> | 5   | Bouton non désarmé                             | ⏳ ouvert — attend §15.4                                                                                                                     |
> | 6   | Signature périmée par la publication           | ✅ corrigé                                                                                                                                   |
> | 7   | Signature jamais périmée en session            | ✅ corrigé                                                                                                                                   |
> | 8   | Publication n'exige pas la signature           | ⏳ ouvert — attend §15.1                                                                                                                     |
> | 9   | Statut brut, brouillon en vert                 | ✅ corrigé                                                                                                                                   |
> | 10  | Deux vocabulaires, deux boutons                | ⏳ ouvert — attend §15.2                                                                                                                     |
> | 11  | Complétude incomplète                          | ⏳ ouvert                                                                                                                                    |
> | 12  | Compteur de sections                           | ⏳ ouvert                                                                                                                                    |
> | 13  | Réutilisation du composant (latent)            | ⚠️ moitié corrigée — l'hydratation asymétrique des allergènes ne peut plus effacer une déclaration ; la lecture du `snapshot` de route reste |
>
> **Ce que la réparation a ajouté au constat**, et qui n'était pas dans l'audit :
>
> - `restore()` posait `draft` sans regarder d'où il venait : restaurer un
>   produit **en ligne** le rétrogradait en brouillon, sans un mot. Trouvé en
>   écrivant le refus.
> - `contentUpdatedAt` ratait aussi les **taux** et les **canaux** — ils vivent
>   dans des tables satellites absentes du `max`. Le §6 ne voyait que la moitié
>   fausse-positive du défaut ; il était faux dans les deux sens.
> - `pim-readiness.e2e-spec.ts` **réimplémentait** la règle de péremption qu'il
>   testait. Il ne pouvait donc constater ni l'un ni l'autre défaut : un test qui
>   recopie la règle ne teste que sa copie. Il lit désormais la réponse servie.
> - **La complétude ne peut pas voir une contradiction, et ne le pourra jamais.**
>   Elle compte « Allergènes déclarés » comme satisfait dès qu'une affirmation
>   existe — et « aucun allergène » en est une, fausse mais présente. La première
>   version de la tranche 5 affichait donc l'avertissement au-dessus d'un bouton
>   « Déclarer publiable » resté armé, sur une fiche à 10/10. La signature est
>   maintenant refusée sur une contradiction, **jamais la mise en vente** : faire
>   de la composition une condition de publication lui donnerait la « valeur de
>   contrôle » que son contrat lui refuse. Et seulement sur la contradiction —
>   « aucun allergène » est une affirmation universelle qu'un seul allergène cité
>   dément, alors que « contient du gluten » est partielle et qu'un lait cité la
>   complète sans la rendre fausse.

---

## 0. Le verdict en une page

La fiche produit porte **quatre notions d'état** qui se croisent sans jamais se
parler :

| La notion         | Où elle vit                                       | Qui la fait bouger                     |
| ----------------- | ------------------------------------------------- | -------------------------------------- |
| **Le statut**     | `Product.status` (`draft`/`published`/`archived`) | « Mettre en vente », « Archiver »      |
| **La complétude** | calculée à l'écran, jamais stockée                | la saisie                              |
| **La signature**  | table `product_readiness`                         | « Déclarer publiable »                 |
| **La diffusion**  | chez le canal (Shopify, plateforme B2B)           | un **push manuel**, sur un autre écran |

Aucune de ces quatre ne conditionne les autres. On peut **mettre en vente** une
fiche incomplète et non signée ; on peut **signer** une fiche qu'on ne mettra
jamais en vente ; on peut **pousser** un brouillon ; et « mettre en vente » ne
met, en soi, **rien** en vente.

Ce n'est pas un défaut d'implémentation, c'est un défaut de modèle : quatre
axes orthogonaux exposés comme s'ils étaient un cycle de vie. L'écran raconte
une histoire linéaire — complétude, puis signature, puis mise en vente, de haut
en bas dans le rail — que le système ne joue pas.

**Trois défauts bloquants**, dont un qui fait perdre de la donnée et un qui
inscrit un fait faux au journal. **Neuf sérieux.** Le détail suit.

---

## 1. 🔴 BLOQUANT — « Restaurer » ne restaure rien, et le journal atteste le contraire

Le chemin complet, chaque maillon vérifié :

1. `product-form-page.ts:240-242` — `restore()` appelle `changeStatus('draft')`.
2. `product-form-store.ts:1191-1200` — `callStatus` traduit `'draft'` en
   `this.api.unpublishProduct(id)`. Il n'y a **aucun** cas `restore`.
3. `catalogue-api.ts:92-112` — le client HTTP n'a pas de méthode `restoreProduct`.
4. `product.ts:266-270` — `Product.unpublish()` est gardé :
   `if (this.statusValue === "published")`. Sur un produit **archivé**, il ne
   fait **rien**.
5. `unpublish-product.ts:26-38` — le handler trace `product.unpublished`
   **inconditionnellement**, puis sauvegarde un agrégat inchangé.
6. `product-form-store.ts:1183` — au retour, le front peint `statusValue = 'draft'`.

Résultat, dans cet ordre : l'écran affiche « Brouillon », la base reste
`archived`, le journal d'activité enregistre un retrait de la vente qui n'a pas
eu lieu, et au rechargement la fiche est de nouveau archivée.

La route existe pourtant : `product.controller.ts:234` expose
`PUT :id/restore`, `restore-product.ts` trace `product.restored`, et
`Product.restore()` (`product.ts:278-280`) fait le bon geste. **Le backend est
correct ; personne ne l'appelle.**

**Ce qui rend le défaut bloquant plutôt que gênant** : la liste produits n'offre
aucune restauration (`products-page.html:146-152` — « Archiver » quand le statut
n'est pas `archived`, et rien pour l'inverse). La fiche est donc la **seule**
porte de sortie de l'archivage, et elle est murée. Sur un back-office en service
depuis le 2026-08-17, **archiver un produit est aujourd'hui irréversible depuis
l'interface**.

Aggravant : `blast: { variants: variants.length }` (`unpublish-product.ts:35`)
annonce au journal que N articles cessent d'être vendus, alors que rien n'a
changé — et compte au passage les déclinaisons `discontinued`.

---

## 2. 🔴 BLOQUANT — un produit à plusieurs déclinaisons est impubliable, définitivement

- `product.ts:256-261` — `publish()` refuse si **une seule** déclinaison vivante
  n'a pas de fiche réglementaire, et nomme les SKU manquants.
- `variant.ts:133` — « avoir une fiche » = `allergens !== null`, par déclinaison.
- `product-form-store.ts:1289-1290` — le formulaire choisit **une** déclinaison,
  la `isDefault` (ou la première), et n'en sort jamais.
- `saveFiche()` (`store:1090-1100`) et `saveVariantFacts()` (`store:1105-1112`)
  écrivent sur cette seule déclinaison.
- `variantCount` est **affiché** dans le sous-titre de l'en-tête
  (`store:486-491`) et n'est éditable nulle part.

Donc : dès qu'un produit a deux déclinaisons, la seconde n'a pas de fiche, la
publication est refusée avec un message qui nomme un SKU, et **aucun écran ne
permet de le corriger**. L'opérateur lit « fiche réglementaire manquante sur
`XXX-002` » sur une page qui ne connaît que `XXX-001`.

**[opinion]** C'est le genre de défaut qui ne se voit pas en démonstration
— les fiches de démonstration sont mono-déclinaison — et qui bloque le premier
vrai produit conditionné en deux formats.

---

## 3. 🔴 BLOQUANT — la dérivation des allergènes existe, est testée, et n'est branchée nulle part

C'est le symptôme constaté : un ingrédient « beurre » porteur d'un allergène,
cité par une fiche dont la déclaration ne coche rien, **sans aucune alerte**.

Le backend fait pourtant exactement ce qu'il faut :

- `ingredient.controller.ts:136-141` — `GET /products/:id/ingredient-allergens`.
- `read-product-ingredient-allergens.ts` — le handler, avec son test dédié.
- `packages/pim-contracts/src/ingredient.ts:212-224` — `ProductIngredientAllergensView`,
  exporté depuis `index.ts:213`, avec un JSDoc de trente lignes qui prend soin de
  dire ce que le contrat **ne dit pas** (le silence ne vaut rien, la maille est
  le produit, le dérivé propose et la déclaration décide).
- `VariantAllergenGapView.citedNotDeclared` — précisément « cité par la
  composition, absent de la déclaration de cette déclinaison ». Le champ qui
  répond au cas du beurre.

**Consommateurs côté front : zéro.** Vérifié par recherche sur les trois noms
(`ingredient-allergens`, `ingredientAllergens`, `ProductIngredientAllergensView`)
dans tout `apps/lfc-B2B-admin-frontend/src`. Le store des ingrédients
(`product-ingredients.store.ts`) ne contient pas une fois la chaîne `allergen` ;
la section réglementaire (`regulatory-form.html`, 103 lignes) ne contient pas une
fois la chaîne `ingredient`.

Deux sections voisines sur le même écran, aveugles l'une à l'autre, avec le pont
déjà construit entre les deux.

**Et l'écran affirme le contraire de ce que le contrat protège.**
`product-form-page.html:125` : « facultatif, et **sans effet sur la
publiabilité** » ; `ingredients-form.html:9` : « une fiche sans provenance reste
publiable ». Les deux phrases sont **littéralement vraies** — et fabriquent la
croyance exacte que le JSDoc du contrat interdit : que la composition ne
renseigne pas sur les allergènes. Elle ne les **prouve** pas ; elle en
**mentionne**, et une mention non reprise est une information perdue.

---

## 4. 🟠 SÉRIEUX — « Mettre en vente » ne met rien en vente

`publish()` bascule `status` à `published`, trace le fait, et **s'arrête là**.
Recherche exhaustive : `PIM_EVENTS.productPublished` n'a que trois occurrences
dans tout `src/pim` — sa définition, son émission, et sa table d'attribution.
**Aucun abonné, aucun `@OnEvent`, aucun déclenchement de push.**

La diffusion réelle est un geste séparé, manuel, sur un autre écran :
`shopify/products/products.controller.ts` et `b2b-platform/products/push.controller.ts`.
Elle respecte le statut — `projection.ts:101` mappe un brouillon sur `DRAFT`
Shopify, le feed B2B lit `membership.publishedProductIds()` — mais elle ne part
pas toute seule.

Donc, en pratique :

- un produit **publié et jamais poussé** n'est en vente nulle part ;
- un produit **poussé en brouillon** existe chez Shopify, en `DRAFT` ;
- le libellé « En ligne » du rail (`publish-rail.html:109`) est une affirmation
  que la fiche n'a pas les moyens de vérifier.

**Et il y a une cinquième notion que la fiche ignore complètement** : la
**révision** de catalogue (`catalogue/revision/`) — l'ancre datée, diffable, qui
est le vrai « ce que le catalogue était ce jour-là ». La fiche produit ne la
nomme jamais. Elle est sur un autre écran (`/pim/revisions`, l'aperçu à
`overview-page.html:51-78`).

⚠️ **Et la révision ne filtre pas sur le statut.**
`prisma-catalog-revision.source.ts:33` appelle `catalogue.publishable()`, qui
(`prisma-catalogue-reader.ts:54-57`) rend **tout ce qui n'est pas archivé** —
brouillons compris. Le nom `publishable()` dit « ce qui est publiable » et
signifie « ce qui n'est pas archivé ». Le `status` est bien recopié dans l'item
de révision, donc les consommateurs _peuvent_ trier ; mais une ancre de
catalogue contient aujourd'hui les brouillons, et rien à l'écran ne le dit.

**[opinion] La reformulation que je proposerais** : le geste de la fiche n'est
pas « mettre en vente », c'est **« retenir pour la prochaine version du
catalogue »**. Ce que le statut décide, c'est l'éligibilité ; ce qui met en
vente, c'est la révision poussée. Renommer le bouton sans réunir les deux
notions ne ferait que déplacer le mensonge.

---

## 5. 🟠 SÉRIEUX — le bouton n'est pas désarmé, alors que la condition est calculée juste à côté

`publish-rail.html:126-128` — « Mettre en vente » n'a **pas** de `[disabled]`.
Le composant qui le peint calcule pourtant, quinze lignes plus haut
(`publish-rail.ts:127-136`), `allergensDeclared`, et expose `complete()` — dont
il se sert pour désarmer « Déclarer publiable » (`publish-rail.html:73`).

Le serveur refuse correctement (`ProductNotPublishableError`, message clair,
SKU nommés). Mais l'écran connaît le refus d'avance et laisse quand même
cliquer.

Deux nuances à charge :

- la complétude de l'écran et la règle du serveur **ne sont pas la même** : le
  serveur exige `allergens !== null` sur **toutes** les déclinaisons vivantes,
  l'écran vérifie la déclaration de la **seule** déclinaison par défaut
  (`publish-rail.ts:132`). Désarmer sur `complete()` serait donc juste dans un
  sens et faux dans l'autre — cf. §2.
- l'écran exige **plus** que le serveur (prix, visuel, six traductions), qui n'en
  demande aucun. Une fiche sans prix ni visuel se met en vente sans un mot.

---

## 6. 🟠 SÉRIEUX — la signature « Publiable » est périmée par la publication elle-même

`readinessStale` (`product-form-store.ts:480-483`) compare `readyAt` à
`contentUpdatedAt`. Et `contentUpdatedAt`
(`prisma-readiness.repository.ts:43-64`) est le maximum de `product.updatedAt`,
`variants[].updatedAt`, `media[].updatedAt`, `editorial.updatedAt`.

Or `Product.updatedAt` est un `@updatedAt` Prisma (`schema.prisma:3001`), sur la
même ligne que `status` (`schema.prisma:2996`). **Toute écriture de statut le
bump.**

Donc : je signe, je mets en vente, je recharge → « La fiche a été modifiée
depuis. La déclaration porte sur l'état précédent. » Rien du **contenu** n'a
bougé. Le geste que la signature justifie est celui qui la périme.

Même effet sur un archivage et sur une dépublication — d'où, pour partie, le
sentiment que « l'encart publiable ne suit pas la dépublication » : il la suit,
mais en disant la mauvaise chose.

---

## 7. 🟠 SÉRIEUX — et symétriquement, la signature n'est jamais périmée pendant la session

`contentUpdatedAtValue` n'est écrit qu'à un seul endroit :
`product-form-store.ts:1287`, dans `hydrate()`. Le chemin d'enregistrement
(`save()`, `store:1218-1232`) met à jour `statusMap` et `baseline`, et **ne
touche pas** `contentUpdatedAtValue`. `changeStatus` non plus. Aucun
rechargement du détail après un enregistrement.

L'avertissement de péremption est donc :

- **faux positif** après rechargement, sur un simple changement de statut (§6) ;
- **faux négatif** pendant l'édition : je signe, je réécris le prix,
  j'enregistre — l'encart continue d'afficher la signature comme valide.

Un indicateur qui se trompe dans les deux sens n'informe pas, il use.

---

## 8. 🟠 SÉRIEUX — la publication ne demande pas la signature

`PublishProductHandler` (`publish-product.ts:20-24`) injecte
`ProductRepository`, `PimJournal`, `UnitOfWork`. **Pas `ReadinessRepository`.**

Le JSDoc de `declare-product-ready.ts:19-30` décrit pourtant la signature comme
« le geste qui manquait entre "tout est rempli" et "c'est en vente" ». Entre les
deux, il n'y a rien : la mise en vente ne la lit pas.

**[opinion]** Soit la signature conditionne la mise en vente, soit elle est un
commentaire daté. Le rail la présente comme une étape ; le modèle en fait une
annotation. Il faut trancher, et l'un des deux textes ment.

---

## 9. 🟠 SÉRIEUX — le statut s'affiche brut, en anglais, et un brouillon est vert

`products-page.html:116-121` :

```html
<fold-badge [content]="p.status" [variant]="p.status === 'archived' ? 'neutral' : 'success'" />
```

Deux défauts en trois lignes :

- `[content]="p.status"` affiche la **valeur d'enum** : `draft`, `published`,
  `archived`. En anglais, sur un écran lu par du personnel francophone.
  `lint:code-language` ne le voit pas — il lit les identifiants, pas les valeurs
  interpolées dans un gabarit.
- la variante est `success` pour tout ce qui n'est pas archivé. **Un brouillon
  s'affiche en vert, exactement comme un produit en ligne.** La colonne « statut »
  ne distingue donc pas les deux états qu'elle existe pour distinguer.

La fiche, elle, a un `statusLabel()`/`statusVariant()` corrects
(`product-form-page.html:11`). Les deux écrans ne partagent pas la traduction.

---

## 10. 🟠 SÉRIEUX — deux vocabulaires pour un geste, deux boutons pour un effet

**Deux noms pour la même action.** La liste dit « Publier » / « Dépublier »
(`products-page.html:139,144`) ; la fiche dit « Mettre en vente » / « Retirer de
la vente » (`publish-rail.html:127,123`). Même route, même effet, deux
vocabulaires — et un troisième dans le titre de bloc, « Mise en vente ».

**Deux items pour le même effet.** Dans le même menu déroulant :
« Archiver » (`products-page.html:148-152`) et « Supprimer », en rouge, icône
poubelle (`products-page.html:153-155`). Or `deleteProduct`
(`catalogue-api.ts:109-112`) appelle `archive()`, avec le commentaire honnête
« pas de suppression physique (R3 backend) : "supprimer" = archiver ».

Le commentaire est juste, la conséquence à l'écran ne l'est pas : un item rouge
intitulé « Supprimer » qui archive apprend à l'opérateur que le rouge ne veut
rien dire. Et « Supprimer » reste proposé sur un produit **déjà archivé**, où il
ne fait rien du tout.

---

## 11. 🟡 MINEUR — ce que la complétude ne compte pas

`completeness.ts:95-104` retient : nom (× 6 langues), famille, prix, allergènes,
description (× 6 langues), un visuel. Le fichier assume explicitement d'omettre
l'alternative textuelle (`completeness.ts:90-93`).

Il omet aussi, sans le dire : **le poids**, **la nutrition**, et surtout **les
canaux de diffusion**. Une fiche 100 % complète, verte, signée, peut n'être
vendue sur **aucun contexte** — auquel cas la mettre en vente ne la met nulle
part, et la barre n'en dit rien.

---

## 12. 🟡 MINEUR — « N sections modifiées » ne compte pas les ingrédients

`dirtySections` (`store:719-728`) parcourt `SAVEABLE`, qui exclut les
ingrédients — ceux-ci vivant sur un autre agrégat avec leur propre bouton
(décision assumée et écrite, `product-form-page.html:113-116`).

La décision est bonne ; le compteur, lui, affiche « 2 sections modifiées » quand
il y en a trois en attente, et « Tout enregistrer » n'enregistre pas tout. Le
libellé promet plus que le geste.

---

## 13. 🟡 LATENT — la fiche ne se réhydrate pas sur changement de paramètre

`product-form-page.ts:200-202` lit `route.snapshot.paramMap` dans le
**constructeur**. Avec la stratégie de réutilisation par défaut d'Angular, une
navigation `/pim/produits/A` → `/pim/produits/B` réutiliserait le composant sans
rejouer le constructeur : la fiche de A resterait à l'écran sous l'URL de B.

**Non déclenchable aujourd'hui** — l'unique chemin vers la fiche passe par la
liste, qui est une autre configuration de route, donc le composant est détruit.
C'est une mine, pas un trou : le premier lien « produit suivant » ou « produit
similaire » l'arme.

Il en va de même du défaut suivant, inerte pour la même raison :
`store:1291-1299` hydrate les allergènes de façon **asymétrique** — la branche
`null` remet `declaresNone` **et** `selected` à zéro, la branche `[]` ne remet
que `declaresNone`, la branche `else` ne remet que `selected`. Sur une seconde
hydratation, un `declaresNone` resté à `true` ferait envoyer `[]` par
`saveFiche()` (`store:1094`) — **effaçant les allergènes déclarés**, en silence.

---

## 14. Ce qui est bien fait

Un audit à charge qui ne dit pas ça est inutilisable.

- **Le domaine produit est propre.** `publish()`/`unpublish()`/`archive()`/
  `restore()` portent leurs invariants dans l'agrégat, refusent par des erreurs
  nommées, avec des messages qui disent le geste de sortie. Le refus de publier
  un archivé est explicite et justifié.
- **La journalisation est complète et transactionnelle.** Les cinq faits de
  cycle de vie existent, la trace et l'écriture partagent l'unité de travail, et
  `declare-product-ready.ts:57-61` explique pourquoi. Le seul fait faux du
  système (§1) vient du front qui appelle la mauvaise route, pas du journal.
- **`completeness.ts` est un modèle de séparation** : la règle métier hors du
  composant, testable sur un objet littéral, avec le JSDoc qui explique le
  renversement des traductions (le dénominateur qui grandissait pendant la
  saisie). C'est le meilleur fichier du lot.
- **Le contrat `ProductIngredientAllergensView` est exemplaire** — il passe
  l'essentiel de son JSDoc à interdire les lectures fausses qu'un écran serait
  tenté d'en faire. Il ne lui manque qu'un lecteur.
- **La révision de catalogue** (empreinte, diff paresseux, héritages résolus,
  capture idempotente) est de la bonne ingénierie. Elle est simplement invisible
  depuis la fiche.

**[opinion]** Le déséquilibre est net et il est toujours dans le même sens : le
backend est conçu, testé, justifié ; le front consomme une partie de ce qui est
offert et invente le reste. Les trois défauts bloquants sont tous des défauts de
**branchement**, pas de conception.

---

## 15. Ce qu'il faut trancher avant de réparer

Ce ne sont pas des bugs, ce sont des questions ouvertes. Y répondre change
l'ordre de réparation.

1. **La signature conditionne-t-elle la mise en vente ?** Si oui, `publish()`
   lit `ReadinessRepository` et refuse sans signature valide. Si non, on retire
   du rail tout ce qui la présente comme une étape.
2. **Que veut dire « mettre en vente » ?** Trois candidats : le statut seul
   (aujourd'hui), le statut + l'entrée dans la prochaine révision, ou le push
   effectif. Tant que ce n'est pas tranché, aucun libellé ne peut être juste.
3. **Une révision doit-elle contenir les brouillons ?** Si non,
   `publishable()` change de filtre — et de nom.
4. **Édite-t-on les déclinaisons dans le back-office ?** Si oui, c'est un écran.
   Si non, la publication ne peut pas exiger une fiche par déclinaison.
5. **Un allergène cité par la composition doit-il bloquer, avertir, ou se
   proposer en un clic ?** Le contrat est écrit pour la troisième réponse et
   interdit explicitement la première.
6. **Que fait un archivage à une signature ?** Aujourd'hui : rien, sauf la
   périmer par effet de bord.

---

## 16. L'ordre de réparation que je proposerais

**[opinion]** — et il est fait pour que chaque tranche soit livrable seule.

| #   | Ce qu'on répare                                                                       | Pourquoi d'abord                                            |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | `restoreProduct` dans le client, `case 'archived' → draft` distinct dans `callStatus` | perte de donnée en service, et un fait faux au journal      |
| 2   | Recharger le détail après un changement de statut                                     | supprime tout l'optimisme, et §6/§7 deviennent observables  |
| 3   | Sortir `status` de `contentUpdatedAt`, ou dater le contenu à part                     | l'indicateur de péremption ment dans les deux sens          |
| 4   | Traduire le statut dans la liste, un libellé et une couleur par état                  | une ligne, un mensonge de moins                             |
| 5   | Brancher `GET /ingredient-allergens` sur la section réglementaire                     | le symptôme d'origine, et tout est déjà écrit côté serveur  |
| 6   | Désarmer « Mettre en vente », mais **après** avoir tranché §15.4                      | désarmer sur la mauvaise règle est pire que ne pas désarmer |
| 7   | Un vocabulaire unique, après §15.2                                                    | renommer avant de trancher déplacerait le mensonge          |
| 8   | Fusionner « Supprimer » et « Archiver »                                               | deux items, un effet                                        |

Les tranches 1 à 5 ne dépendent d'aucune décision et se font maintenant. Les
tranches 6 à 8 attendent §15.

---

## Références

Code : `apps/lfc-B2B-admin-frontend/src/app/pim/catalogue/product-form/`,
`.../products-page/`, `apps/lfd-api/src/pim/catalogue/product/`,
`.../catalogue/revision/`, `apps/lfd-api/src/pim/ingredients/`,
`packages/pim-contracts/src/ingredient.ts`.

Docs liés : [`pim/data-model/05-allergenes-gs1-inco.md`](data-model/05-allergenes-gs1-inco.md)
(la composition qui contredit une fiche sans jamais la déclarer),
[`pim/journalisation-et-tracabilite.md`](journalisation-et-tracabilite.md).
