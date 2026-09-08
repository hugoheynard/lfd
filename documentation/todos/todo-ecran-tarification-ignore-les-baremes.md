# L'écran de tarification n'annonce pas le prix que la caisse facture

**Ouvert le 2026-09-08.** 🔴 Défaut mesuré, non corrigé. Écran en service.

> Trouvé en cherchant autre chose : Hugo signalait un écart entre un prix de
> mercuriale et ce que la boutique affichait. La mercuriale n'était pas en
> cause — l'écart venait d'ailleurs, et il est plus large.

---

## Le fait

Sur le même article, à la même quantité, à la même audience :

| Chemin                                         | Abricotin (VIE-012), quantité 1 |
| ---------------------------------------------- | ------------------------------- |
| `GET /admin/pricing` — l'écran de tarification | **1,83924 €**                   |
| `POST /shop/quote` — ce que la caisse facture  | **1,65532 €**                   |

Exactement **−10 %** d'écart, et il porte un nom : un barème de volume
« Test » posé sur le rayon `viennoiserie`, dont l'unique palier s'ouvre **à
partir d'une pièce**.

## La cause, en deux lignes de code

**La caisse convertit les barèmes en règles avant de résoudre :**

```ts
// b2b/orders/domain/services/price-line.ts
const volumeRules = ladders.map((ladder) => ladderAsRule(ladder, context))…
resolvePrice(canonical, [...rules, ...volumeRules], context, floor);
```

**L'écran ne le fait pas :**

```ts
// b2b/pricing/application/board-item.ts
resolvePrice(article.canonicalMillicents, materials.rules, context, applied);
//                                        ^^^^^^^^^^^^^^^ les règles SEULES
```

Les barèmes n'entrent dans l'écran que par `volumeTierPrices`, qui remplit la
colonne des paliers — une lecture à côté du prix, jamais dedans.

## Pourquoi ça n'a pas été vu plus tôt

Tant qu'un barème s'ouvre à 50 ou à 1 000 pièces, l'écran a **raison** de ne pas
l'appliquer : il résout à la quantité 1, et à 1 le palier ne joue pas. Le défaut
n'apparaît qu'avec un palier ouvert **dès la première pièce** — un cas que rien
n'interdit, et que le premier essai de barème produit naturellement.

C'est le quatrième exemple de ce que
[`ecrans-de-tarification.md`](../pricing/ecrans-de-tarification.md) appelle « un
écran qui recalcule de son côté » ; les trois autres y sont déjà racontés.

## Ce que ça touche, et qui n'est pas seulement cet écran

- **L'écran de tarification général** — sa colonne « prix final » ;
- **l'onglet Tarifs d'une fiche client** (2026-09-08) — il monte ses lignes avec
  le même `itemView`, donc il hérite du même écart ;
- **la vitrine au prix du client** (`/shop/catalogue/mine`, 2026-09-08) — elle,
  passe par `OrderLinePricing`, donc par le chemin de la caisse.

Les deux écrans livrés le même jour se **contrediraient** sur le prix d'un même
client dès qu'un barème s'ouvre à 1. Aujourd'hui aucun n'existe en dev — le
rechargement du jeu de données les retire depuis ce jour — donc le symptôme est
invisible. **Le défaut, lui, est intact.**

## La correction attendue

Faire entrer les barèmes dans le matériau de l'écran, comme la caisse le fait :
`boardMaterials` les reçoit déjà (`loaded.ladders` traverse `categoryView`), il
leur manque le passage par `ladderAsRule` avant `resolvePrice`.

Deux points à trancher en le faisant :

1. **La colonne des paliers doit-elle rester ?** Oui — elle répond à « et si
   j'en commandais mille », que le prix à 1 ne dit pas. Mais elle cesserait
   d'être la seule trace du barème.
2. **La trace du prix** gagnerait une étape `volume` sur les articles concernés.
   C'est le comportement juste : c'est ce que la caisse fait, et l'écran est
   censé montrer ce qu'elle fait.

## Ce qui ne corrigerait pas le défaut

Retirer les barèmes du jeu de données — c'est ce qui a été fait le 2026-09-08,
et ça ne fait que cacher le symptôme. Le premier barème reposé à la main sur un
poste, ou en production, rouvre l'écart sans rien changer au code.
