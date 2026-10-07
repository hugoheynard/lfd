# TODO — le commercial accorde la livraison à une société en attente

> **État au 2026-09-15** : demandé par Hugo, rien n'est bâti — **toujours vrai
> au 2026-10-07**, relu contre le code. Constaté en dev
> sur « test4 re » (`pending`) : la livraison ouverte aux seuls pros ne lui est
> pas proposée, et c'est la règle d'aujourd'hui qui le veut, pas un bug.

## Le point de départ

Le plan [`plan-remise-et-livraison-par-clientele.md`](./plan-remise-et-livraison-par-clientele.md)
range une société dans la clientèle **B2B seulement si elle est active** (Q3,
tranchée par Hugo le 2026-09-15). Une société `pending`, `suspended` ou
`terminated` est B2C : pas de remise pro au retrait, et la livraison suit les
règles des particuliers. La règle est `audienceOf` (`packages/contracts/src/customer-audience.ts`),
lue par le serveur au devis comme à la commande, et par la boutique pour ce
qu'elle annonce.

⚠️ **Les règles des particuliers tiennent en DEUX clés, pas une** (relu le
2026-10-07). Au serveur, la commande d'une société non active (`POST /orders`)
n'est refusée en livraison que par la case « B2C » du réglage « Livraison »
(`openToB2c`). Dans la boutique, sa porte du coursier demande en plus la clé
d'accès **`publicDelivery`** (« Livraison aux particuliers »,
`feature-access.levels.ts:101-115`), **fermée par défaut** depuis le
2026-09-21 : avec les défauts, une société en attente ne se voit pas proposer
la livraison, même quand la case « B2C » est cochée. La dérogation à bâtir
devra donc lever **les deux** : la case, que le serveur applique, et la clé,
que la boutique lit. Que le serveur ne lise pas la clé sur ce chemin est une
question ouverte pour Hugo (Q4 du plan).

Q3 répondait à un risque réel : sans elle, **n'importe qui devient pro en
déclarant une société**. Ce qui suit ne la renverse pas.

## Ce qui est demandé

Un client qui attend sa validation doit pouvoir être livré **si le commercial
le décide**, société par société, sans attendre l'activation.

## Ce qui reste à trancher avant de bâtir

- **Accorder la livraison seule, ou toute la clientèle B2B ?** La demande ne
  parle que de la livraison. Accorder la remise pro en même temps serait une
  décision sur l'argent, pas un détail d'écran.
- **Où vit la décision.** Une dérogation portée par la société (et non une
  exception dans `audienceOf`), posée depuis la fiche client, journalisée avec
  son auteur. Un voisin existe déjà pour la clé : l'**exemption**
  (`FeatureAccessExemption`, `feature-access.prisma`) — une adresse e-mail
  prouvée garde le niveau le plus ouvert d'une clé. Elle se pose au
  back-office sous le droit `b2b_feature_access`
  (`POST /admin/feature-access/:key/exemptions`), et `publicDelivery`
  l'admet. Elle lèverait la porte de la boutique pour une personne, pas pour
  une société, et ne touche pas la case « B2C » que le serveur applique. Une
  forme possible, pas une réponse (relu le 2026-10-07).
- **Ce qu'elle devient à l'activation** (sans objet) et à la suspension
  (retombe-t-elle ?).
- **Qui peut la poser** : droit d'écriture du commercial, cf.
  [`../droits-et-permissions/todo-droits-ecriture-backoffice.md`](../droits-et-permissions/todo-droits-ecriture-backoffice.md).

⚠️ Le sujet déplace une frontière d'accès et touche le tarif si la remise suit :
le plan passe par `vitruve` avant d'être soumis (CLAUDE.md §9 bis).
