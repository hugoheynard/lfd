# Supprimer une fiche archivée

> **Doc-first, 2026-11-10 — version 4, la simple.** Les trois premières
> versions effaçaient **physiquement** une fiche archivée jamais vendue, et
> chacune a pris des bloquants de `vitruve` au même endroit : savoir si la
> fiche a servi dans six blocs, poser une pierre tombale au miroir, verrouiller
> le registre des SKU, ordonner treize `DELETE`, démêler la lignée d'un
> détachement. Hugo, devant la v4 en préparation : « ça me paraît trop
> compliqué tout ça ». Ce que Hugo veut, c'est des **archives propres** ; ça ne
> demande pas de détruire la ligne.
>
> **Décision (Hugo, 2026-11-10) : un soft delete.** Une fiche archivée peut
> passer à l'état `deleted` ; elle disparaît de tout le référentiel, archives
> comprises ; son SKU reste pris ; la ligne reste en base. C'est la règle du
> dépôt (`CLAUDE.md` §3 : « pas de DELETE physique sur les agrégats métier :
> archivage / statut »), un cran plus loin que l'archivage. Pas de `vitruve` :
> ni argent, ni migration de données, ni frontière de sécurité, ni runbook.
> Tout ce qui suit a été lu dans le code le 2026-11-10.

## Partie 1 — ce qu'on décide

**Archivée** : la fiche est hors vente, consultable dans les archives,
restaurable en brouillon. **Supprimée** : elle n'apparaît plus nulle part dans
le référentiel et ne se restaure pas depuis l'écran. Le journal garde le fait
`product.deleted` avec le SKU et le nom, comme `product.archived` ; si un jour
on se trompe, on la retrouve par le journal, et la remettre en archives est un
geste d'entretien, pas un bouton.

**Un seul garde-fou : la fiche est archivée.** Pas de « jamais vendue » : une
fiche vendue puis supprimée ne casse rien, les commandes portent leur
instantané, le miroir du commerce l'a déjà retirée à l'archivage, et le SKU ne
revient jamais. C'est exactement ce qui rendait les versions précédentes
compliquées, et ce dont on n'a pas besoin.

**Le geste** : dans la page des produits, onglet « Archivées », un bouton
« Supprimer » par fiche, avec confirmation qui répète le SKU et le nom, sous
le droit d'édition du catalogue (`pim_catalog:write`) — c'est réversible par
le journal, pas un geste irréversible qui demanderait son propre droit.

**Plus tard, même socle** : la déclinaison arrêtée et la famille archivée vide
prennent le même statut, par le même geste. Une purge physique des fiches
`deleted`, si elle devient utile un jour, sera un outil d'entretien ; elle
partira d'un statut déjà posé.

## Partie 2 — le détail technique

### Vérifié dans le code le 2026-11-10

- `enum ProductStatus { draft, published, archived }` (`prisma/schema/pim/product.prisma:9`),
  `type ProductStatus` dans `product.ts:49` et dans `@lfd/pim-contracts`
  (`product.ts:22`).
- L'agrégat : `archive()` idempotent, `restore()` refuse hors `archived`
  (`product.ts:554-584`). `ArchiveProductHandler` journalise
  (`PIM_EVENTS.productArchived`, charge `{ subjectLabel, sku, name }`),
  sauve, puis `emitter.emitProducts([id])` dans `uow.run`
  (`archive-product.ts`).
- Le miroir : `STATUS_OF: Record<ProductStatus, CatalogEntryStatus>`
  (`catalog-facts.ts:34`) — exhaustif, donc le compilateur nomme chaque
  lecteur à compléter.
- Lecteurs qui regardent `product.status` dans le référentiel (douze fichiers
  hors tests, grep du 2026-11-10) : `list-products.ts`,
  `list-product-compliance-warnings.ts`, `declare-product-ready.ts`,
  `withdraw-product-readiness.ts`, `ingredient-allergen-propagation*`,
  `prisma-catalogue-reader.ts`, `prisma-product-count.reader.ts`,
  `prisma-published-allergens.reader.ts`, `repository-allergen-matrix.source.ts`,
  `allergen-matrix.ts`, `catalog-facts.ts`, `catalog-product-changed.fact.ts`.
- Journal : `"product.archived": labelled(skuAndName())`
  (`packages/contracts/src/journal-facts/referential-catalogue.ts:512`).
- Front : `pim/catalogue/product-status.ts` et `products-page/*` portent le
  filtre par statut.

### Le lot — un seul, back puis front

**API**

1. `deleted` dans l'enum Postgres (migration additive d'une ligne), dans
   `ProductStatus` du domaine et de `@lfd/pim-contracts`.
2. L'agrégat : `delete(): void` — refuse hors `archived`
   (`NotArchivedProductNotDeletableError`, `BusinessError`, qui nomme le
   statut réel) ; `restore()` refuse une `deleted` avec le même refus
   qu'aujourd'hui (elle n'est pas archivée) ; `archive()` sur une `deleted`
   refuse aussi — une supprimée ne redevient rien par l'écran.
3. `DeleteProductCommand` + handler (un fichier `delete-product` à créer, colocalisé, style
   PIM) : `requireProduct` → `product.delete()` → dans `uow.run` : journal
   `PIM_EVENTS.productDeleted` (`product.deleted`, charge
   `{ subjectLabel, sku, name }`), `save`, `emitProducts([id])` — le fait
   partant porte `STATUS_OF.deleted = "archived"` : le miroir ne connaît pas
   la différence, et n'a pas à la connaître.
4. Route `DELETE pim/catalogue/products/:id` sous `pim_catalog:write`, dans un
   contrôleur à part (un fichier `product-deletion.controller` à créer, `@Controller("catalogue/products")`
   — `product.controller.ts` dépasse déjà 300 lignes).
5. **Une supprimée est absente partout** : chaque lecteur de la liste
   ci-dessus est relu ; ceux qui filtrent par `published` ne bougent pas ;
   ceux qui listent « tout » ou « tout sauf brouillon » excluent `deleted`
   (listes de produits, comptes par famille, matrice des allergènes,
   propagation, avertissements de conformité, lecteur du catalogue). Le
   `GET :id` d'une supprimée rend 404. `requireProduct` ne change pas : les
   commandes d'édition refusent déjà par l'agrégat (une `deleted` n'est ni
   `draft` ni `published` ni `archived` pour ses méthodes).
6. Journal : `"product.deleted": labelled(skuAndName())` dans les contrats,
   sa phrase au back-office, `PIM_EVENTS.productDeleted`.
7. Tests : agrégat (refus hors archivée, refus de restaurer ou d'archiver une
   supprimée) ; handler (journal → save → émission, refus propagé) ; e2e :
   supprimer une archivée ⇒ 204, absente de la liste, des archives, du
   compte de famille et de la matrice, 404 sur son détail, fait au journal,
   SKU refusé à la création d'une autre fiche, `DELETE` sur une publiée ⇒
   409 nommé, le miroir reçoit un fait `archived`.

**Back-office** (`pablo`)

8. Onglet « Archivées » de la page des produits : bouton « Supprimer » par
   fiche, `fold-inline-confirm` avec SKU et nom, masqué sans
   `pim_catalog:write` ; la ligne disparaît au succès ; `deleted` absent des
   filtres de `product-status.ts`. Spec de la page.

### Ce qui ne bouge pas

Le registre des SKU (jamais libéré, et la porte `sku-never-recycled` reste
telle quelle), le miroir du commerce, les autres blocs, les portes, la lignée
d'un détachement (une supprimée garde ses clés comme une archivée), les
révisions publiées.
