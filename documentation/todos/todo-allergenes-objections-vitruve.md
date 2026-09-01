# TODO — les objections non traitées du plan allergènes

Relecture d'architecture du 2026-09-01 sur
[`pim/data-model/05-allergenes-gs1-inco.md`](../pim/data-model/05-allergenes-gs1-inco.md),
troisième passe. **Trois bloquantes, huit sérieuses.** Rien ici n'est corrigé :
seules les deux affirmations _factuellement fausses_ du plan ont été redressées
sur place (le bandeau d'état, et la justification de la porte).

> **Le plan n'est pas bon à bâtir en l'état.** Les lots 6 à 10 attendent que B1
> à B3 soient tranchés — B1 en particulier, qui décide si on bâtit un second
> calcul de la même règle réglementaire.

---

## Bloquantes

### B1 — D5 est déjà bâti, sous un autre nom, dans un autre contexte

`apps/lfd-api/src/pim/ingredients/application/read-product-ingredient-allergens.ts`
est commité et son JSDoc dit « **L'ensemble dérivé** (D5) ». Il est servi par
`GET /pim/products/:id/ingredient-allergens`, typé par
`ProductIngredientAllergensView` dans un paquet **publié**
(`packages/pim-contracts`), et couvert par `test/pim-ingredients.e2e-spec.ts`.
Le plan ne le nomme pas une seule fois.

Le lot 7 introduirait donc un **second** calcul de la même règle réglementaire,
dans `catalogue`, et les deux ne répondent pas la même chose :

| cas                 | l'existant (`ingredients`) | le plan (lot 7, `catalogue`) |
| ------------------- | -------------------------- | ---------------------------- |
| `declared === null` | `citedNotDeclared: []`     | contradiction + raison       |
| `may_contain`       | ignoré                     | pris en compte               |
| jugements D5 bis    | inexistants                | absolvent                    |
| effet               | proposition d'ajout        | refus de `publish()`         |

Au lot 10, l'écran afficherait l'un pendant que `publish()` refuserait sur
l'autre.

**À trancher** : lequel meurt, ou comment le premier devient une projection du
second. Si le contrat part, c'est une dépréciation en trois temps — aucun
consommateur front aujourd'hui, mais le paquet est publié.

### B2 — Le lot 4 est marqué ✅ alors que D6 est fait à moitié

`apps/lfd-api/src/b2b/catalog/infrastructure/prisma-catalog-admin.reader.ts`
importe toujours `findMapping` et `toInco` de `pim/allergens/`, et `allergensOf()`
reprojette côté B2B.

Fait : la colonne `catalog_items.allergen_labels`, son écriture,
`CATALOG_SNAPSHOT_VERSION = 5`. Reste : le push complet, puis le retrait du
`toInco` et la lecture de `allergen_labels` par l'écran admin — le **troisième
temps** que le plan décrit lui-même. Tant qu'il n'est pas fait, l'étape
« Resserrer » de la bascule est inexécutable.

### B3 — Le périmètre réel de `publish()` ~~redressé dans le plan~~, mais la question reste ouverte

La phrase fausse est corrigée. Ce qui n'est pas tranché : une **révision de
catalogue** (`TakeCatalogRevisionHandler`) fige `source.snapshotItems()` sans
filtre de statut, donc une fiche contredite y entre encore. Soit
`take-catalog-revision` rejoint le périmètre du refus, soit le plan assume
qu'une ancre photographie sans juger.

À noter : `PrismaCatalogueReader.publishable()` rend _tout ce qui n'est pas
archivé_, brouillons compris, et `ShopifyPushService.push()` prend des ids
arbitraires. La projection Shopify, elle, ne transporte aucun allergène.

---

## Sérieuses

**S1 — `absent` / `traces_only` rate l'exemption de l'annexe II.** Les dérivés
listés en note (sirops de glucose de blé, dextrose, huile de soja entièrement
raffinée, distillats d'origine céréalière) sont **présents** et **dispensés de
mention**. L'opérateur n'aurait que `absent`, qui affirme le contraire du fait —
le déclassement silencieux que D5 bis existe pour empêcher. Un troisième
jugement `exempted`, portant la note d'annexe visée, est plus probable qu'un
raffinage de formulation.

**S2 — « `traces_only` est un invariant » : rien ne le tient.** `may_contain`
vit dans `NutritionDeclaration`, la certification dans une autre table, sur un
autre agrégat, écrite par un autre verbe : aucun objet ne voit les deux. Ce que
le plan décrit est une **vérification recalculée**, pas un invariant — une
marche plus bas dans la hiérarchie [[interdiction-plutot-que-verification]]. Et
deux textes se contredisent : la table est justifiée par « la déclaration peut
ne pas exister », or `traces_only` est inécrivable sans déclaration.

**S3 — `citedBy` contredit sa propre table, et sa dormance a deux faux
positifs.** La colonne du dessus justifie `entryId` par « une clé étrangère et
non un code en clair » ; `citedBy String[]` fait exactement l'inverse, sans FK
ni cascade, alors que `ProductIngredient` référence l'ingrédient par id. Sur le
fond : (a) un citant qui **disparaît** endort le jugement et réveille l'alerte
alors que le risque a diminué — la règle correcte est l'inclusion,
`dormant ⟺ cited ⊄ citedBy` ; (b) retirer puis remettre le même code sur le même
ingrédient fait **recouvrir en silence** une donnée qui a changé deux fois.
`citedBy` retient _qui_ citait, pas _ce que l'ingrédient déclarait_.

**S4 — `publish(contradictions)` passe la conclusion, pas les faits.** Le
précédent maison est `Product.setVat(vat, contexts, familyChannels)`, qui passe
des **faits** que l'agrégat ne peut pas voir. Or l'agrégat voit déjà deux des
quatre entrées (`variant.allergens`, `variant.nutrition.mayContain` sont dans
`VariantSnapshot`). La forme homogène est `publish(cited, certifications)`,
l'agrégat appelant le service pur. Coût de retour arrière nul avant le lot 7,
entier après.

Point du même § non tranché : `publish()` **exclut déjà les déclinaisons
arrêtées** de l'exigence de fiche. Si la détection ne les exclut pas, une
déclinaison arrêtée bloque la gamme vivante pour toujours.

**S5 — le liage dans `appBootstrap/` évite un cycle qui n'existe pas.**
`catalogue/` n'importe rien de `ingredients/`, et le gate `import-cycles`
raisonne fichier par fichier. Les trois modules d'`appBootstrap` relient des
**blocs** et sont `@Global` pour ça ; y déposer un port **intra-`pim`** le rend
visible de tout le processus. `ingredients.module.ts` écrit déjà le chemin
prévu : « il exportera un lecteur — et ce jour-là seulement ».

**S6 — la sonde n'a ni cadence ni destinataire.** Le modèle cité,
`ops_catalog_parity.yml`, est `on: workflow_dispatch:` **seul** et se déclare
temporaire ; aucun workflow `ops_*` du dépôt n'a de `schedule`. L'intention n°3
reposerait donc sur un bouton que personne n'est tenu de presser. Rapporter
plutôt que dépublier est défendable ; rapporter sans cadence ni destinataire ne
l'est pas. Une cloche back-office existe (`staff/notifications`) — le plan ne la
nomme pas. Le lot 9 n'est pas chiffré : route gardée (`RecomputeGuard` existe),
format de rapport, workflow, secret.

**S7 — `setProductIngredients` touche `product.updatedAt` : trois non-dits.**
(a) Le handler détecte déjà l'enregistrement à l'identique (`unchanged` →
`journal.untraced`) ; toucher `updatedAt` inconditionnellement périmerait une
signature sur un ré-enregistrement sans changement. (b) C'est `ingredients/` qui
écrirait une colonne de `product` — franchissement de sous-contexte invisible
aux portes, et écriture nue sur la ligne d'un agrégat. (c) La promesse ne
produit qu'un indicateur de signature périmée : elle ne signale la contradiction
à personne et ne touche pas le statut publié.

**S8 — le « quatrième état » n'existe plus.** Le plan charge le lot 7 de
refermer une entrée vive sous catégorie archivée. Vérifié : le lot 3 l'a déjà
fermé — `requireLivingCategory` garde création, restauration et déplacement, et
`ensureCategoryUncited` refuse d'archiver une catégorie qui garde une entrée
proposée. Reste le SQL direct, qu'aucune contrainte ne couvre — mais ce n'est
pas ce que le plan décrivait. **Corrigé dans le plan** ; reste ici pour mémoire.

---

## Mineurs

- La « sonde de la couche 4 » (présence des 30/15) et la « sonde de
  contradiction » (lot 9) sont deux sondes distinctes que le plan fusionne. La
  première n'est toujours dans aucun lot.
- « C'est la seule des quatre couches qui regarde la production » est écrit deux
  fois dans le même paragraphe.
- « Recomptés : trois fichiers importent `pim/allergens/` » — il y en a quatre
  aujourd'hui (le reader B2B, `nutrition-declaration.ts`, `reference.controller.ts`,
  `test/pim-allergens.e2e-spec.ts`).
- Le défaut de groupement `entry.incoLabel ?? 'Hors obligation UE'` est aussi
  dans `provenance/ingredient-panel/ingredient-panel.ts`, surface que le plan
  classe ✅ sans réserve. Cf. [`todo-fold-multiselect-recherche.md`](todo-fold-multiselect-recherche.md).
- `citedBy` peut retenir la clé d'un ingrédient supprimé — `RemoveIngredientHandler`
  fait un `remove(key)` physique. Clé morte, jamais nettoyée.
- L'entrée d'index de `documentation/README.md` résume une rédaction antérieure.
- Lots non chiffrés là où ils engagent du travail : lot 7 (`PublishProductHandler`
  passe de 3 à ~6 dépendances, signature d'agrégat changée partout), lot 9.

---

## Ce que la relecture n'a pas pu établir

- La **fréquence réelle** des cas d'exemption annexe II dans l'atelier — S1 est
  réglementaire, pas empirique.
- Le comportement du harnais e2e face à `variant_allergen_certification` (le
  `TRUNCATE … CASCADE` devrait l'emporter par la FK ; non exécuté).
- Ce que l'ancre de révision fige exactement, champ par champ.
- Ce que l'écran admin B2B affiche aujourd'hui pour les allergènes.
