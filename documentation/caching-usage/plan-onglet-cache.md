# Plan — l'onglet Cache de la santé

> 📐 **Plan, 2026-11-12.** Demande de Hugo : « un onglet cache avec les
> métriques clés en masthead », puis « la taille du cache dans le temps et le
> hit ratio ». Rien n'est bâti.

## 1. En simple

Un onglet **Cache** dans Santé : en tête, les chiffres de l'heure (taux de
réussite, lectures de base évitées, taille rangée, durée des appels, replis) ;
en dessous, deux courbes sur 30 jours, **la taille du cache** et **le taux de
réussite**, par cache.

Les chiffres sont comptés **dans les objets partagés eux-mêmes** : c'est le
seul endroit commun à tous les containers, donc la mesure est globale.

## 2. Ce qui existe (vérifié le 2026-11-12)

- `ops/health/ops-health.service.ts` sert `caches` (réussites des rayons) et
  `cacheCalls` (durée des appels aux objets des rayons et des journées), lus
  dans la mémoire **d'une** instance.
- `VersionedContents` enregistre ses durées sans qu'elles soient servies, et ne
  compte ni réussite ni raté.

## 3. La conception

- **Les compteurs** : chaque objet (`DayVersions` pour les numéros et les
  contenus, `ProShelves` pour les rayons) compte, par cache et par heure, les
  lectures servies depuis l'objet (réussite), celles qui ont demandé une
  relecture (raté), les rangements, les refus de rangement (trop gros), et
  relève la **taille rangée** (octets et nombre d'entrées). Une table SQLite
  `metrics_hourly(cache, hour, hits, misses, stores, too_large, bytes, entries)`,
  gardée 30 jours. Les caches suivis : `day-versions` (numéros),
  `catalog-admin`, `pim-list`, `pim-referentials`, `pim-product`, rayons pro
  et public.
- **Personnes servies et pic** (décidé par Hugo le 2026-11-12) : l'API joint
  à chaque appel d'un objet une empreinte irréversible de la personne
  (`sha256` d’un sel dérivé de `FIELD_ENCRYPTION_KEY` et de l’identifiant interne, jamais
  d'e-mail, de nom ni de `sub`) ; l'objet compte par heure et par cache les
  personnes DISTINCTES servies (empreintes de l'heure en cours seulement,
  seul le compte reste), un appel sans personne n'est pas compté. Et par
  heure, le plus de requêtes reçues par l'objet en une seconde.
- **Les adresses lues** : `GET <adresse de l'objet>/metrics`, soit
  `http://objets.interne/rayons/metrics` et
  `http://objets.interne/journees/metrics` — un seul hôte intercepté, l'objet
  choisi par le préfixe (`le-rayon-en-cache.md` § 4). C'est cet onglet qui a
  montré, le 2026-11-12, que deux hôtes distincts livraient les deux lectures
  au même objet (`pro-shelves` des deux côtés).
- **Ce que l'API ajoute** : les replis vers la base (objet lent ou en panne)
  et la durée des appels, déjà mesurés par instance, servis à côté.
- **Une route** `GET admin/ops/caches?days=30` sous le droit de la santé :
  la tête (dernière heure, et 24 h) et les séries horaires par cache.
- **L'écran** : onglet Cache de Santé, en-tête de chiffres clés, deux
  courbes (taille, taux de réussite) avec un sélecteur de cache, et un tableau
  par cache. Pas de cache côté écran : on relit à l'ouverture.

## 4. Le bâti

- **C1 — les objets et l'API** : compteurs et table horaire dans les deux
  objets, route de lecture, contrat.
- **C2 — l'écran**.

Un compteur ne doit jamais faire échouer ni ralentir une lecture : il s'écrit
dans l'objet, en fin de réponse, et une erreur de comptage est avalée et
journalisée une fois.
