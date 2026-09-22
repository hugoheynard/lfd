# La plaquette professionnelle n'applique aucune règle

> **Analyse close le 2026-09-13.** 89 couples de prix du catalogue
> « Professionnels — Hiver 2026 ». Le PDF mis en page est sur le poste d'Hugo
> (`analyse-plaquette-professionnelle.pdf`) ; ce document est la version que le
> dépôt garde, parce que c'est elle qui justifie du code.

## La question

Peut-on dériver le **prix professionnel HT** du **prix public TTC** par une
formule unique ? Une telle formule tariferait tout le catalogue, présent et à
venir — c'est ce que la méthode `remise_apres_tva_max` devait faire.

## La réponse : non, et il n'y a rien à trouver

La colonne « Pro HT » n'a pas été calculée. Elle a été **écrite à la main,
article par article**. Quatre constats, chacun suffisant.

### 1. Le même prix public donne jusqu'à quatre prix professionnels

| Public TTC | Prix pro trouvés                  | Écart |
| ---------- | --------------------------------- | ----- |
| 6,00 €     | 3,20 € · 4,50 € · 4,60 € · 4,80 € | 50 %  |
| 10,00 €    | 7,00 € · 7,50 € · 7,89 € · 7,90 € | 13 %  |
| 2,00 €     | 1,50 € · 1,57 € · 1,87 €          | 25 %  |

Une formule partant du prix public ne peut pas produire deux résultats pour la
même entrée. Celle-ci en produit quatre.

### 2. Les prix professionnels sont des nombres choisis

**73 des 89** tombent sur un multiple de cinq centimes. Une division par un taux
de TVA n'a aucune raison d'y tomber ; une personne qui pose un prix, si.

### 3. La meilleure règle possible couvre un article sur cinq

Tous les coefficients balayés au dix-millième. Le meilleur — `TTC × 0,789`, soit
retirer 20 % de TVA puis remiser 5,3 % — est juste au centime sur **19 articles
sur 89**. Une règle **par catégorie** ne monte qu'à 38/89 :

| Catégorie             | Meilleur coefficient | Articles justes |
| --------------------- | -------------------- | --------------- |
| Les viennoiseries     | × 0,7879             | 8 / 19          |
| Les pains             | × 0,7890             | 11 / 18         |
| Les pâtisseries       | × 0,7482             | 7 / 18          |
| Le salé & le traiteur | × 0,7556             | 10 / 21         |
| Chocolat & confiserie | × 0,6990             | 2 / 13          |

### 4. 🔴 Huit prix sont inversés

Le professionnel y paie **hors taxe** plus cher que le particulier **toutes
taxes comprises** : six articles à 7,10 € contre 6,50 € (sandwich jambon beurre,
croque-monsieur rustique, croque courgette, tranche légumes, tranche miel
chèvre, fougasse provençale) et deux à 4,50 € contre 4,00 € (flan nature part,
délice des neiges). Ce n'est pas une méthode discutable, c'est une erreur — et
elle est imprimée. **Signalé à Hugo le 2026-09-13.**

## Ce que ça a changé dans le code

La méthode `remise_apres_tva_max` a été **retirée le jour même** de sa livraison
(`20260913140000_retrait_methode_plaquette`). Elle avait été bâtie sur la
prémisse qu'elle reproduisait ces prix ; elle n'en reproduit que dix — ceux qui
tombent sur `TTC × 0,75`.

**Le mécanisme de sélection reste.** La colonne `pro_price_method`, son value
object, sa route et son sélecteur d'écran survivent à la méthode qu'ils
devaient offrir : le jour où le commerce fournit une vraie formule, ce sera une
valeur de plus dans `PRO_PRICE_METHODS` et une branche dans `proPriceOf`, pas
une colonne, une migration, une route et un écran à refaire. Une union à un seul
membre est le prix — très bas — de cette option.

## Ce qu'il faut faire de la plaquette

**C'est une grille de prix négociés, pas un calcul.** La plateforme sait déjà
la porter : le prix négocié par article vit dans `catalog_item_overrides`, et le
lecteur le préfère au prix poussé par le référentiel —
`unitPriceMillicents: row.override?.priceMillicents ?? pimPriceMillicents`
(`b2b/catalog/infrastructure/prisma-catalog.reader.ts`).

> ⚠️ **Ce paragraphe citait un champ `localPrice` qui n'a jamais existé** (aucun
> commit du dépôt ne le porte, vérifié le 2026-09-22). Le mécanisme décrit était
> juste ; le nom donné pour le retrouver était inventé — et un nom inventé coûte
> plus qu'une absence de nom, parce qu'on le cherche.

La voie recommandée est donc d'**importer les 89 prix tels quels**. Le
référentiel continue de calculer son propre prix professionnel en dessous ; la
grille le recouvre là où elle existe, et seuls les articles absents de la
plaquette suivent la règle. **Rien n'est bâti de ce côté à ce jour.**

## Méthode

Les 89 couples ont été extraits du PDF, puis confrontés à chaque hypothèse :
coefficient unique sur le TTC, division par un taux de TVA (5,5 %, 10 %, 20 %)
suivie d'une remise, et règle par catégorie. « Juste » signifie exact au
centime.

## L'import, et ce qu'il a révélé

`pnpm --filter lfd-api mercuriale:import` — compte rendu seul, puis
`--appliquer` pour écrire. Il passe par le **bus de commandes** (`SetB2bPrice`),
jamais par la colonne : écrire `catalog_item_overrides` en direct contournerait
les refus de l'agrégat et laisserait `decided_by` vide.

🔴 **La plaquette vend 89 articles ; le catalogue B2B n'en porte que 40.**
Sur la base de développement au 2026-09-13, 22 lignes s'apparient, 67 restent
sans prix — et **au moins 49 ne peuvent PAS s'apparier quel que soit leur nom**,
puisqu'il n'y a pas d'article en face. Le rapprochement par libellé n'est donc
pas le goulot : c'est la **couverture** du catalogue professionnel.

C'est la vraie découverte de ce chantier, et elle dépasse les prix : un client
professionnel qui commande d'après cette plaquette ne trouvera pas les deux
tiers des articles. Aucun import n'y change quoi que ce soit.

⚠️ Ces chiffres viennent de la base de **dev**, clonée de la production à une
date inconnue. Relancer le compte rendu contre la production avant d'en tirer
une conclusion commerciale.
