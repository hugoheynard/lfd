# Plan — propager l'allergène d'un ingrédient à ses fiches

> 📝 **Plan, rien n'est bâti** (2026-10-27). Demande de Hugo : « si on ajoute
> un nouvel allergène à un ingrédient, un clic qui l'applique à toutes les
> fiches qui contiennent cet ingrédient, pareil pour le retrait, avec un message
> qui explique la différence et combien de fiches ça touche ».

## 1. Ce qui existe

- La composition d'une fiche cite des ingrédients ; chaque ingrédient porte
  ses allergènes (`set-ingredient-allergens.ts`).
- La déclaration d'une déclinaison s'enregistre par
  `save-variant-allergens.ts` : agrégat `Product.declareAllergens`, écriture
  par le port dédié `VariantAllergensRepository`, une trace au journal par
  fiche (`productAllergensSaved`), émission vers le commerce.
- Depuis le 2026-10-27, une fiche dont la composition cite un allergène que la
  déclaration ne porte pas est **bloquée** (`productCompliance`, contradiction
  bloquante). Ajouter un allergène à un ingrédient rend donc bloquantes toutes
  les fiches qui le citent et ne le déclarent pas : la propagation est le geste
  qui les répare.
- Règle D5 : la composition **propose**, elle ne décide jamais seule. Rien ne
  s'applique sans un geste explicite.

## 2. Le geste

Après l'enregistrement des allergènes d'un ingrédient, l'écran de l'ingrédient
affiche un **aperçu** calculé par le serveur, puis un bouton.

### Ajout d'un allergène A

Pour chaque fiche non archivée dont la composition cite l'ingrédient, et pour
chaque déclinaison qui porte **sa propre** déclaration (une déclinaison alignée
suit celle du défaut, `Product.resolvedVariants()`) :

- la déclaration contient déjà A → rien ;
- la déclaration est **« aucun allergène »** ou une liste sans A → **A est
  ajouté** (et « aucun allergène » est levé) ;
- la déclaration est **non renseignée** → rien, listée à part (« à déclarer
  dans la fiche ») : on ne fabrique pas une déclaration que personne n'a faite.

### Retrait d'un allergène R

R n'est proposé au retrait que sur une déclinaison qui le déclare **et** dont
**aucun autre ingrédient** de la composition ne le porte encore. Chaque
déclinaison proposée a **sa case, cochée par défaut** : on la décoche quand R
est voulu (contamination d'atelier déclarée à la main). Une fiche **publiée**
qui perdrait R est signalée en rouge.

Les traces (« peut contenir ») ne sont ni lues ni touchées.

### Le message

> Le gluten ajouté à _Farine T65_ touche **14 fiches** : 9 le déclarent déjà,
> **5 vont le recevoir** (dont 3 publiées), 1 n'a pas encore de déclaration.

> Le lait retiré de _Beurre doux_ : **4 fiches** pourraient le perdre (dont
> **2 publiées**) ; 2 le gardent, un autre ingrédient en contient.

## 3. Côté serveur

- **Query** `PreviewIngredientAllergenPropagation(ingredientId, added,
removed)`, dans le **catalogue** — il possède les déclarations, l'alignement
  et le jugement. Les fiches qui citent l'ingrédient et ce que citent leurs
  autres ingrédients arrivent par un port déclaré par le catalogue et
  implémenté par `ingredients/` (même forme que `CitedAllergensReader`, liage
  dans `appBootstrap/`). Rend, par fiche : statut, déclinaisons, ajouts,
  retraits proposés, non renseignées, et les comptes du message.
- **Commande** `ApplyIngredientAllergenPropagation(ingredientId, added,
removed, removalsKept)` — `removalsKept` : les déclinaisons décochées.
  Elle **recalcule l'aperçu** au moment d'appliquer et n'applique que ce qu'il
  propose encore (une fiche modifiée entre-temps n'est pas écrasée) ; pour
  chaque déclinaison, le même chemin que `save-variant-allergens.ts`
  (agrégat, port dédié, **une trace par fiche** qui nomme l'ingrédient à
  l'origine, émission). Le tout dans une unité de travail. Rend les comptes
  appliqués.
- Les deux routes sous `/pim`, même surface et même droit que l'écriture des
  allergènes d'un ingrédient.

## 4. Côté écran

Après l'enregistrement des allergènes d'un ingrédient, si l'aperçu n'est pas
vide : un `fold-callout` qui dit le message du § 2, un bouton « Voir les
fiches » qui ouvre un panneau fold (liste des fiches, déclinaisons, cases des
retraits, publiées en rouge), et « Appliquer à N fiches ». Après application :
un toast « 5 fiches mises à jour » et la table des produits rafraîchie (les
badges « Bloquant » disparaissent).

## 5. Tests

- Unitaires : ajout (liste, « aucun allergène », non renseignée), retrait
  (autre ingrédient qui le porte encore, décochée, publiée), déclinaison
  alignée, fiche archivée ignorée, aperçu périmé à l'application.
- Régression nommée : « ajouter le gluten à un ingrédient puis propager rend
  activable la fiche qui déclarait aucun allergène ».
- e2e : aperçu puis application, journal par fiche.

## 6. Lots

| Lot | Contenu                       |
| --- | ----------------------------- |
| P1  | Port, query, commande, routes |
| P2  | Callout, panneau, application |
