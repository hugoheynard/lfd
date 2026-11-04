# Ce que coûte un prix — les lectures, pas le temps

> ✅ **Relu contre le code le 2026-11-04.** Ouvert le 2026-09-04 sur un constat
> (trois lectures de base **par article**), il est réécrit sur ce qui l'a
> remplacé : des lectures **par lot**, un cache en mémoire et une estampille
> lue une fois par requête. Le récit des deux premières versions est dans
> l'historique git ; ses leçons sont gardées en partie 1. Partie 1 :
> comprendre. Partie 2 : le code.

# Partie 1 — Comprendre

## Ce qui se paie

La base de production est chez Prisma, et Prisma facture **à l'opération** :
chaque appel du code à la base est compté, quelle que soit sa taille. Un prix
lent n'est donc pas le problème. Le problème, c'est un prix qui fait **beaucoup
d'appels**.

## Avant et maintenant

En septembre, chiffrer un panier de dix lignes faisait une trentaine d'appels :
trois par article. Aujourd'hui, le moteur lit **tout ce dont il a besoin en
une fois**, pour tout le panier. Et ce qu'il a lu reste en mémoire jusqu'à ce
que quelqu'un change un prix.

```mermaid
flowchart LR
  P["Un panier<br/>de N lignes"] --> E{"Un prix a-t-il changé<br/>depuis la dernière fois ?"}
  E -->|"non"| M["Les règles en mémoire<br/>aucune lecture de plus"]
  E -->|"oui"| L["Relire les règles<br/>une fois pour tout le lot"]
  L --> M
  M --> R["Les prix des N lignes"]
```

La question « un prix a-t-il changé ? » coûte **une** lecture par requête, pas
une par article.

## Deux leçons qui restent vraies

- **L'écran multiplie, le serveur additionne.** Un écran qui redemande un
  devis à chaque frappe coûte plus cher qu'un serveur mal optimisé : treize
  devis pour saisir huit lignes, c'était dix fois le prix d'un seul. Réduire le
  nombre d'appels d'un écran passe avant l'optimisation du serveur.
- **Garder en mémoire n'est sûr que si la mémoire sait ce qui est rangé.** Une
  règle de prix rangée qui reviendrait en mémoire continuerait de fixer des
  prix. Le cache ne garde donc que ce qui n'est pas rangé, et une relecture à
  une date passée ne passe pas par lui.

# Partie 2 — Le code

## 1. Les lectures d'un lot

`PricingMaterialsLoader` (`b2b/pricing/application/pricing-materials.loader.ts`)
lit **six familles en parallèle**, une fois par lot, quelle que soit sa
taille : règles, planchers, barèmes, engagements, mercuriale, promotions. En
relecture datée (`replay`), il appelle les lecteurs datés (`inScopesAt`,
`unarchivedAt(at)`) au lieu du cache. La lentille `unproven` ne lit pas les
engagements. Les preuves (cumul d'un engagement, ratio de volume d'un plancher
dynamique) se lisent ensuite, **par engagement** et non par article.

## 2. Le cache des matériaux

`PricingMaterialsCache` (`b2b/pricing/infrastructure/pricing-materials.cache.ts`),
en mémoire, **par instance de l'API** :

- il garde les **tables entières** non rangées (le lecteur de planchers lit
  `archivedAt: null`), et rien par client : le tri par client, par portée et
  par fenêtre est refait en mémoire par la fonction pure ;
- il est vidé par `PricingActWriter`, passage obligé de toute écriture
  tarifaire, **après** le commit ;
- il porte une **estampille** : le dernier identifiant du journal tarifaire
  (`pricing_events`, ULID croissant). Une instance qui voit une estampille
  différente recharge : c'est ce qui le rend juste à plusieurs instances ;
- l'estampille se lit **une fois par requête** (`PricingMaterialsCache.stamp`,
  2026-11-04), pas une fois par question au cache ; hors requête (tâche de
  fond), elle se relit à chaque fois ;
- si la lecture de l'estampille échoue, il garde la dernière réussie : un prix
  peut-être périmé plutôt qu'un refus de vente.

## 3. Le budget, compté

`test/pricing-budget.e2e-spec.ts` compte les **opérations ORM** (l'unité
facturée) contre un vrai Postgres, par égalité stricte :

| Constante                | Valeur | Ce qu'elle mesure                                                                 |
| ------------------------ | ------ | --------------------------------------------------------------------------------- |
| `COLD_QUOTE_OPS`         | 10     | un devis anonyme à froid — et **le même pour dix lignes** que pour une            |
| `WARM_QUOTE_OPS`         | 5      | le même devis à chaud : catalogue, mode de TVA, une estampille                    |
| `COLD_COMPANY_QUOTE_OPS` | 20     | un devis d'un client rattaché à une société, avec un jour (heure limite comprise) |
| `COLD_ESTIMATE_OPS`      | 31     | l'estimation de la saisie au back-office, à froid, droits du staff compris        |

Ce qui compte n'est pas la valeur, c'est l'égalité : dix lignes au prix d'une,
200 règles au prix de zéro, aucune lecture par article. C'est elle qui attrape
une lecture par article réintroduite.

Le compteur de production est `SchemaOpsCounter`
(`platform/database/schema-ops.counter.ts`), branché sur `$allOperations`, par
schéma Postgres.

## 4. L'écran de saisie

La saisie d'une commande au back-office ne redemande plus un devis à chaque
ligne : elle lit l'estimation (`estimatesOf`), amortie et dédupliquée
([`../centime-et-tva/le-prix-d-un-panier.md`](../centime-et-tva/le-prix-d-un-panier.md)).

## 5. Ce qui reste ouvert

- **Le catalogue n'a pas de cache** : une visite de la boutique lit encore le
  catalogue à chaque fois, même à chaud. Plan et deux décisions en attente :
  [`plan-cache-du-catalogue.md`](plan-cache-du-catalogue.md).
- **La projection n'est pas comptée** : aucun budget ne couvre la courbe du
  banc d'essai.
- Le pool de connexions est à `max: 15` par instance (`prisma.service.ts`,
  relevé le 2026-10-30) ; c'est une affaire de concurrence, pas de facture.

Le plan qui a remplacé les lectures par article :
[`plan-materiaux-de-prix.md`](plan-materiaux-de-prix.md).
