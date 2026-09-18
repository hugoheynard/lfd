# TODO — le commercial accorde la livraison à une société en attente

> **État au 2026-09-15** : demandé par Hugo, rien n'est bâti. Constaté en dev
> sur « test4 re » (`pending`) : la livraison ouverte aux seuls pros ne lui est
> pas proposée, et c'est la règle d'aujourd'hui qui le veut, pas un bug.

## Le point de départ

Le plan [`../b2b/plan-remise-et-livraison-par-clientele.md`](../b2b/plan-remise-et-livraison-par-clientele.md)
range une société dans la clientèle **B2B seulement si elle est active** (Q3,
tranchée par Hugo le 2026-09-15). Une société `pending`, `suspended` ou
`terminated` est B2C : pas de remise pro au retrait, et la livraison suit la
case B2C du réglage. La règle est `audienceOf` (`packages/contracts/src/customer-audience.ts`),
lue par le serveur au devis comme à la commande, et par la boutique pour ce
qu'elle annonce.

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
  son auteur.
- **Ce qu'elle devient à l'activation** (sans objet) et à la suspension
  (retombe-t-elle ?).
- **Qui peut la poser** : droit d'écriture du commercial, cf.
  [`../staff/todo-droits-ecriture-backoffice.md`](../staff/todo-droits-ecriture-backoffice.md).

⚠️ Le sujet déplace une frontière d'accès et touche le tarif si la remise suit :
le plan passe par `vitruve` avant d'être soumis (CLAUDE.md §9 bis).
