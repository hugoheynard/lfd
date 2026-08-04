# Conditionnements (PIM) × prix (canonique PIM + dégressif B2B)

> **But.** Modéliser les **conditionnements** (unité, sachet de 10, carton de 50…)
> et le **prix** proprement, en séparant ce qui est un **fait produit** (PIM) de ce
> qui est une **décision commerciale** (B2B). Se reflète en B2B par un **select de
> conditionnements** (qui remplace le toggle unité/pack provisoire) + un prix résolu.
>
> Statut : **conception, rien d'implémenté.** Date : 2026-08-04.
> Voisin : [`audit-catalogue-boutique-b2b.md`](audit-catalogue-boutique-b2b.md).

## Point de départ (ce qui existe déjà)

- Le PIM a **`ProductVariant`** = « la **déclinaison**, l'unité réellement vendue
  (R4) » : `sku` propre, `options` (JSON), `attributes` (JSON), `isDefault`,
  `position`. Tout produit naît **avec sa déclinaison par défaut** (invariant
  transactionnel — `product-commands.service.ts`).
- **Le PIM ne porte AUJOURD'HUI ni prix ni `unitsPerPack`.** Le prix vit dans le
  **seed B2B** (`catalogue-seed.ts`, hardcodé du CSV). Le contrat de commande
  (`packages/contracts/src/order.ts`) dit déjà « le serveur ré-résout les prix
  depuis le catalogue (autorité) » — l'intention est là, le branchement non.
- Provisoire côté B2B : `FoldProduct` a gagné `step`/`packLabel` + un toggle
  unité↔pack sur la carte. **Ce toggle est un cas particulier** du select de
  conditionnements ci-dessous — il sera remplacé.

## Le modèle en couches

```
┌─ PIM — faits produit (channel-agnostic) ─────────────────────────────┐
│ Product                                                              │
│  └─ variants[] = CONDITIONNEMENTS (déclinaisons)                      │
│       · option "conditionnement" : "À l'unité" | "Carton de 50" …     │
│       · unitsPerPack : 1 | 50 …           (fait structurel)           │
│       · sku propre                         (le pro commande par réf)  │
│       · prix CANONIQUE de base (unité et/ou par variante/pack)        │
│         = le TARIF de référence, PRÉ-altération                       │
└──────────────────────────────────────────────────────────────────────┘
                 │  (le PIM expose structure + prix canonique)
                 ▼
┌─ B2B — pricing commercial (altérations) ─────────────────────────────┐
│ Résout (variant, quantité, [client]) → prix final :                  │
│   · dégressif DE VOLUME (achète 5 cartons → -x%)                      │
│   · remises retrait / frais de zone (CartAdjustment — déjà là)        │
│   · prix négocié client (plus tard)                                  │
│ Prend le prix canonique PIM en entrée, l'ALTÈRE. Jamais dans le PIM.  │
└──────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌─ B2B — UI catalogue ─────────────────────────────────────────────────┐
│ <fold-select> conditionnements   ← alimenté par la STRUCTURE PIM      │
│ prix HT + sous-total             ← résolu par le PRICING B2B          │
└──────────────────────────────────────────────────────────────────────┘
```

**La frontière clé.** Le PIM porte le **prix canonique** (le tarif : le carton a
son prix de liste, l'unité le sien — un fait catalogue). Le B2B porte les
**altérations** : dégressif *de volume*, remises, négocié. Le « carton moins cher
à l'unité » n'est donc PAS un dégressif — c'est simplement le prix de liste du
carton, dans le PIM. Le dégressif, lui, dépend de la **quantité commandée** (ou du
client), et vit côté B2B.

## Décisions (verrouillées 2026-08-04)

1. **Conditionnement = `ProductVariant`** (déclinaison), distingué par une option
   `conditionnement`. On réutilise la machinerie existante (SKU par variante,
   `isDefault`, `position`) — pas de nouveau modèle.
2. **`unitsPerPack` = colonne dédiée** sur `ProductVariant` (fait structurel,
   requête-able), pas dans `attributes` JSON.
3. **Prix canonique de base DANS le PIM** — unité et/ou par variante (pack). C'est
   le **tarif de référence, pré-altération**. (À trancher au moment de coder :
   `priceCents` sur la variante, devise, HT.)
4. **Dégressif de volume + altérations = couche pricing B2B**, jamais le PIM. Elle
   prend le prix canonique PIM en entrée. S'appuie sur la résolution serveur
   existante (celle des `CartAdjustment`).
5. **Le B2B reflète les conditionnements par un `fold-select`** (≥2), qui remplace
   le toggle unité↔pack. 1 seul conditionnement → pas de select.

## Chantier (ordre)

**Phase PIM (structure + prix canonique) — on commence ici.**

- [ ] Schéma : `ProductVariant.unitsPerPack` (Int) + prix canonique
      (`priceCents` Int?, à cadrer) + convention pour l'option `conditionnement`.
- [ ] Domaine / commands / events : créer/éditer une déclinaison-conditionnement
      (respecter l'event-sourcing + les ADRs du PIM).
- [ ] **UI fiche produit** : éditer les déclinaisons (conditionnements) + le prix
      canonique. → **Prérequis UX ci-dessous.**

**UX fiche produit — bug/refonte à faire d'abord :**

- [ ] Aujourd'hui « Éditer » ouvre une **div au-dessus de la table** ; ça doit
      **ouvrir la page produit** (route dédiée, comme `create-product`). L'édition
      d'un produit = une vraie page, pas un panneau inline — c'est là que les
      déclinaisons + prix canonique se géreront.

**Phase B2B (pricing + UI) — ensuite.**

- [ ] Consommer les conditionnements PIM (remplacer le seed hardcodé).
- [ ] Couche pricing : résoudre le prix canonique par variante, puis appliquer le
      dégressif de volume + altérations.
- [ ] Catalogue : `fold-select` de conditionnements (carte + order-pad), le pas du
      stepper = `unitsPerPack` du conditionnement choisi, prix/sous-total via le
      pricing. Retirer le toggle unité↔pack provisoire.

## À trancher au moment de coder (pas bloquant maintenant)

- **Forme du prix canonique** : par variante uniquement, ou prix unité de base +
  dérivation par pack ? (Reco : prix **par variante** — chaque conditionnement a
  son tarif de liste ; l'unité EST une variante.)
- **Forme du dégressif B2B** : paliers de quantité (buy N+ → -x%) vs grille par
  client. (Reco : paliers de quantité d'abord.)
- **Devise / HT** : `priceCents` entier, HT, EUR (aligné sur le contrat commande).
