# TODO — le journal d'activité

> **Ce fichier liste les problèmes connus sur les journaux** — journal
> d'activité, journal de l'annuaire, journal du référentiel, journal
> tarifaire — **que personne n'a encore pris en charge**. Il dit ce qui ne va
> pas et pourquoi ; il ne décide pas comment le régler.
>
> **Dès qu'un point est pris par un plan, il se réduit ici à une ligne de
> renvoi**, et c'est le plan seul qui suit l'avancement et se raye (Hugo,
> 2026-09-19 : « fais le ménage »). Un point livré disparaît de ce fichier ; le
> plan et l'historique git en gardent la trace.
>
> Le fonctionnement actuel : [`architecture-journalisation.md`](architecture-journalisation.md).

## La règle en ajoutant un émetteur

Un fait mérite le journal quand il change ce qui est vendu, facturé, ou ce que
quelqu'un a le droit de voir — **y compris quand c'est un client qui agit sur
son propre compte** (Hugo, 2026-09-19 : « tout doit être journalisé »). Jamais
de coordonnées dans la charge : les champs qui ont changé, pas leurs valeurs.
Un brouillon ou un panier ne vend rien : hors journal.

## Pris en charge par le plan

[`plan-journal-d-activite.md`](plan-journal-d-activite.md) — c'est là que se lit
l'avancement.

- Les gestes qui échappent au journal (staff et clients) → **lot 1**.
- L'index du filtre par personne, la recherche sans casse ni accents → **lot 2**.
- Arriver au journal depuis une fiche, l'historique d'une fiche produit → **lot 3**.
- La tranche fiscale pour la comptabilité (le mur) → **lot 4**.
- La pagination des deux journaux → **lot 5**.

## Ouvert, et pris par personne

### Les gestes de l'atelier

Cocher, décocher une ligne fabriquée ou emballée, compter les bacs
(`production/application/commands/`) ne laissent aucune trace. Une ligne de
journal par coche est le plus fidèle — le JSDoc de `step-packing-containers`
l'annonçait déjà : « qui a appuyé se lirait dans le journal » — mais une
journée de production en écrirait des centaines. **Laissé ici par Hugo le
2026-09-19**, hors du lot 1 : à trancher avant de le bâtir (une ligne par
coche, ou un fait par journée qui résume).

### Les faits écrits par un abonné ne sont pas opposables

`order.placed`, `order.ready`, `order.handed_over` — et, relevés le 2026-09-19
en bâtissant la tranche (c) du lot 1, `subscription.created` (sur le sujet
`user`, lu tel quel par le score des leads), `company.declared`,
`support.requested`, `support.handled` — sont écrits par des abonnés en
**best-effort**, hors de la transaction du geste
(`b2b/growth/application/handlers/`) : une panne du journal les perd en
silence. Leurs handlers déclarent `@sans-journal` en renvoyant à l'abonné.
Les rendre opposables demande de les écrire dans la transaction du geste, avec
**un seul écrivain** par fait (retirer l'abonné, ou changer ce que lit la
croissance) — un changement de la croissance, écrit comme un choix.

### La profondeur à la lecture

Le journal fige des **comptes directs** (`familiesEmporter`, `variants`) et
refuse le rayon transitif — décision de
[`../b2b/architecture-journal-activite.md`](../b2b/architecture-journal-activite.md) §3.
Ce qui manque : ouvrir un fait et demander « **et aujourd'hui, ça touche
quoi ?** ». **Déclencheur** : la première contestation d'un changement de taux.

### Rétention et volume

Partitionnement mensuel et politique de rétention, en SQL brut. **Seuil** : un
million de lignes, ou une page du journal au-delà de 500 ms — le comptage entre
au runbook. Chaque page fait désormais une lecture d'ancre et un `count(*)` en
plus (pagination du 2026-09-19).

### Un index pour la recherche

La recherche parcourt la table, paginée. Un index trigramme (`pg_trgm` est
plausible : Prisma Postgres accepte `btree_gist`) sur l'expression normalisée
est une migration à part — **déclenchée par la mesure**.

### Les phrases

Mis de côté par Hugo le 2026-09-19 (« tout sauf les phrases »).

- **La plupart des faits du référentiel n'ont pas de phrase** : seuls
  `product.published` / `.unpublished` et `product_category.vat_changed` en ont.
  L'écran Journal et l'onglet Historique affichent le type brut
  (`product.identity_saved`…) pour les autres.
- **Une fiche en attente ou invitée passée à « active » à la main** écrit
  `staff_user.reinstated` : l'écran dit « a rétabli l'accès », approximatif pour
  une première activation.
- **La fonction de l'auteur n'apparaît pas** sur une ligne de l'équipe.
- **Les noms ne sont pas en gras** : la phrase est une chaîne simple.

### Le journal tarifaire

- **Une règle ne se modifie pas** : poser, suspendre, reprendre, archiver.
  Corriger une faute de frappe oblige à archiver et reposer, ce qui salit le
  journal. C'est une écriture sur l'argent : **plan à part dans `pricing/`**.
- **La route des 50 derniers actes** (`GET /admin/pricing/journal`) n'a aucun
  appelant : à retirer ou à brancher.

### Petits restes, relevés en bâtissant

- **Une heure limite posée sur un produit** n'apparaît pas dans son historique :
  son sujet est la limite, pas le produit.
- **Une ancre refusée** : l'écran Journal et le panneau tarifaire affichent
  l'erreur, l'onglet Historique rouvre la page 1 — à aligner.
- **`catalog_revision_item` n'a pas d'index sur `sku`** : trouver les révisions
  d'une fiche parcourt la table — à mesurer.
- **La suppression d'un panier récurrent est physique** : interdite par
  CLAUDE.md §3 sur un agrégat, et son handler lève une `NotFoundException`
  depuis l'application — dette des paniers récurrents, à traiter chez eux.
