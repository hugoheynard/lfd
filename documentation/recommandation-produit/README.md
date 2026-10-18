# La recommandation de produits — l'entrée du dossier

> Point d'entrée, relu contre le code le 2026-10-18 (commit `651b446d3`). Il
> dit ce qui existe, ce qui reste, et quelle doc lire pour chaque chose.

Recommander, c'est choisir **quels articles montrer** à un client, et lui dire
pourquoi. Aucun prix ne bouge : l'article sort toujours au prix que la boutique
résout déjà. Tout vit dans le commerce, contexte
`apps/lfd-api/src/b2b/recommendations/` (sauf la mise en avant, qui est une
décision du catalogue).

## 1. Trois sources d'une suggestion

| Source                                                  | Qui décide                                                                    | Où on la voit                                                     | État                                                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Décidée par le staff**                                | une règle « quand le client fait ceci, montre-lui cela », datée, par audience | carte au panier, sur la fiche, à l'accueil et après un ajout      | 🟡 panier, fiche, accueil, après-ajout, aperçu, chiffres bâtis                                                        |
| **Mise en avant « Incontournable »**                    | une case par article et par audience (pros, particuliers)                     | la pastille sur la vignette du rayon, selon l'audience du lecteur | ✅ bâtie                                                                                                              |
| **Calculée** (« souvent pris avec », « vos habituels ») | nos propres commandes, agrégées, sous un seuil de 5 clients distincts         | « souvent pris avec » au panier ; « vos habituels » à l'accueil   | 🟡 « souvent pris avec » bâti au panier (R2) ; « vos habituels » des pros bâti à l'accueil (R1) ; R3 après le cabinet |

La décidée passe **avant** la calculée, chacune dans sa place bornée (au
panier : une, puis une) ; les deux
passent le **même filtre** (servi à ce lecteur, commandable au jour visé,
absente du panier), sans repli : rien plutôt qu'un article qu'on ne peut pas
commander. La mise en avant reste hors des règles du staff pour l'instant
(lot RS4).

## 2. Les compteurs d'audience, anonymes

✅ Bâtis (lot R0). Une table `growth.product_audience_counters` compte, par jour
métier, article, geste, emplacement et **source** (`none`, `data`, `staff`) :
vues de fiche, ajouts au panier, suggestions affichées, cliquées, ajoutées.
**Aucun identifiant** de visiteur ni de client : c'est une mesure d'audience
exemptée de consentement. Contrepartie : une commande ne se relie pas à un
clic, donc ce qu'une suggestion fait **commander** est **estimé**.

## 3. Les audiences

Le mot sert à trois choses, à ne pas confondre :

- l'**audience d'un article** — `pro`, `public` ou les deux : à qui le
  catalogue le vend (et pour qui il peut être mis en avant) ;
- l'**audience d'une règle du staff** — à qui elle s'adresse ;
- les **segments de clientèle** (pro/particulier, activité, retrait/livraison,
  fidélité, résident/saisonnier/vacancier) — agrégés, jamais pour viser une
  personne : 🟡 le tableau des segments sûrs est bâti (A1, Analytics ›
  Audiences, [`audiences.md`](audiences.md)), avec la langue de la commande
  et le profil de séjour **estimé** (A3) ; la question déclarée (A2) et les
  suggestions par segment (A4) restent.

## 4. Les docs du dossier

| Doc                                                                        | Nature     | À quoi elle sert                                                                                                                                                                                 |
| -------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`suggestions-calculees.md`](suggestions-calculees.md)                     | doc d'état | « souvent pris avec » au panier (R2) : le calcul, le seuil, les exclusions, la mesure de coût, la place après le staff, l'aperçu, ce qui reste ; « vos habituels » des pros à l'accueil (R1, §8) |
| [`suggestions-du-staff.md`](suggestions-du-staff.md)                       | doc d'état | ce qui est bâti des suggestions du staff : la règle, l'ordre, l'affichage, le filtre, l'aperçu, les alertes, les conditions, les chiffres estimés                                                |
| [`plan-suggestions-du-staff.md`](plan-suggestions-du-staff.md)             | plan       | ce qui reste aux suggestions du staff : les segments de RS8, le reste de RS9, RS4                                                                                                                |
| [`plan-recommandation-de-produits.md`](plan-recommandation-de-produits.md) | plan       | le plan général : l'existant d'origine, les décisions R1–R5 bis, l'ordre des lots (R0, RS, R2, A1, R1, R3)                                                                                       |
| [`historique-du-particulier.md`](historique-du-particulier.md)             | analyse    | ce qu'il faut pour recommander à un particulier : finalité, base légale, interrupteur, rien pour un invité                                                                                       |
| [`plan-audiences.md`](plan-audiences.md)                                   | plan       | les segments de clientèle, leurs sources, le seuil de 5 clients, lots A1–A4 ; ce qu'A1 a lu, le NAF (Q4), la règle d'estimation d'A3                                                             |
| [`audiences.md`](audiences.md)                                             | doc d'état | le tableau des audiences bâti (A1, A3) : neuf coupes dont la langue de la commande et le profil de séjour estimé, périmètre, seuil, NAF, outil `audiences_read`                                  |
| [`outils-agent-suggestions.md`](outils-agent-suggestions.md)               | doc d'état | les neuf outils WebMCP des suggestions du staff                                                                                                                                                  |

La mise en avant par audience est décrite avec le catalogue :
[`../catalogue/catalogue-synchronise.md`](../catalogue/catalogue-synchronise.md)
(décisions locales, « La mise en avant est une décision par audience », et
l'écran Gestion Boutique › Mise en avant).
