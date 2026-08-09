# Frontière de service Shopify — package ou micro-service ?

> **Question.** L'agrégateur de **stock** (futur, pour le réassort) parlera aussi à
> Shopify. Le module `channels/shopify` du PIM doit-il devenir un **micro-service**
> partagé ? Ce doc tranche : **non aujourd'hui**, extraire un **package** de connexion
> maintenant, promouvoir en **gateway** au premier consommateur de **webhooks**.
>
> Statut : **décision / design.** Rien n'est extrait ni codé.
> Date : 2026-08-04.
> Voisins : [`shopify-api-map.md`](shopify-api-map.md), [`shopify-connexion-setup.md`](shopify-connexion-setup.md),
> [`architecture-suite-gateway-scaling.md`](../suite/architecture-suite-gateway-scaling.md), [`adr.md#adr-13`](./adr.md).

---

## 1. Ce qui est partagé est mince ; le reste ne l'est pas

Les deux apps parlent à Shopify **dans des directions opposées** :

| App               | Direction                                           | Rôle                                 |
| ----------------- | --------------------------------------------------- | ------------------------------------ |
| **PIM**           | **écrit** (push produits / collections)             | possède l'identité produit           |
| **Stock** (futur) | **lit** (ingestion webhooks inventaire / commandes) | réassort, agrégation de consommation |

Le **domaine n'est pas partagé** (projection ≠ ingestion). Le seul partage réel est la
**couche connexion** : `ShopifyTokenProvider`, l'échange client-credentials, le transport
`admin-client.graphql()`, les réglages. ~200 lignes. **C'est** la seule duplication à
éviter — **pas** le module entier.

## 2. Deux formes d'extraction, pas une

|              | **Package** `@lfd/shopify-client` | **Micro-service** (gateway Shopify)                                              |
| ------------ | --------------------------------- | -------------------------------------------------------------------------------- |
| On extrait   | connexion + transport             | connexion + transport **+ webhooks + rate-limit**                                |
| Coût         | quasi nul (une lib in-process)    | déployable, hop réseau, auth propre, ops, debug distribué, nouveau mode de panne |
| Justifié par | duplication de **code**           | partage d'**état / runtime**                                                     |

Un micro-service **ne se justifie pas** par « deux consommateurs » : ça, un package le
règle. Il se justifie par du **runtime partagé**.

## 3. Les trois vrais arguments micro-service (réels avec l'app stock)

1. **Webhooks** — Shopify livre ses événements à **une seule URL**. Le stock a besoin des
   webhooks inventaire / commandes (c'est son cœur). Il faut donc **un service qui reçoit
   et redistribue** (fan-out). **Meilleur argument.**
2. **Rate limit** — les quotas sont **par jeton / app**. Deux backends tapant la même
   boutique avec les mêmes identifiants doivent **coordonner le budget** → un gateway qui
   sérialise / throttle.
3. **Propriétaire unique du jeton** — un seul cache 24 h au lieu de deux.

Aucun de ces trois n'est concret **tant que l'app stock (et ses webhooks) n'existe pas**.

## 4. La contrainte à ne pas rater : couplage catalogue (ADR-13)

Aujourd'hui `channels/shopify` **dépend du catalogue PIM** (`CatalogueReader`) pour
projeter. Un gateway **ne peut pas** garder ça. La bonne coupe :

> **Le gateway reste _transport-only_ (agnostique du domaine).** Chaque app fait **sa
> propre projection** puis appelle le gateway avec un **payload prêt**.

Sinon on déplace le couplage au lieu de le casser. Corollaire : `buildProductSetInput` /
`projectProduct` **restent côté PIM** ; seul le transport (auth + `graphql` + webhooks +
throttle) descend dans le package/gateway.

## 5. Décision

- **Maintenant** : extraire la couche connexion en **package** `@lfd/shopify-client` (le
  _seam_) — token provider, transport `graphql`, réglages. Zéro déployable en plus. Le PIM
  le consomme ; l'app stock aussi quand elle arrive. Respecte « généraliser sur le 2ᵉ
  usage réel » : ici on ne fait que **préparer la couture** au prochain contact avec le module.
- **Déclencheur du micro-service = le premier consommateur de webhooks** (l'ingestion du
  stock). C'est là que « une URL, fan-out, budget partagé » deviennent réels. Le domaine
  des apps ne bouge pas : elles dépendent déjà de l'abstraction.
- **Pas de micro-service aujourd'hui** (YAGNI — l'app stock n'existe pas).

```mermaid
flowchart TD
  subgraph now[Aujourd'hui]
    pim1[PIM · projection + push] --> conn1[connexion Shopify in-process]
  end
  subgraph pkg[Étape 1 — package]
    pim2[PIM · projection] --> lib[@lfd/shopify-client\ntoken + graphql]
    stock2[Stock · ingestion] --> lib
  end
  subgraph svc[Étape 2 — gateway, au 1er webhook]
    pim3[PIM · projection] --> gw[Gateway Shopify\ntransport + webhooks + rate]
    stock3[Stock · réassort] --> gw
    shopify[(Shopify webhooks)] --> gw
  end
  now --> pkg --> svc
```

## 6. Reste à faire (non codé)

- Extraire `@lfd/shopify-client` (token provider + transport `graphql` + réglages) au
  prochain contact avec le module ; garder projection/push côté PIM.
- Quand l'app stock arrive : y brancher le package.
- Quand les webhooks arrivent : promouvoir le package en **gateway** (réception + fan-out
  - budget rate-limit + propriétaire unique du jeton).
