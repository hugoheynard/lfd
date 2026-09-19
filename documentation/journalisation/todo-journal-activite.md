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

## Le bilan du 2026-09-19 — 7/10 bâti, 4/10 en production

Note donnée à la demande de Hugo, le soir où les plans du journal et des
phrases ont été bâtis. Tout était alors en local ; **déployé le soir même**,
après la sortie d'Accelerate (point 1 ci-dessous).

**Solide** : les gestes qui comptent (argent, catalogue, compte client,
production, fiscalité) s'écrivent dans la transaction du geste ; l'auteur est
la fiche, deux portes l'empêchent de régresser ; le catalogue des faits
(191 types) interdit la dérive ; chaque ligne est une phrase sans perte, testée
sur toutes les formes ; la recherche, les pages, l'historique produit et la
vue fiscale sont en place.

**Pour atteindre 9**, dans cet ordre :

1. ~~**Déployer**, après la sortie d'Accelerate — API puis back-office, l'index
   du journal hors des heures d'usage.~~ — fait le 2026-09-19 au soir
   (`b565f0a1`, `a1bee3a6`) : API, back-office et boutique en ligne, index
   appliqué par l'URL directe.
2. **Relire l'écran Journal avec de vraies lignes**, un quart d'heure : aucune
   phrase n'a encore été lue dans un navigateur, alors que c'est leur seul
   rôle.
3. **Rendre opposables les faits de commande** (§ « Les faits écrits par un
   abonné » ci-dessous).
4. **Trancher l'atelier** (§ « Les gestes de l'atelier »).

**Ce qui retient aussi la note**, sans urgence :

- **Sept types ne sont écrits par aucun test** (`variant.aligned`,
  `appointment.honored`, `appointment.no_show`, `delivery_zone.removed`,
  `order_cutoff.updated`, `volume_commitment.closed`,
  `legal_entity.pre_notification_changed`) : leur forme au catalogue vient de
  la lecture du code, pas d'une écriture éprouvée.
- **Le code n'a été relu que par des agents** : les lots B et D du plan des
  phrases font des centaines de fichiers.
- Les coordonnées encore écrites, par exception décidée :
  l'e-mail et le téléphone du staff (Hugo, 2026-09-18), l'e-mail d'une
  dérogation d'accès ([`todo-derogations-d-acces.md`](todo-derogations-d-acces.md)).
- Le volume (§ « Rétention et volume », § « Un index pour la recherche ») :
  tient aujourd'hui, pas sans y revenir.

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
