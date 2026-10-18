# Plan — les suggestions décidées par le staff : ce qui reste

> **Ce qui est bâti se lit dans [`suggestions-du-staff.md`](suggestions-du-staff.md)**
> (doc d'état, 2026-10-18) : la règle, l'ordre, le panier, la fiche, l'accueil
> et l'après-ajout, le filtre, l'aperçu, les chiffres estimés, l'écran, les
> outils agent, les alertes, les conditions facultatives. RS1, RS2 (panier et fiche), RS3, RS5, RS6, RS7, RS10, RS9 (sauf la
> recherche d'article) et RS8 (sauf les segments) y sont
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

| Lot     | Quoi                                                                                                                                                                                                                                                                                                                                                     | Pourquoi                                                                            |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **RS8** | **Les segments** ([plan des audiences](plan-audiences.md)) — le reste de RS8 : créneau horaire et jours, seuil de panier (montant, « sans boisson ») et point de retrait sont bâtis (2026-10-18, [`suggestions-du-staff.md`](suggestions-du-staff.md) §2.1). **Bloqué** : le lot A1 des audiences, qui définirait les segments sûrs, n'existe pas encore | quand A1 sera bâti                                                                  |
| **RS9** | **Recherche dans le champ article** — le reste de RS9 ; dupliquer et la liste regroupée sont bâtis (2026-10-18). Attend un **combobox** dans fold-ng : c'est un chantier fold, pas applicatif                                                                                                                                                            | retrouver un article sans dérouler le catalogue                                     |
| **RS4** | **La mise en avant entre dans les règles** (Q4) — « partout, sans déclencheur, sans date ». Elle est une décision par audience depuis le 2026-10-18 (« Incontournable », [`catalogue-synchronise.md`](../catalogue/catalogue-synchronise.md)) et reste hors des règles                                                                                   | une fois l'écran des suggestions éprouvé, pour ne pas toucher deux écrans à la fois |

Ordre retenu : le reste de RS9 dès que fold-ng sert un combobox ; les
segments de RS8 après le lot A1 des audiences ; RS4 en dernier. RS10 (l'alerte) est bâti le
2026-10-18 et décrit dans [`suggestions-du-staff.md`](suggestions-du-staff.md) §13.

## 3. Pris pour bâtir RS7, non confirmés

RS7 est bâti (2026-10-18) et décrit dans
[`suggestions-du-staff.md`](suggestions-du-staff.md) §4. Trois choix y ont été
faits sur la consigne du lot, sans décision écrite de Hugo :

1. **Deux places à l'accueil** — la recommandation d'origine (« 2 sur 3 »).
2. **« Notre sélection »** comme titre par défaut à l'accueil (« Our picks »,
   « La nostra selezione »).
3. **L'après-ajout n'est pas un emplacement** : c'est la suggestion du panier
   recalculée avec l'article entré, et il ne paraît pas sans règle applicable.

## 4. Pris pour bâtir RS8, non confirmés

RS8 (sauf les segments) est bâti (2026-10-18) et décrit dans
[`suggestions-du-staff.md`](suggestions-du-staff.md) §2.1. Choix faits sur la
consigne du lot, sans décision écrite de Hugo :

1. **Le seuil se compare au « Total » que le client lit** — HT au compte, TTC
   sinon, remise, bon et port compris — et non à un sous-total des articles.
   Un panier pas encore chiffré n'atteint aucun seuil.
2. **Le montant et la famille exclue ne valent qu'au panier** : la fiche et
   l'accueil ne connaissent pas le total.
3. **Le jour et l'heure sont ceux de l'affichage**, pas du jour de retrait ;
   une plage ne passe pas minuit (deux règles pour « le soir et la nuit »).
4. **Un point de retrait choisi ne vaut ni avant le choix, ni en livraison.**
5. **Le retour « Ajouté ! » n'envoie pas de total** : l'article vient
   d'entrer, le devis n'est pas encore refait ; une règle à seuil n'y paraît
   pas.
