# Charger le véhicule

> Sous-dossier de [`livraisons/`](../README.md), rangé le 2026-10-07 (Hugo).
> Les états ci-dessous sont ceux que chaque document déclare en tête.

Le plan de chargement des bacs au sol, la géométrie du plancher, et la bibliothèque d'achat des bacs.

| Doc                                                              | État et sujet                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`algorithme-de-chargement.md`](algorithme-de-chargement.md)     | ✅ implémenté — **L'algorithme du plan de chargement** : ordre inverse de la tournée, piles bornées par `maxStack` **et par le plafond de la caisse** (2026-10-06), pose au sol rangée par rangée, cohérence avant compactage. Relu le 2026-10-07. |
| [`plan-bibliotheque-d-achat.md`](plan-bibliotheque-d-achat.md)   | 🟡 B1–B5 bâtis ; reste B6 — La bibliothèque d'achat : véhicules et bacs candidats (au millimètre), scénarios, tableau croisé.                                                                                                                      |
| [`plan-piles-au-sol-revues.md`](plan-piles-au-sol-revues.md)     | 📐 plan                                                                                                                                                                                                                                            | Les piles au sol revues par Hugo (2026-10-08) : le jeu entre bacs devient un réglage, une pile peut monter sur un passage de roue, une pile qui ne tient pas ne bloque plus les suivantes. |
| [`plan-geometrie-du-plancher.md`](plan-geometrie-du-plancher.md) | ✅ G1–G6 bâtis — La géométrie du plancher : largeur libre, étages, assistant d'achat, chargement au sol ; bacs au millimètre, véhicule en centimètres.                                                                                             |

## Ce qui fait foi

- **Le plan de chargement** : `algorithme-de-chargement.md` décrit ce que le
  code pose au sol, piles, plafond, compactage et alertes.
- **Le plancher** : `plan-geometrie-du-plancher.md`, lots G1–G6 bâtis ; un
  type de bac se mesure au millimètre, un véhicule au centimètre.
- **Ce qui reste** : le lot B6 de la bibliothèque d'achat, et ses questions
  ouvertes (`plan-bibliotheque-d-achat.md`, § 3).
- La référence des bacs eux-mêmes — types, contenances, étiquettes, scan —
  vit dans `colisage/chargement-les-bacs.md`, hors de ce dossier.

Les autres thèmes du dossier, et les documents qui touchent la livraison sans
en être le sujet, sont listés dans l'[index du dossier](../README.md).
