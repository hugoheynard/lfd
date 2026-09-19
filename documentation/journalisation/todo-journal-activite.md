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

### Les phrases, ce qui reste

Le [plan des phrases](plan-phrases-du-journal.md) est bâti (2026-09-19). Relevé
en le bâtissant, non fait :

- **L'écran de diff des révisions** nomme la portée par clé de contexte
  (« brunch : 1 ») : `GlobalCause.blast` (`@lfd/pim-contracts`) est un contrat
  servi ; il faudrait y ajouter les libellés à côté.
- **Le motif d'un acte tarifaire** : pour une mercuriale, l'API écrit sa propre
  paraphrase dans `reason` (« Mercuriale « X » posée sur la fiche du compte »),
  que l'écran tait. La vraie correction : `reason: null` côté API.
- **L'étage d'une règle** (Geste, Promotion…) reste au début de la phrase
  figée, faute d'une donnée structurée dans la charge.
- **Deux lignes `tax_regime.rate_changed`** de la base de dev (21 août) ne sont
  au catalogue sous aucun nom : elles s'affichent comme un fait inconnu. À
  vérifier en production avant d'envisager une migration de renommage.
- **`delivery_availability.updated`** ne dit pas dans sa phrase ce qui a été
  ouvert ; le détail le dit.

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
- **Deux clôtures simultanées d'une journée de production** chargent toutes
  deux une journée ouverte et enregistrent chacune : course antérieure au
  journal, qui y écrit désormais deux `production_day.closed` (relevé le
  2026-09-19, tranche (d) du lot 1).
- **La suppression d'un panier récurrent est physique** : interdite par
  CLAUDE.md §3 sur un agrégat, et son handler lève une `NotFoundException`
  depuis l'application — dette des paniers récurrents, à traiter chez eux.
