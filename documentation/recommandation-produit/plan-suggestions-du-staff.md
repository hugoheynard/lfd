# Plan — les suggestions décidées par le staff : ce qui reste

> **Ce qui est bâti se lit dans [`suggestions-du-staff.md`](suggestions-du-staff.md)**
> (doc d'état, 2026-10-18) : la règle, l'ordre, le panier et la fiche, le
> filtre, l'aperçu, les chiffres estimés, l'écran, les outils agent. RS1, RS2
> (panier et fiche), RS3, RS5 et RS6 y sont fondus ; ce plan ne garde que ce
> qui reste, et les décisions qui s'y rattachent.
>
> C'est le lot **RS** de
> [`plan-recommandation-de-produits.md`](plan-recommandation-de-produits.md),
> placé avant « souvent pris avec » (R2). Hors argent (aucun prix ne bouge),
> hors migration de données, hors frontière de sécurité : pas de `vitruve`
> d'office (CLAUDE.md §9 bis).

## 1. Les décisions déjà prises (Hugo, 2026-10-18)

Elles valent pour tout ce qui suit.

- **Deux sources** : « il faut qu'on distingue les recos data driven et
  business driven — le staff décrète une suggestion ». Le décidé passe avant le
  calculé, dans une place bornée ; le calculé remplira le reste quand il
  existera (R2, R1).
- **Ordre réglable** : « il faut coder priorité, et mettre un switch pour que
  l'admin décide récente ou priorité ».
- **Une place au panier** (Q1) ; la fiche a pris la même, **à confirmer**. Pour
  l'accueil, la recommandation d'origine était 2 places sur 3 — à trancher
  avec RS7.
- **Titres par défaut** : « Notre conseil » au panier, « Vous aimerez aussi »
  sur la fiche. Celui de l'accueil est à choisir avec RS7.
- **Un ajout depuis une suggestion compte aussi `added_to_cart`** : le taux
  d'ajout global inclut les suggestions.
- **Pas de repli** : la relance codée en dur du panier est retirée, sans
  remplacement ; sans règle applicable, rien ne s'affiche.

Pris pour bâtir et non confirmés : la phrase française obligatoire s'il y a
phrase (Q2), 90 caractères par langue, une priorité de 0 à 999, « la plus
récente » = la plus récemment **créée**.

## 2. Ce qui reste

| Lot      | Quoi                                                                                                                                                                                                                                                                   | Pourquoi                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **RS7**  | **L'accueil** — le dernier emplacement : une règle `home` s'enregistre déjà et ne s'affiche nulle part ; son aperçu suit. Puis **l'après-ajout** (« Ajouté ! Vous aimerez aussi… »)                                                                                    | l'instant où une suggestion convertit le mieux                                      |
| **RS8**  | **Règles plus fines** : créneau horaire / jours de la semaine, seuil de panier (montant, « sans boisson »), site de retrait, segments ([plan des audiences](plan-audiences.md))                                                                                        | quand l'usage le demandera                                                          |
| **RS9**  | **Gestes du staff** : dupliquer une règle ; liste regroupée « à venir / en cours / finies » ; recherche dans le champ article (attend un combobox dans fold-ng)                                                                                                        | décliner une saison sans ressaisir                                                  |
| **RS10** | **Alerte** : une règle active dont l'article ne se vend plus (retiré, masqué, jamais commandable sur sa période) est signalée dans la liste                                                                                                                            | une règle vide ne doit pas passer inaperçue                                         |
| **RS4**  | **La mise en avant entre dans les règles** (Q4) — « partout, sans déclencheur, sans date ». Elle est une décision par audience depuis le 2026-10-18 (« Incontournable », [`catalogue-synchronise.md`](../catalogue/catalogue-synchronise.md)) et reste hors des règles | une fois l'écran des suggestions éprouvé, pour ne pas toucher deux écrans à la fois |

Ordre retenu : RS7, puis RS9 et RS10 ; RS8 à l'usage ; RS4 en dernier.

## 3. Ce que RS7 doit trancher

1. **Combien de places à l'accueil ?** _Recommandation d'origine : 2 sur 3._
2. **Quel titre par défaut à l'accueil** quand la règle n'a pas de phrase ?
3. **L'après-ajout** est-il un emplacement de plus (avec ses règles) ou la
   carte de la fiche réutilisée ? Un emplacement de plus est une query de plus
   qui apporte son déclencheur à `StaffSuggestionShowcase` — pas une branche.
4. **Le paquet initial** : comme le panier et la fiche, la requête doit vivre
   dans un morceau chargé à la demande.
