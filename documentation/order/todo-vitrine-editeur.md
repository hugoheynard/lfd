# TODO — l'éditeur de vitrine

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

## 4. Retirer `sampleCount`, un champ que plus personne ne remplit

> Noté le 2026-09-24, après le multi-contenu en onglets (`11d3967f7`).

`sampleCount` était le « nombre de contenus » que l'éditeur **simulait** dans
son aperçu, avant que les objets portent de vrais contenus. Depuis les onglets,
l'aperçu compte les contenus réels de l'objet
(`storefront-object-dialog.ts`, `previewCarousel`) et le champ n'est plus
proposé. Il reste pourtant **enregistré et validé** partout (vérifié le
2026-09-24) :

| Où                                                          | Ce qu'il y fait                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/storefront-layout/src/carousel.ts`                | champ de `CarouselSettings`, défaut 3, bornes `SAMPLE_COUNT`, `slideAt`                       |
| `packages/contracts/src/storefront.ts`                      | `storefrontCarouselSchema.sampleCount` (la vue publique l'omet déjà)                          |
| `apps/lfd-api/src/b2b/storefront/domain/object-settings.ts` | refuse une valeur hors bornes                                                                 |
| `storefront-rows.ts`, `storefront.prisma`                   | colonnes `sample_count` de `storefront_object` et `storefront_template`, `NOT NULL` + `CHECK` |

Chaque objet enregistré porte donc la valeur par défaut (3), qui ne dit rien
de ses contenus. Un champ que personne ne remplit est un mensonge de contrat.

**En trois déploiements** (la colonne est en production depuis `393db493a`) :

1. **Étendre** — le contrat rend `sampleCount` facultatif, l'agrégat cesse de
   le valider et écrit le défaut s'il manque, l'éditeur ne l'envoie plus ;
   migration : `DROP NOT NULL` et `DROP CONSTRAINT` des deux `CHECK`.
2. **Basculer** — plus aucun lecteur : `CarouselSettings` le perd, `slideAt`
   prend le nombre de contenus en paramètre, l'aperçu de l'éditeur passe par là.
3. **Resserrer** — migration `DROP COLUMN` des deux tables, une fois le 2
   déployé.

`lecteur-de-migrations` sur les étapes 1 et 3.
