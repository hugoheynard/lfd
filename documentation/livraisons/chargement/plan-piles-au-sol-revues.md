# Les piles au sol, revues par Hugo (G5a, G5b, G5c)

> 📐 **Plan, rien de bâti** (2026-10-08). Hugo a revu trois des décisions
> par défaut du lot G5 ([`../tournees/decisions-par-defaut-2026-10-02.md`](../tournees/decisions-par-defaut-2026-10-02.md),
> § 6) :
>
> - **G5a** : « ça doit être une donnée, pour l'instant à mettre dans Point de
>   départ avec les autres réglages » ;
> - **G5b** : « pourtant le simulateur arrive à les placer » ;
> - **G5c** : « livrer emporte sur léger désordre ».
>
> Migration additive seulement (une colonne avec défaut) : hors des cas de
> `vitruve`. Affirmations vérifiées dans le code le 2026-10-08.

## 1. Ce qui existe

- **Le plan de chargement** (`planLoading`, `delivery/domain/services/loading-plan.ts:120`)
  pose les piles au sol par `FloorPlacer` (`services/floor/place-stacks.ts`,
  stratégie B, G-D4) : dans l'ordre de chargement (dernier arrêt d'abord),
  dans la rangée ouverte, sinon une rangée neuve, sinon hors plancher
  (`off_floor`, alerte `floor_over`). Il est lu par l'écran de chargement
  (`get-delivery-loading-plan.handler.ts:55`) **et** par la garde de capacité
  de « Proposer » (`capacity-guard.ts:95`, CA4) — changer le placement change
  ce que « Proposer » accepte.
- **Le jeu** : constante `BIN_GAP_DEFAULT_CM = 1` (`value-objects/bin-gap.ts:10`),
  lue à `loading-plan.ts:165`. L'assistant d'achat a son propre jeu, dans sa
  requête (0 à 10 cm).
- **Les passages de roue** : au sol, aucune pile dessus (`freeWidthMm`) ; une
  rangée qui les touche se centre entre eux. L'assistant d'achat, lui, pose
  par-dessus : à partir de l'étage `k₀ = ⌈hauteur du passage ÷ hauteur
extérieure du bac⌉`, soit `étages − k₀` bacs (`maximize-format.ts:139-218`,
  `overArchCount`). Sans hauteur de passage mesurée, rien par-dessus.
- **Une pile qui ne tient pas bloque les suivantes** (`FloorPlacer.place`,
  `this.blocked`) : toutes sortent.
- **Les réglages du calcul** vivent dans `delivery.delivery_routing_settings`
  et se saisissent sur la carte « Calcul des tournées » de Livraison →
  Réglages → Point de départ, comme le contenant par défaut (CA4b).

## 2. Ce qui change

### P1 — G5a : le jeu entre bacs devient un réglage

- Colonne `bin_gap_cm` dans `delivery.delivery_routing_settings`, entière,
  **défaut 1**, CHECK 0 à 10 (la borne de l'assistant). Migration additive.
- Le réglage entre dans `RoutingSettings` (défaut 1), le contrat de lecture et
  d'écriture des réglages (champ absent = valeur gardée, comme le contenant
  par défaut), le journal `delivery_routing.settings_updated`.
- `planLoading` reçoit le jeu en paramètre au lieu de lire la constante ;
  ses appelants (écran de chargement, garde de capacité, place suggérée) le
  lisent des réglages. `BIN_GAP_DEFAULT_CM` ne reste que comme défaut.
- Carte « Calcul des tournées » : un champ « Jeu entre bacs (cm) », 0 à 10.

### P2 — G5b : une pile peut monter par-dessus un passage de roue

- La règle de l'assistant d'achat, appliquée au plan de chargement : quand une
  pile ne tient pas dans la largeur libre au sol d'une rangée qui touche les
  passages, elle peut se poser **au-dessus d'un passage**, à partir de
  l'étage `k₀`, avec au plus `étages − k₀` bacs. Sans hauteur de passage
  mesurée : comme aujourd'hui.
- Une pile posée au-dessus d'un passage a son placement à elle (au-dessus de
  quel passage, à partir de quelle hauteur) pour que l'écran de chargement le
  dise au livreur ; sa hauteur bornée compte dans `canGrow` (on n'y monte pas
  au-delà).
- **Une même règle** : réutiliser `k₀` et `étages − k₀` de
  `maximize-format.ts` plutôt que les recopier.

### P3 — G5c : livrer l'emporte sur un léger désordre

- Une pile qui ne tient pas sort (`off_floor`, alerte `floor_over` pour elle)
  **sans bloquer les suivantes** : chacune essaie encore la rangée ouverte,
  puis une rangée neuve. Les piles posées restent dans l'ordre entre elles ;
  seule la pile sortie est à caser à la main.
- L'alerte nomme les piles sorties, et elles seules.
- Conséquence pour « Proposer » : moins de refus `floor_over`, donc des
  tournées un peu plus chargées. Mesurer sur le banc
  (`bench:composition:quality`) et réenregistrer la référence si le
  changement est accepté.

## 3. Tests

- Domaine : le jeu lu du réglage ; une pile au-dessus d'un passage (étages
  bornés, sans hauteur mesurée → refus) ; une pile sortie qui ne bloque plus
  la suivante plus petite.
- e2e : le réglage s'écrit et se relit, refus hors de 0 à 10.
- Front : le champ de la carte.
