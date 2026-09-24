# TODO — l'éditeur de vitrine, gestes de mise en page

> Noté le 2026-09-24. Hugo : « on peut vivre sans pour le moment ». Rien n'est
> commencé. Conception de référence :
> [`boutique-rayon-layout.md`](boutique-rayon-layout.md) ; éditeur :
> `apps/lfd-backoffice-frontend/src/app/contenu/`.

## La difficulté commune, à trancher avant de construire

**Un objet partagé est à la même position sur tous ses rayons.** Tout geste
qui déplace des objets sur UN rayon (poussée, rangée insérée ou supprimée,
miroir) déplacerait aussi l'objet partagé sur ses autres rayons, où la place
n'est peut-être pas libre.

**Proposé, non validé** : le geste est **refusé** s'il déplacerait un objet
partagé, avec un message qui le nomme et dit où il est aussi (« “Bande Pâques”
est aussi sur Chocolat & confiserie — déplacez-le seul d'abord »).
Écartée : reproduire le décalage sur tous ses rayons — des cascades
invisibles sur des pages qu'on ne regarde pas.

## 1. Poser en poussant vers le bas

Poser un bloc là où seule une tuile tient : les objets qui gênent **descendent**
du nombre de rangées nécessaire, en cascade. Refusé si la poussée dépasse R.
Les cases « article du rayon » ne comptent pas : elles se reremplissent.

## 2. Gérer les rangées, dans la limite R du rayon

- **Insérer** une rangée vide au-dessus / au-dessous : ce qui suit descend.
- **Supprimer** une rangée : seulement si elle est vide ; sinon le refus nomme
  l'objet qui l'occupe.
- **Monter / descendre** une rangée (échange avec la voisine) : refusé si un
  objet est à cheval sur les deux (bloc 2×2, kakémono, hero, bande double).

## 3. Sélection multiple et miroir

- Sélection par Maj+clic ; le rectangle englobant est la zone du miroir.
- **Miroir horizontal** / **vertical** des positions dans ce rectangle.
- À valider : le miroir horizontal **inverse aussi le côté de l'image**
  (gauche ↔ droite), sinon l'effet ne se voit pas.
- Refusé si un objet NON sélectionné est dans le rectangle.

## Ordre proposé

1 et 2 d'abord — ce sont deux façons de « décaler vers le bas » et elles
partagent leur fonction pure — puis 3. Toutes en fonctions pures testées, dans
`@lfd/storefront-layout` si elles servent aussi au serveur, sinon dans
l'éditeur.
