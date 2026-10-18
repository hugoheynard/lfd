# Plan — les suggestions décidées par le staff : ce qui reste

> **Ce qui est bâti se lit dans [`suggestions-du-staff.md`](suggestions-du-staff.md)**
> (doc d'état, 2026-10-18) : la règle, l'ordre, le panier, la fiche, l'accueil
> et l'après-ajout, le filtre, l'aperçu, les chiffres estimés, l'écran, les
> outils agent. RS1, RS2 (panier et fiche), RS3, RS5, RS6 et RS7 y sont
> fondus ; ce plan ne garde que ce
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
- **Une place au panier** (Q1) ; la fiche a pris la même, **à confirmer**.
- **Titres par défaut** : « Notre conseil » au panier, « Vous aimerez aussi »
  sur la fiche.
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
| **RS8**  | **Règles plus fines** : créneau horaire / jours de la semaine, seuil de panier (montant, « sans boisson »), site de retrait, segments ([plan des audiences](plan-audiences.md))                                                                                        | quand l'usage le demandera                                                          |
| **RS9**  | **Gestes du staff** : dupliquer une règle ; liste regroupée « à venir / en cours / finies » ; recherche dans le champ article (attend un combobox dans fold-ng)                                                                                                        | décliner une saison sans ressaisir                                                  |
| **RS10** | **Alerte** : une règle active dont l'article ne se vend plus (retiré, masqué, jamais commandable sur sa période) est signalée dans la liste                                                                                                                            | une règle vide ne doit pas passer inaperçue                                         |
| **RS4**  | **La mise en avant entre dans les règles** (Q4) — « partout, sans déclencheur, sans date ». Elle est une décision par audience depuis le 2026-10-18 (« Incontournable », [`catalogue-synchronise.md`](../catalogue/catalogue-synchronise.md)) et reste hors des règles | une fois l'écran des suggestions éprouvé, pour ne pas toucher deux écrans à la fois |

Ordre retenu : RS9 et RS10 ; RS8 à l'usage ; RS4 en dernier.

## 3. Pris pour bâtir RS7, non confirmés

RS7 est bâti (2026-10-18) et décrit dans
[`suggestions-du-staff.md`](suggestions-du-staff.md) §4. Trois choix y ont été
faits sur la consigne du lot, sans décision écrite de Hugo :

1. **Deux places à l'accueil** — la recommandation d'origine (« 2 sur 3 »).
2. **« Notre sélection »** comme titre par défaut à l'accueil (« Our picks »,
   « La nostra selezione »).
3. **L'après-ajout n'est pas un emplacement** : c'est la suggestion du panier
   recalculée avec l'article entré, et il ne paraît pas sans règle applicable.
