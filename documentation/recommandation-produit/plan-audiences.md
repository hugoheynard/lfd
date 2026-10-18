# Plan — les audiences de la clientèle

> 📐 **Doc-first, rien n'est bâti** (Hugo, 2026-10-18 : « on trie les
> audiences alors ? », puis « fais le plan des audiences »). Après le lot R0 de
> [`plan-recommandation-de-produits.md`](plan-recommandation-de-produits.md).
> Chaque affirmation sur l'existant a été **ouverte le 2026-10-18** ; ce qui ne
> l'a pas été est dit « non vérifié ».
>
> **Hors argent, hors migration de données, hors frontière de sécurité** : pas
> de `vitruve` d'office (CLAUDE.md §9 bis). Le seul point sensible est le
> passage de l'agrégé à la personne (§5) — il est exclu de ce plan.

## 1. Ce qu'on veut

Décrire la clientèle **par ce qu'elle fait** — où, quand, comment, quoi — en
segments **agrégés**, pour deux usages :

1. **Lire** : un tableau de bord au back-office (panier moyen, rayons, heures
   fortes, par segment) ;
2. **Calculer** des suggestions collectives par segment (« souvent pris avec,
   chez les vacanciers »), sous le seuil d'anonymat de
   [`historique-du-particulier.md`](historique-du-particulier.md) §1 bis.

Pas d'âge, pas de sexe, aucune déduction de ce que la personne **est** à partir
de ce qu'elle achète.

## 2. Les segments, et d'où ils viennent

| Segment                                | Source aujourd'hui                                                                                                                                                         | Fiabilité                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Pro / particulier**                  | `Order.companyId` optionnel : présent = commande d'entreprise (`apps/lfd-api/prisma/schema/public/orders.prisma`, bloc « Tenancy »)                                        | **sûre**                                                                         |
| **Activité du pro**                    | `Company.nafCode`, résolu depuis le SIRET, vide par défaut (`public/account.prisma:106-109`)                                                                               | sûre quand renseignée ; regroupement NAF → « hôtel, restaurant, café… » à écrire |
| **Retrait / livraison**                | `Order.fulfillmentMethod` (`orders.prisma:143`)                                                                                                                            | **sûre**                                                                         |
| **Site de retrait, zone de livraison** | le détail de remise `Order.fulfillment` (Json, `orders.prisma:186`) et l'adresse figée `deliveryAddressSnapshot` (`:151`) — leur contenu exact **non vérifié** (au lot A1) | sûre une fois lue                                                                |
| **Fidèle / régulier / de passage**     | nombre de commandes par personne ou société sur la période                                                                                                                 | **sûre** (dérivée)                                                               |
| **Moment** (jour, heure, créneau)      | `Order.createdAt` et la date de remise                                                                                                                                     | **sûre**                                                                         |
| **Résident / saisonnier / vacancier**  | **rien de fiable aujourd'hui** — voir §3                                                                                                                                   | à construire                                                                     |

## 3. Résident, saisonnier ou vacancier — le segment qui compte le plus

À Val d'Isère, c'est sans doute la coupe la plus utile, et c'est la seule
qu'on n'a pas.

**Ce qu'on n'a pas** : la langue choisie dans la boutique n'est enregistrée
nulle part (aucune colonne `locale` dans les schémas `public`, seul
`shop-copy.prisma:35` en porte une, pour les textes ; vérifié le 2026-10-18).
L'indicatif du téléphone est dans `users.phone` (`account.prisma:389`), texte
libre.

**Deux voies, cumulables :**

- **(a) Demander, une fois, facultativement.** Une question à l'inscription ou
  après la première commande : « Vous êtes : résident à l'année · saisonnier ·
  en vacances ». Fiable, simple, annoncée dans la politique de
  confidentialité (« pour mieux comprendre notre clientèle »), jamais
  obligatoire, modifiable dans Mon profil. **Recommandée.**
- **(b) Estimer.** Indicatif étranger, rythme « une semaine de commandes puis
  plus rien », livraison à une adresse d'hôtel ou de chalet. Utile pour ceux
  qui ne répondent pas, mais c'est une **estimation**, et le tableau de bord
  doit l'afficher comme telle (« estimé »), jamais la mélanger à la réponse.
  Enregistrer la **langue de la commande** (une colonne sur la commande, pas
  sur la personne) rendrait l'estimation bien meilleure, pour un coût minime.

## 4. Le modèle

- **Lecture seule, à la demande d'abord** : des queries CQRS qui agrègent les
  commandes de la période par segment, sous le mur pour ce qui touche une
  société (CLAUDE.md §3). Précalcul seulement si une mesure le justifie.
- **Les segments d'une personne ne sont jamais stockés** pour la viser. Le
  segment se calcule dans l'agrégat et disparaît avec lui. La seule donnée
  nouvelle par personne est la **réponse** à la question (a), qu'elle a donnée
  et qu'elle peut changer.
- **Seuil d'affichage** : une case du tableau (segment × période) qui compte
  moins de 5 clients distincts s'affiche « trop peu de clients », pas un
  chiffre — même règle que les suggestions collectives.
- **Où ça vit** : `b2b/` (tout est commerce). Les agrégats précalculés, s'il y
  en a un jour, vont dans le schéma `growth`, à côté des compteurs de R0
  (décision du 2026-10-18).

## 5. Ce que ce plan ne fait pas

- **Viser une personne par son segment** (lui montrer autre chose parce
  qu'elle est « vacancière ») : c'est du profilage — information, base légale
  et droit d'opposition, comme « vos habituels ». Hors de ce plan.
- **Âge, sexe, revenus** : ni demandés ni déduits.
- **Outil de marketing** (sources de trafic, parcours) : Plausible ou Matomo,
  plus tard, séparément ([`historique-du-particulier.md`](historique-du-particulier.md) §1 bis).

## 6. Lots

| Lot    | Contenu                                                                                                                                                                                        | Dépend de |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **A1** | Lire le contenu de `fulfillment` et de l'adresse figée ; tableau de bord des segments **sûrs** (pro/particulier, activité, retrait/livraison, site/zone, fidélité, moment) ; seuil d'affichage | R0        |
| **A2** | La question facultative « résident · saisonnier · vacancier » (inscription ou après la 1ʳᵉ commande, Mon profil) + la phrase de la politique                                                   | Q1, Q2    |
| **A3** | La langue de la commande (colonne additive) et l'estimation affichée « estimé »                                                                                                                | Q3        |
| **A4** | Les suggestions collectives par segment (« souvent pris avec, chez les pros »), sous le seuil                                                                                                  | A1, R2    |

## 7. Questions à Hugo

1. **La question « résident · saisonnier · vacancier » : oui ?** _Recommandation :
   oui, facultative._ C'est le seul moyen fiable, et elle ne coûte qu'un clic.
2. **Où la poser — à l'inscription, ou après la première commande ?**
   _Recommandation : après la première commande_, sur l'écran de
   confirmation : le client a déjà obtenu ce qu'il voulait, on ne freine pas
   l'inscription.
3. **Enregistrer la langue de la commande ?** _Recommandation : oui_ — une
   colonne sur la commande, utile aussi au service (répondre dans la langue du
   client).
4. **Le regroupement des codes NAF** en familles d'activité (hôtellerie,
   restauration, café-bar, commerce…) : on le décide ensemble au lot A1.
