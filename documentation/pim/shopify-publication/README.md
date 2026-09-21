# La chaîne de publication Shopify

> 🔴 **CE CANAL N'EXISTE PLUS.** La chaîne de publication Shopify — écrans,
> canal serveur, paquet de transport, contrats — a été retirée du dépôt le
> **2026-09-21**
> ([`plan-un-seul-canal-deux-prix.md`](../plan-un-seul-canal-deux-prix.md)).
>
> Ces documents sont **archivés, pas supprimés** : ils portent des décisions qui
> ont survécu à leur canal — le modèle des contextes de vente, la protection des
> URL indexées, la mécanique des révisions — et un doc supprimé fait réinventer
> ce qu'il savait. Ce qu'ils décrivent du code, en revanche, n'est plus vrai :
> les chemins qu'ils citaient vivent dans l'histoire git.

> Sept documents regroupés ici le **2026-09-13**. Ils vivaient à la racine de
> `documentation/pim/`, mêlés au reste du référentiel, alors qu'ils se citent
> l'un l'autre en permanence et ne parlent que d'une seule chose : **comment le
> catalogue sort du PIM vers la boutique**.

| Document                                                                     | Ce qu'il répond                                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`projection-shopify.md`](./projection-shopify.md)                           | **Ce qu'on envoie** — emporter/sur place, TVA par collection, boutiques, QR, SKU partagé      |
| [`publication-reconciliation-3way.md`](./publication-reconciliation-3way.md) | **Ce qui a dérivé** — BASE/OURS/THEIRS, diff avant push, snapshots versionnés, retour arrière |
| [`shopify-api-map.md`](./shopify-api-map.md)                                 | **Par quelle porte** — besoin PIM → scope, fonction, action, statut                           |
| [`shopify-productset-findings.md`](./shopify-productset-findings.md)         | **Ce que `productSet` fait vraiment** — forme exacte de la mutation, vérifiée en direct       |
| [`shopify-connexion-setup.md`](./shopify-connexion-setup.md)                 | **Comment on se connecte** — runbook : Dev Dashboard, client credentials, `.env`, pièges      |
| [`shopify-e2e-strategy.md`](./shopify-e2e-strategy.md)                       | **Comment on l'éprouve** — dev store contre prod, harnais sous drapeau, garantie par lint     |
| [`shopify-service-boundary.md`](./shopify-service-boundary.md)               | **Où s'arrête le paquet** — paquet ou micro-service, séparation connexion/domaine, webhook    |

## Par où commencer

**Projection** d'abord : c'est le modèle, et tous les autres s'y réfèrent. Puis
**réconciliation** si la question est « qu'est-ce qui partirait, et qu'est-ce
que j'écraserais ». Le **runbook de connexion** se lit sous pression, pas avant.

⚠️ La réconciliation à trois voies est un **design cible**, pas l'état du code :
le push actuel ne garde qu'une empreinte de la dernière poussée. Son en-tête le
dit ; ne pas le déduire de sa présence ici.

## Ce qui n'est PAS ici

La publication vers la **plateforme professionnelle** — l'autre canal — vit
ailleurs : [`../cycle-catalogue-du-pim-a-la-vente.md`](../cycle-catalogue-du-pim-a-la-vente.md)
pour le cycle, [`../mecanique-revisions-catalogue.md`](../mecanique-revisions-catalogue.md)
pour les ancres. Les deux canaux partagent les révisions et rien d'autre.
