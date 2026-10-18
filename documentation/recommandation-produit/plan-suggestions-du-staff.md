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

| Lot     | Contenu                                                                                                                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RS1** | Agrégat, écran Gestion Boutique › Suggestions, droit `lfc_suggestions`, lecture par emplacement                                                                                                                                                                                 |
| **RS2** | Affichage dans la boutique : panier (remplace la relance `CartUpsell`), fiche, accueil ; événements `suggestion_*` source `staff` — **le budget du paquet initial de la boutique est à ~120 octets du plafond** : l'affichage doit vivre dans des parties chargées à la demande |
| **RS3** | Chiffres par règle dans l'écran                                                                                                                                                                                                                                                 |
| **RS4** | La mise en avant entre dans les règles (Q4)                                                                                                                                                                                                                                     |

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
