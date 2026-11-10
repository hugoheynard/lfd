# Remise à plat du référentiel sur la carte pâtisserie — les réponses

> **Écrit le 2026-11-10**, en réponse au mail de l'équipe qui propose de
> remettre le back-office à plat sur la base de la « CARTE PÂTISSERIE
> ACTUALISÉE ». Chaque réponse ci-dessous a été **lue dans le code ce
> jour-là** (chemins sous `apps/lfd-api/src/` sauf mention) ; rien n'est
> repris de mémoire. La partie 1 répond aux six questions ; la partie 2 donne
> les preuves.

## Partie 1 — les six réponses, et ce que ça change pour le plan proposé

### 1. Que portent les familles, en plus de la TVA ?

Une famille (le modèle `Category` du référentiel) porte **cinq choses** :

- son **nom** et son adresse (`slug`), et sa place dans l'**arbre** (parent,
  sous-familles) ;
- sa **position** d'affichage (l'ordre des rayons dans la boutique) ;
- son **audience** : `pro`, `public` ou `both` — à qui elle vend. Une fiche
  hérite de l'audience de sa famille tant qu'elle ne la surcharge pas ;
- ses **taux de TVA par contexte de vente** (à emporter, sur place, B2B…),
  dont une fiche hérite tant qu'elle n'a pas le sien ;
- un **drapeau d'archivage** (jamais une suppression).

Ce qu'elle ne porte **pas** : ni prix, ni mercuriale, ni promotion, ni limite
de commande, ni « rayon » distinct. Ces décisions existent, mais ailleurs :
elles **visent** une famille par son identifiant (une règle de prix « sur la
famille X », une promotion « sur la famille X », une heure limite « sur la
famille X », une remise de retrait d'un site « sur la famille X »). Et **la
famille EST le rayon** de la boutique : il n'y a pas de seconde taxonomie.

### 2. Que se passe-t-il quand on change une fiche de famille ?

Le geste passe par l'écran « Identité » de la fiche (c'est la même commande
que renommer la fiche). Il est **refusé** si la famille cible n'existe pas ou
est archivée. Sinon :

- la fiche prend la nouvelle famille, un fait `product.reclassified` est
  journalisé (avec l'ancienne et la nouvelle), et la fiche est **réémise**
  vers la plateforme ;
- **sa TVA suit la nouvelle famille** pour chaque contexte où la fiche n'a
  pas sa propre dérogation — rien n'est « recalculé » ni stocké : la TVA
  effective est lue à chaque fois comme « celle de la famille, surchargée par
  celle de la fiche ». Une fiche qui avait **sa** TVA la garde ;
- son **audience** suit de même (héritée sauf surcharge) ;
- les **règles de prix, promotions, limites de commande, remises de retrait**
  qui visent l'ancienne famille **cessent de s'appliquer** à la fiche, et
  celles qui visent la nouvelle s'y appliquent — dès la prochaine lecture,
  sans rien réécrire ;
- les **commandes déjà passées ne bougent pas** : chaque ligne a figé sa
  famille, sa TVA et son prix à la passation.

À retenir pour l'étape 5 du plan : déplacer une fiche, c'est aussi la faire
changer de TVA héritée et de règles de prix. L'ordre proposé (familles et TVA
d'abord, déplacement ensuite, alignement des prix après) est le bon.

### 3. Peut-on créer, renommer, supprimer des familles sans impact sur les commandes ou les comptes clients ?

- **Créer** : oui, sans impact (parent non archivé exigé ; le slug doit être
  unique).
- **Renommer** : oui, sans impact — le nom n'est copié nulle part côté
  commandes ou comptes ; les commandes passées portent l'identifiant de la
  famille, pas son nom.
- **Supprimer** : **ça n'existe pas.** Une famille s'**archive**, et
  seulement si elle n'a **plus aucune fiche active ni sous-famille active**
  (l'étape 8 du plan, « suppression des familles vidées », est donc un
  archivage, qui ne passera qu'après l'étape 5). Archivée, elle disparaît
  des rayons et de l'arbre côté boutique (retirée, jamais effacée), ses
  anciennes commandes restent lisibles.

⚠️ **Le seul vrai impact, et il est silencieux** : une règle de prix, une
promotion, une heure limite ou une remise de retrait **qui visait la famille
archivée reste en base, orpheline** — elle ne s'applique plus à rien et
personne ne le signale. Avant d'archiver « Pâtisserie Premium »,
« Pâtisseries » et « Pâtisserie Boulangère », relever ce qui les vise (règles
de prix par famille, promotions, limites de commande) et le reporter sur les
nouvelles familles.

Les comptes clients ne connaissent pas les familles : rien à prévoir de ce
côté.

### 4. Supprimer une fiche : supprimer ou archiver ? Et les commandes passées ?

**Archiver — il n'y a pas d'autre geste.** Aucune suppression de fiche
n'existe, ni à l'écran ni dans l'API. L'archivage :

- passe la fiche au statut `archived`, réversible (« Restaurer » la remet en
  brouillon, jamais directement en ligne) ;
- retire **toutes ses déclinaisons de la vente** sur la plateforme (elles
  sont marquées retirées, pas effacées) : plus dans les rayons, plus
  commandables — une commande qui citerait son SKU est refusée par son nom ;
- **ne touche à aucune commande passée** : une ligne de commande garde son
  propre instantané (nom, prix, TVA, SKU en texte, famille) et n'a aucun lien
  vers la fiche. Commandes, factures, fiches d'atelier, bons de livraison,
  facture du mois se lisent exactement comme avant.

Ce que l'archivage **ne fait pas** : une ligne de mercuriale déjà posée sur
la fiche reste (on refuse d'en poser une nouvelle, pas de garder l'ancienne) ;
un panier en cours qui la contient sera refusé au moment de commander. Les
SKU ne se réutilisent jamais (registre global) : une fiche recréée aura un
SKU neuf.

### 5. Un prix pro HT vide suffit-il à masquer un produit aux pros ?

**Vide, oui. À zéro, NON.** C'est la nuance la plus importante de ce mail.

- Le prix pro HT se saisit **par déclinaison** (pas par fiche). **Absent**,
  la déclinaison n'est **pas servie** aux pros : elle n'apparaît ni dans le
  catalogue pro, ni à 0 €, ni grisée, et une commande qui la demanderait est
  refusée. L'écran le dit en toutes lettres sous le champ (« Aucun prix pro
  HT saisi : … pas vendue aux pros »).
- **Zéro est un prix** : le champ accepte « 0 », et une déclinaison à 0 € HT
  est **vendue aux pros à 0 €**. Il ne faut donc **jamais** saisir 0 pour
  masquer — laisser le champ vide.
- Même logique côté particuliers : prix public TTC absent = pas vendue au
  public.
- Une fiche dont **aucune** audience n'a de prix est **incomplète** et ne se
  publie pas ; une fiche vendue aux pros sans prix pro remonte le manque
  « prix pro » dans la conformité.

Le même principe sert aussi pour « pas de prix HT B2B sur la carte = produit
non vendu en B2B » : à condition que la famille (ou la fiche) ne soit pas
`pro`-seulement, sinon la fiche n'a plus aucun prix et ne se publie plus.

### 6. Une extraction complète du catalogue avant modification ?

Ce qui existe aujourd'hui, à télécharger depuis le back-office :

- **l'export CSV du catalogue plateforme** (`Catalogue → export`) : SKU,
  article, famille, tarif HT, prix appliqué HT, TVA, état (en vente / masqué
  / sans prix pro / sans TVA / pas vendu aux pros) — **par déclinaison
  vendable**, sans prix public ni allergènes ;
- **la matrice des allergènes** (CSV et PDF) ;
- **la grille de prix** (CSV).

Ce qui **n'existe pas** : un export complet du référentiel (familles avec
leurs TVA et audiences, fiches avec statut, déclinaisons avec poids, pas,
minimums, éditorial, visuels) en XLSX ou JSON, ni une **restauration** du
catalogue — les révisions sont des photos consultables (diff, étiquette),
pas un point de retour, et c'est voulu depuis le 2026-09-21.

Donc, pour l'étape 1 du plan : les trois exports ci-dessus donnent une
sauvegarde **lisible** de ce qui se vend et à quel prix ; pour une
sauvegarde **exhaustive**, il faut un export du référentiel qui n'existe pas
encore — à chiffrer si on le veut avant de commencer (une journée). Sans lui,
le filet est l'historique : chaque geste (archivage, reclassement, TVA, prix)
est journalisé avec l'avant et l'après, et une fiche archivée se restaure.

### Deux remarques sur les principes du mail

- **« 1 produit = 1 composition = 1 fiche, les déclinaisons pour les formats
  seulement »** : le modèle le permet. Une déclinaison qui est en réalité un
  autre produit (un parfum) se **détache en fiche à part** par un geste qui
  existe (la fiche neuve naît en brouillon avec un SKU neuf, la composition,
  l'éditorial, les visuels, les allergènes et la nutrition copiés ; **pas** les
  tarifs négociés ni les conditionnements). Deux limites : on ne détache pas
  la déclinaison **par défaut** (en désigner une autre d'abord), et le geste
  est irréversible côté origine. Sinon : fiche neuve + archivage de
  l'ancienne, mêmes limites de tarifs.
- **« Vrac au poids, pas de 100 g »** : la vente au poids existe par
  déclinaison (unité `weight`, **minimum** et **pas** en grammes, saisis
  librement, pas de 100 g en dur) ; la commande se compte alors en grammes et
  refuse ce qui n'est pas un multiple du pas. Rien à développer.
- **« TVA 10 % pour les événements saisonniers »** : les taux ne sont pas une
  liste fermée (on en crée à l'écran) et il n'y a pas de notion de « taux
  événementiel » : c'est un taux comme un autre, posé sur une famille ou une
  fiche par contexte. Une fiche qui doit garder son taux (chocolaterie) le
  garde en dérogation, comme le mail le prévoit.

## Partie 2 — les preuves

| Affirmation                                                                                     | Où c'est lu (2026-11-10)                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La famille porte nom, slug, arbre, position, `audience`, TVA par contexte, archivage            | `prisma/schema/pim/categories.prisma` (`Category`, `CategoryContextVat`)                                                                                                                                                                                                     |
| TVA effective = famille par contexte, surchargée par la fiche                                   | `pim/catalogue/shared/domain/value-objects/context-vat.ts` (`effectiveVat` : `{ ...family, ...product }`), appelé par `pim/channels/b2b-platform/products/catalog-facts.source.ts` et le lecteur du catalogue                                                                |
| Audience de la fiche héritée sauf surcharge                                                     | `prisma/schema/pim/product.prisma` (`Product.audience String?`)                                                                                                                                                                                                              |
| Limites de commande, règles de prix, promotions, remises de site visent la famille par id       | `prisma/schema/pim/sales-contexts.prisma` (`OrderTimeLimit.scopeType = category`), `lafoliecoffee/pricing/domain/pricing-scopes.ts`, `prisma/schema/public/promotions.prisma`, `lafoliecoffee/sites/infrastructure/site-row.ts`                                              |
| La famille est le rayon                                                                         | `lafoliecoffee/catalog/application/shop-shelf-tree.ts`, porte `lint:no-shelf-literals` (« la famille est une donnée »)                                                                                                                                                       |
| Changer de famille = commande d'identité ; refus si cible absente ou archivée ; fait journalisé | `pim/catalogue/product/application/update-product-identity.ts`, `product.ts` (`reclassify`)                                                                                                                                                                                  |
| Commandes passées figées (SKU texte, nom, prix, TVA, famille), sans lien vers la fiche          | `prisma/schema/public/orders.prisma` (`OrderLine` : « String, PAS une FK », `productNameSnapshot`, `unitPriceMillicents`, `vatRate`, `categoryId`)                                                                                                                           |
| Pas de suppression de famille ; archivage refusé si fiches ou sous-familles actives             | `pim/catalogue/category/application/archive-category.ts` (`CategoryHasActiveProductsError`, `CategoryHasActiveChildrenError`) ; aucun handler de suppression                                                                                                                 |
| Une règle visant une famille archivée reste orpheline, sans garde                               | `prisma/schema/public/settings.prisma` (« une famille retirée laisse une règle orpheline »), `lafoliecoffee/pricing/domain/services/sale-references.ts` (portée `category` : pas de vérification)                                                                            |
| Pas de suppression de fiche ; archiver = statut, idempotent, sans garde ; restaurer → brouillon | `pim/catalogue/product/application/archive-product.ts`, `product.ts` (`archive`, `restore`) ; `product.controller.ts` (aucune route `DELETE` sur la fiche)                                                                                                                   |
| Fiche archivée ⇒ toutes ses lignes retirées de la vente côté plateforme                         | `lafoliecoffee/catalog/domain/catalog-product-facts.ts` (`itemsOnSale` : `[]` si non active), `prisma-catalog-product-facts.projection.ts` (`withdrawOthers`)                                                                                                                |
| SKU inconnu ou retiré refusé à la commande                                                      | `lafoliecoffee/orders/application/services/order-line-pricing.service.ts` (`UnknownSkuError`)                                                                                                                                                                                |
| Prix pro HT par déclinaison ; absent = pas vendue aux pros ; **0 accepté** et servi             | `prisma/schema/pim/product.prisma` (`proPriceMillicents`, « NULL = pas vendue aux pros »), `pro-price-ht.ts` (« un montant positif **ou nul** »), `lafoliecoffee/catalog/infrastructure/prisma-catalog.reader.ts` (`servedPriceOf` : `null` seulement si le prix est `null`) |
| Prix public TTC absent = pas vendue au public                                                   | `prisma-catalog.reader.ts` (`publicByContext` absent ⇒ non servi), `pim/channels/b2b-platform/products/projection.ts`                                                                                                                                                        |
| Complétude : prix exigé seulement si aucune audience n'a de prix ; manque « prix pro » signalé  | `pim/catalogue/product/domain/services/variant-completeness.ts` (`variantGaps`)                                                                                                                                                                                              |
| Écran : « Aucun prix pro HT saisi : … pas vendue aux pros »                                     | `apps/lfd-backoffice-frontend/src/app/pim/catalogue/product-form/form-sections/pricing/pricing-form.html`                                                                                                                                                                    |
| Export CSV catalogue (7 colonnes, états en toutes lettres)                                      | `lafoliecoffee/catalog/http/admin-catalog.controller.ts` (`GET admin/catalog/export.csv`), `lafoliecoffee/catalog/domain/services/catalog-csv.ts`                                                                                                                            |
| Matrice allergènes CSV/PDF, grille de prix CSV                                                  | `pim/catalogue/allergen-matrix/http/allergen-matrix.controller.ts`, `lafoliecoffee/pricing/http/admin-price-grid.controller.ts`                                                                                                                                              |
| Pas de restauration ; révisions = photos                                                        | `pim/catalogue/revision/http/catalog-revision.controller.ts`, `documentation/pim/flux-catalogue-et-versionnement.md` (« aucun point d'ancrage rejouable »)                                                                                                                   |
| Détacher une déclinaison en fiche : existe, limites                                             | `pim/catalogue/product/application/detach-product-variant.ts`, `product.ts` (défaut refusé, irréversible)                                                                                                                                                                    |
| Vente au poids : unité, minimum, pas en grammes, libres ; multiple du pas exigé à la commande   | `prisma/schema/pim/product.prisma` (`saleUnit`, `weightMinGrams`, `weightStepGrams`), `lafoliecoffee/orders/domain/services/sale-quantity-rules.ts`                                                                                                                          |
| Taux de TVA : pas de liste fermée, créés à l'écran                                              | `pim/vat-rates/domain/value-objects/vat-percent.ts`, `pim/vat-rates/application/create-vat-rate.ts`                                                                                                                                                                          |

**Non vérifié ce jour** : le rendu exact d'une fiche archivée dans la
boutique des particuliers (seule l'API a été lue) ; si une mercuriale déjà
posée sur une fiche archivée est re-vérifiée ailleurs ; la liste complète de
ce qui vise une famille dans `promotions/` (lu par recherche, pas en entier).
