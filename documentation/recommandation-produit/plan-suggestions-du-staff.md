> 🟡 **RS2 bâti pour le PANIER le 2026-10-18** (non commité à l'écriture ;
> Hugo : « au moins pour le panier »). Ce qui existe : la query
> `ReadCartSuggestionsQuery` (`b2b/recommendations/application/queries/`),
> servie par `POST /shop/suggestions/cart` (publique, lecteur particulier) et
> `POST /shop/suggestions/cart/mine` (l'espace courant décide du lecteur, comme
> `/shop/catalogue/mine`) — contrat `packages/contracts/src/cart-suggestions.ts`.
> Elle prend les règles applicables, garde celles dont le déclencheur est vrai
> pour ce panier (`everywhere`, `product_in_cart`, `category_in_cart` — la
> famille lue au catalogue servi, lignée comprise), passe `RecommendationFilter`,
> et rend l'article à son prix de vitrine (`ShopCataloguePricing`) avec la
> raison `{ source: 'staff', ruleId, phrase }`. Côté boutique,
> `StaffCartSuggestion` (`client/cart/`) montre la suggestion du staff, et
> **rien** sans règle applicable : la relance codée en dur `CartUpsell` (et sa
> liste `TREATS`) est **retirée** le 2026-10-18 (Hugo), sans repli. La requête
> vit dans un morceau chargé à la demande ; les compteurs
> `suggestion_shown|clicked|added` partent en source `staff`, emplacement = id
> de la règle en minuscules.
>
> **Tranché par Hugo le 2026-10-18** : **1 place** pour le décidé au panier
> (`STAFF_CART_PLACES`, Q1) ; une langue sans phrase dit « Notre conseil »
> traduit (Q2) ; un ajout depuis une suggestion compte AUSSI `added_to_cart`
> (taux d'ajout global inclusif) ; la carte écrit le **prix** de l'article dans
> l'assiette du rayon — HT à un pro, TTC à un particulier — par la même
> fonction que la vignette (`shelfPriceLabel`, `client/shop/shop-price-basis.service.ts`).
> Le calculé qui remplirait le reste n'existe pas encore. **L'accueil reste
> à faire** (RS2), comme RS4.

> 🟡 **RS2 bâti pour la FICHE le 2026-10-18** (non commité à l'écriture ;
> Hugo : « est-ce qu'on fait sur la fiche de l'article ? » → oui). La query
> `ReadProductSuggestionsQuery`, servie par `POST /shop/suggestions/product`
> (publique) et `POST /shop/suggestions/product/mine` — contrat
> `packages/contracts/src/product-suggestions.ts`, même vue d'article que le
> panier. Le panier et la fiche passent par le même service applicatif,
> `StaffSuggestionShowcase` (règles applicables, filtre R4, prix de vitrine,
> place bornée) ; chacun n'apporte que son déclencheur
> (`domain/services/cart-suggestions.ts`, `product-suggestions.ts`). Sur la
> fiche : `everywhere`, et `product_viewed` sur l'article ouvert ; un
> déclencheur de panier n'y vaut jamais ; l'article de la fiche n'est jamais
> proposé ; **1 place** (`STAFF_PRODUCT_PLACES`, même hypothèse que le
> panier — à confirmer par Hugo). Côté boutique, la carte est un composant
> partagé (`client/suggestions/staff-suggestion-card/`), posée sous l'article
> de `ProductSheet` par `StaffProductSuggestion` : une requête par ouverture
> de fiche (panier et jour visé lus au départ), rien en SSR, morceau chargé à
> la demande, mêmes compteurs `suggestion_*` source `staff` et
> `added_to_cart` à l'ajout.
>
> **Tranché par Hugo le 2026-10-18** : sur la fiche, une règle sans phrase
> dans la langue du client dit **« Vous aimerez aussi »** (`shop.alsoLike` ;
> EN « You may also like », IT « Potrebbe piacerti anche ») ; « Notre
> conseil » reste le défaut du panier. La carte reçoit son titre par défaut
> de l'emplacement.

# Plan — les suggestions décidées par le staff

> 🟡 **RS1 et RS3 bâtis le 2026-10-18** (non commités à l'écriture de ce
> bandeau ; Hugo : « on peut faire tout l'admin recommandation staff »). Ce qui
> existe : l'agrégat `StaffSuggestionRule` et le réglage de l'ordre dans
> `apps/lfd-api/src/b2b/recommendations/` (tables `public.staff_suggestion_rules`
> et `public.staff_suggestion_order_settings`), le droit `lfc_suggestions`
> (accordé à l'écran, jamais en migration), les routes `/admin/suggestions`,
> la lecture des règles applicables (période, audience, interrupteur, ordre —
> **sans** déclencheur ni filtre R0, qui sont de RS2), l'écran Gestion
> Boutique › Suggestions avec ses chiffres par règle, et la trousse
> [`outils-agent-suggestions.md`](outils-agent-suggestions.md). **RS2 et RS4
> restent à faire.**
>
> Pris pour bâtir, à confirmer par Hugo : **Q2** — phrase française
> obligatoire s'il y a phrase, anglais et italien facultatifs ; **Q4** — la
> mise en avant reste hors des règles ; **Q1** — ne concerne que l'affichage
> (RS2). Et quatre valeurs que le plan laissait ouvertes : la phrase est bornée
> à **90 caractères** par langue ; la priorité va de **0 à 999** ; « la plus
> récente » est la plus récemment **créée** (une réécriture ne la fait pas
> passer devant) ; « une fiche ouverte ne déclenche pas au panier » est
> généralisé — un déclencheur de panier ne vaut qu'au panier, une fiche
> ouverte qu'en fiche, « partout » partout.

> 📐 **Doc-first, rien n'est bâti** (Hugo, 2026-10-18 : « il faut qu'on
> distingue les recos data driven et business driven — le staff décrète une
> suggestion », puis « j'ai besoin d'une doc à part pour la reco staff »).
> C'est le lot **RS** de
> [`plan-recommandation-de-produits.md`](plan-recommandation-de-produits.md),
> placé **avant** « souvent pris avec » (R2) ; ce document en est le détail et
> prime sur le §2 bis du plan général pour tout ce qui concerne le staff.
>
> Hors argent (aucun prix ne bouge : la suggestion montre un article au prix
> que la boutique résout déjà), hors migration de données (une table neuve),
> hors frontière de sécurité : pas de `vitruve` d'office (CLAUDE.md §9 bis).

## 1. Ce que c'est

Une suggestion **décidée** est une règle posée par le staff : « quand le client
fait ceci, montre-lui cela ». Elle dit ce que la maison **veut** vendre — un
accord produit, la saison, une nouveauté, un stock à écouler, une marge — là où
la suggestion **calculée** dit ce que les clients **font**.

| Exemple                                          | Déclencheur            | Suggéré          | Où      |
| ------------------------------------------------ | ---------------------- | ---------------- | ------- |
| « Avec un croissant, le café du matin »          | croissant au panier    | café             | panier  |
| « Cette semaine, la galette »                    | partout                | galette          | accueil |
| « Sur la fiche du pain de campagne, la terrine » | fiche pain de campagne | terrine des amis | fiche   |
| « Aux pros, la nouvelle tarte »                  | partout, audience pros | tarte            | accueil |

## 2. La règle

| Champ           | Ce qu'il porte                                                                              | Refusé si…                                                                    |
| --------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Déclencheur** | `everywhere` · `product_in_cart(sku)` · `category_in_cart(famille)` · `product_viewed(sku)` | il nomme un article ou une famille inconnus                                   |
| **Suggérés**    | 1 à 3 articles (SKU), dans l'ordre voulu                                                    | vide, ou un article égal au déclencheur                                       |
| **Emplacement** | `cart` · `product` · `home`                                                                 | incohérent avec le déclencheur (une fiche ouverte ne déclenche pas au panier) |
| **Audience**    | `pro` · `public` · `both` ; un segment du [plan des audiences](plan-audiences.md) plus tard | —                                                                             |
| **Période**     | début **et** fin, obligatoires                                                              | fin avant début, ou fin passée à la création                                  |
| **Phrase**      | facultative, en FR (EN et IT si renseignées) — sinon « Notre conseil »                      | trop longue (borne à fixer)                                                   |
| **Active**      | interrupteur, pour couper sans supprimer                                                    | —                                                                             |

C'est un **agrégat** (des règles peuvent refuser une écriture), dans
`apps/lfd-api/src/b2b/recommendations/`, le contexte ouvert par R0
(commit `2bab7e355`). Pas de suppression physique : une règle s'archive.

## 3. À l'affichage

Pour un emplacement et un lecteur donnés :

1. **Les règles qui s'appliquent** : actives, dans leur période (jour métier,
   port `Clock`), de la bonne audience, dont le déclencheur est vrai (panier
   ou fiche ouverte).
2. **Le même filtre que le calculé** — `RecommendationFilter` de R0 : servi à
   ce lecteur, commandable au jour visé, absent du panier. Une suggestion
   décidée sur un article qui ne passe pas **disparaît** ; elle ne force jamais
   la vente d'un article indisponible.
3. **Le décidé d'abord, dans une place bornée** (Q1), le calculé remplit le
   reste. Plusieurs règles en concurrence : la plus **récente** d'abord (Q3).
4. **La raison** affichée : la phrase du staff, sinon « Notre conseil ».

## 4. La mise en avant existante

`SetCatalogFeaturedCommand(sku, featured, decidedBy)`
(`apps/lfd-api/src/b2b/catalog/application/commands/set-catalog-featured.command.ts`)
est déjà une suggestion décidée — la plus simple : partout, sans déclencheur,
sans date. Elle **reste** au lot RS (le catalogue l'affiche déjà en rayon) ;
la faire entrer dans les règles est un lot suivant, pour ne pas toucher deux
écrans à la fois (Q4).

## 5. L'écran

**Gestion Boutique › Suggestions**, à côté des Opérations, des Promotions et de
la Fidélité (les Opérations y sont depuis le 2026-10-13,
`apps/lfd-backoffice-frontend/src/app/shared/workspace-rail/workspaces.ts:521`).
Une liste des règles (active, période, déclencheur → suggérés, emplacement,
audience), un panneau d'édition fold, et pour chaque règle ses chiffres :
affichée, cliquée, ajoutée.

**Droit** : une ressource staff neuve (`lfc_suggestions`), lecture et
écriture. Elle s'**accorde à l'écran** (`/admin/staff-roles`), jamais par
migration (`lint:no-role-grants-in-migrations`).

## 6. La mesure

Les compteurs anonymes de R0 portent la **source** (`staff` pour une règle,
`data` pour le calculé — en cours d'ajout le 2026-10-18) et l'**emplacement**.
Pour comparer les règles entre elles, l'emplacement d'un événement `staff`
porte l'**identifiant de la règle** (`[a-z0-9_]{1,32}`, ce que le domaine de
R0 admet déjà ; un ULID en minuscules y tient). « Commandée » se lit dans les
commandes, comme pour le calculé.

## 7. Lots

| Lot     | Contenu                                                                                                                                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **RS1** | Agrégat, écran Gestion Boutique › Suggestions, droit `lfc_suggestions`, lecture par emplacement                                                                                                                                                                                      |
| **RS2** | Affichage dans la boutique : panier (la relance `CartUpsell` est retirée le 2026-10-18, sans repli), fiche, accueil ; événements `suggestion_*` source `staff` — le plafond du paquet initial est relevé à 1,40 Mo depuis le 2026-10-18 ; les requêtes restent chargées à la demande |
| **RS3** | Chiffres par règle dans l'écran                                                                                                                                                                                                                                                      |
| **RS4** | La mise en avant entre dans les règles (Q4)                                                                                                                                                                                                                                          |

## 8. Questions à Hugo

> **Q3 tranchée le 2026-10-18 (Hugo)** : « il faut coder priorité, et mettre un
> switch pour que l'admin décide récente ou priorité ». Chaque règle porte une
> **priorité** (entier, plus haut = d'abord) ; un **réglage de la boutique**,
> unique, choisit l'ordre appliqué entre règles concurrentes : `recent` (la
> plus récente d'abord) ou `priority` (la priorité, puis la plus récente à
> égalité). Le réglage vit dans l'écran Suggestions, sous le même droit
> `lfc_suggestions` ; son changement est journalisé. Les deux sont au lot RS1.

1. **Combien de places pour le décidé ?** _Recommandation : 1 sur 3 au
   panier et sur la fiche, 2 sur 3 à l'accueil._ Assez pour pousser, pas assez
   pour écraser ce que les clients font.
2. **La phrase : en trois langues ?** _Recommandation : FR obligatoire si
   phrase, EN et IT facultatives_ — la boutique parle trois langues, le reste
   tombe sur « Notre conseil » traduit.
3. **Plusieurs règles en concurrence : la plus récente, ou une priorité
   réglable ?** _Recommandation : la plus récente_ ; une priorité ne vaut que
   le jour où il y a beaucoup de règles.
4. **La mise en avant devient-elle une règle ?** _Recommandation : plus tard
   (RS4)_, une fois l'écran des suggestions éprouvé.

## 9. Pour être au meilleur niveau (Hugo, 2026-10-18)

« Qu'est-ce qui nous manque dans les suggestions staff, pour que ce soit au
niveau top ? » — l'inventaire, dans l'ordre retenu :

| Lot      | Quoi                                                                                                                                                                                                                                                                                                                                                                              | Pourquoi                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **RS5**  | **Aperçu dans l'admin** : choisir un emplacement (panier avec ses articles, ou fiche), une audience, un jour → la carte exacte que verrait le client ; et **pourquoi une règle ne s'affiche pas** (finie, pas encore commencée, coupée, mauvaise audience, déclencheur faux, article non servi / non commandable ce jour-là / déjà au panier, battue par une règle mieux classée) | aujourd'hui une règle muette ne dit rien — constaté en dev le 2026-10-18 |
| **RS6**  | **« Commandées »** par règle : les commandes passées qui contiennent l'article suggéré après un ajout par la suggestion (jointure compteurs × lignes de commande, sans identifiant de personne), taux d'ajout et **chiffre d'affaires apporté**                                                                                                                                   | le vrai résultat, au-delà du clic                                        |
| **RS7**  | **L'accueil** (dernier emplacement) et **l'après-ajout** (« Ajouté ! Vous aimerez aussi… »)                                                                                                                                                                                                                                                                                       | l'instant où une suggestion convertit le mieux                           |
| **RS8**  | **Règles plus fines** : créneau horaire / jours de la semaine, seuil de panier (montant, « sans boisson »), site de retrait, segments ([plan des audiences](plan-audiences.md))                                                                                                                                                                                                   | quand l'usage le demandera                                               |
| **RS9**  | **Gestes du staff** : dupliquer une règle ; liste regroupée « à venir / en cours / finies » ; recherche dans le champ article (attend un combobox dans fold-ng)                                                                                                                                                                                                                   | décliner une saison sans ressaisir                                       |
| **RS10** | **Alerte** : une règle active dont l'article ne se vend plus (retiré, masqué, jamais commandable sur sa période) est signalée dans la liste                                                                                                                                                                                                                                       | une règle vide ne doit pas passer inaperçue                              |

Ordre : RS5, RS6, RS7 — ce qui rend l'outil utilisable au quotidien ; RS8 à
l'usage. **RS5 lancé le 2026-10-18.**
