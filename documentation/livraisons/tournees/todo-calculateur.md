# TODO — le calculateur de tournée (lot 7), ce qui reste hors du code

> **Ouvert le 2026-09-29.** Ce que le lot 7 laisse derrière lui et que personne
> n'a encore pris. La conception est dans
> [`plan-preparation-de-tournee.md`](plan-preparation-de-tournee.md), **Lot 7**.
>
> **Relu contre le code le 2026-10-07.** La purge du cache de géocodage et le
> glisser-déposer sont bâtis, rayés ci-dessous. Le préalable de
> confidentialité est dépassé : le géocodage est allumé en production depuis
> le 2026-09-30, et automatique depuis le 2026-10-06 (section suivante).

## ✅ Le paragraphe géocodage est publié (2026-10-07)

> Paragraphe publié en base (document `privacy`) par Hugo, déclaré le 2026-10-07. Ce qui suit est le constat qui l'a réclamé.

Le préalable « publier avant le premier déploiement du lot 7 » est dépassé :
ce déploiement a eu lieu. Le géocodeur (`f0cdae727`) est parti avec le run
`deploy_lfd_api` de `main` du 2026-09-30, et depuis CA0 (`0aa07eb63`, déployé
le 2026-10-06 à 23 h 26) **chaque commande livrée fait situer son adresse à
la passation**, en fond (`DeliveryStopsLocating`) : ce qui manque au carnet et
au cache part à la Base Adresse Nationale. Il suffit pour cela que la clé
`BAN_GEOCODER_URL` soit sur le Worker `lfd-api` ; sans elle, le géocodeur est
éteint (`DisabledGeocoder`, `delivery.module.ts:321-328`).

- **Publier le paragraphe « géocodage » maintenant.** Le texte du dépôt
  ([`../../legal/texte-politique-de-confidentialite.md`](../../legal/texte-politique-de-confidentialite.md))
  le porte depuis le lot 7, encore à l'état de projet (un `[À VÉRIFIER]` sur
  l'opérateur du service). La page que lisent les clients **vit en base**
  (document légal `privacy`) et ne change que par le back-office : tant
  qu'elle ne le dit pas, des adresses de clients partent à la Base Adresse
  Nationale sans que la politique l'annonce. Geste de Hugo.
- **Deux contrôles, hors dépôt, pour Hugo :**
  1. **la clé `BAN_GEOCODER_URL`** — la variable GitHub est posée (relu le
     2026-10-07 par `gh variable list` : mise à jour le 2026-09-29) ; que le
     Worker la porte, le bulletin de démarrage de `lfd-api` le dit : sans
     elle, « Géocodage des arrêts de livraison » y figure comme capacité
     éteinte (`capability-audit.ts:240-247`) ;
  2. **le document légal `privacy` en base** porte-t-il le paragraphe ?
- **Éteindre en attendant la publication, si on le choisit : vider la
  variable GitHub ne suffit pas.** Le déploiement ne pose une clé sur le
  Worker que si sa valeur est non vide, et n'en retire jamais
  (`deploy_lfd_api.yml:317-321`) : il faut retirer la clé du Worker `lfd-api`
  lui-même.

## Dette

- **Le banc à 200 clients n'a pas été mesuré dans le conteneur.** Sur un M1
  Pro, le seuil est tenu depuis le 2026-10-06 (complet p95 4,1 s, max 5,3 s,
  pour 5 s visés ; propositions identiques sur les 20 graines,
  `bench:composition:quality`). La marge est de 20 % : si le conteneur est
  plus lent d'autant, le seuil retombe. Prochaines pistes, exactes elles
  aussi : lire la matrice par index plutôt que par `Map` (~1,4 s sur la
  graine 9, mais c'est le port `CostFn` et son adaptateur qu'il faut
  changer), et ne lire chaque arête qu'une fois dans `scoreVehicle` (les deux
  passes relisent les mêmes). Détail : `composition-automatique.md` §5 point 3.

- ~~**La purge du cache de géocodage à 365 jours n'est pas bâtie.**~~ Bâtie le
  2026-10-06 (`7b251c122`) : le cron de nuit `45 3 * * *` du Worker appelle
  `admin/livraison/geocodage/sweep` (`apps/lfd-api/container/worker.ts:311`),
  servi par `geocode-purge-sweep.controller.ts`, puis
  `purge-stale-geocodes.handler.ts` et `prisma-geocode-cache.pruner.ts`. Le
  balayage ne part que si le Worker porte `RECOMPUTE_TOKEN`
  (`apps/lfd-api/container/worker.ts:299-303`). Détail :
  [`../../legal/rgpd-purge-du-geocodage.md`](../../legal/rgpd-purge-du-geocodage.md).
- **Les adresses de type « place »** répondent souvent sous le seuil de score
  (0,489 pour une place de Chambéry, seuil 0,5) : elles restent « non
  situées ». Le remède est le point GPS saisi dans le carnet, pas un seuil
  abaissé.

## À juger à l'usage (Hugo, 2026-09-29)

- **Le prix de la marge de sécurité.** Sur la journée du jeu de données,
  remesurée le 2026-10-03 après CA2 (`recorded-day.spec.ts`), la marge
  d'usine ne coûte rien — elle fait même **mieux** que pas de marge : à
  20 min, **une** tournée (258 km, 388 min de livreur, 17 min d'attente) et
  aucun arrêt dans les vingt dernières minutes ; à 0, **deux** tournées
  (266 km, 427 min, 27 min d'attente) et 4 arrêts dans la marge. Le spec le
  dit lui-même : à marge 0, l'heuristique reste sur deux tournées alors
  qu'une seule tiendrait — « un optimum local, pas une règle ». Le prix que
  ce point citait (« une tournée, 44 km et 69 min de plus » pour un arrêt
  protégé) lisait le tableau du lot 7 ter, d'avant CA2, dont la conclusion
  s'est inversée ([`plan-preparation-de-tournee.md`](plan-preparation-de-tournee.md),
  sous L7t-C4). Reste à juger à l'usage, sur de vraies journées : le poids
  de la marge (`MARGIN_WEIGHT`,
  `apps/lfd-api/src/delivery/domain/services/vehicle-plan.ts`) et sa durée
  par défaut — garder, rendre la marge moins chère, ou la baisser.

- ~~**Le glisser-déposer au doigt et au clavier** (écran Planifier).~~ Fait le
  2026-10-03 (`fb52150f7`) : l'écran Planifier a disparu ; l'organisateur des
  tournées (`rounds-board`, `round-column`) glisse avec `@angular/cdk`
  (`262087491`, souris et toucher), et chaque geste a son équivalent clavier —
  « Mettre dans » (en fin de tournée), ↑ ↓ (le rang), « Retirer de la
  tournée ». Reste à juger à l'usage : au clavier, un arrêt passe d'une
  tournée à une autre en deux gestes (« Retirer de la tournée », puis
  « Mettre dans »).

## Le planificateur de tournées (lfd-route-planner) — à faire (Hugo, 2026-09-30)

- **Séparer « refaire la carte » et « redéployer le Worker ».** Aujourd'hui le
  même workflow (`deploy_lfd_route_planner.yml`) télécharge l'extrait,
  reconstruit le graphe OSRM et les tuiles, repousse l'image PUIS déploie le
  Worker — à chaque modification du code du planificateur, alors que la carte
  n'a pas changé. Cible : deux déclencheurs — la carte (mensuel + manuel)
  publie une image et des tuiles datées ; le Worker (push du code) redéploie
  en réutilisant la dernière image publiée.
- **Télécharger la Savoie seule, pas Rhône-Alpes.** Geofabrik ne publie pas
  d'extrait par département : le workflow tire Rhône-Alpes (≈ 530 Mo) puis
  découpe au polygone de la Savoie (≈ 53 Mo). OpenStreetMap France publie
  l'extrait du département, mis à jour chaque jour :
  `https://download.openstreetmap.fr/extracts/europe/france/rhone_alpes/savoie.osm.pbf`
  (66 Mo, vérifié le 2026-09-30). Le prendre directement supprimerait le
  téléchargement de 530 Mo et l'étape de découpe ; à vérifier : la frontière
  exacte (La Rosière, les Arcs, Val d'Isère y sont) et la tenue du service
  (miroir associatif, sans engagement de disponibilité — garder Geofabrik en
  repli).

## La capacité du véhicule à la composition — reste (Hugo, 2026-10-03)

« Proposer » tient compte de la place depuis CA4 (2026-10-06, `4010899a1`) :
voir [`composition-automatique.md`](composition-automatique.md), §5. Une
commande aux bacs inconnus est placée sans contrôle et sa tournée dite
« place non vérifiée » (correction du 2026-10-06). Ce qui reste :

- la composition à la main **avertit** sans refuser : une jauge litres +
  plancher par tournée ;
- prévenir quand une tournée qui tenait sur l'estimation — ou dont la place
  n'était pas vérifiée — ne tient plus une fois les vrais bacs déclarés ;
- la mention « place non vérifiée » n'est que dans l'aperçu de la
  proposition : la composition enregistrée ne la porte pas (sa vue ne lit pas
  la demande en bacs) ;
- le poids (I5) reste hors champ tant qu'aucun bac n'en porte ;
- les lignes des commandes sans bac déclaré sont lues une commande à la fois
  (le port du commerce n'a pas de lecture groupée,
  `proposal-capacity.ts:43-45`) : par « Proposer » et, depuis CA7
  (`b1d90d8c5`), par les places suggérées que l'écran des tournées demande à
  chaque lecture d'un jour qui a des tournées et des commandes à répartir
  (`get-delivery-placement-suggestions.handler.ts:134-135`) — environ 200
  requêtes à 200 clients, à chaque fois. À grouper si le banc le montre.

## Des piles mêlant plusieurs tailles de bac — à réfléchir (Hugo, 2026-10-03)

Aujourd'hui une pile ne porte qu'**un seul type** de bac : un bac va sur la
dernière pile ouverte de SON type (`Stacker.stackFor`, par `binType.id`),
sinon il en ouvre une ([`algorithme-de-chargement.md`](../chargement/algorithme-de-chargement.md), §3.2).
Les raisons : deux bacs du même modèle s'emboîtent, ont la même empreinte, et
`maxStack` est propre à chaque type.

Le prix : plus de piles basses — une rangée porte au moins une pile par type
présent, et une pile peut finir à un bac. Piste, si le dépôt empile vraiment
des tailles différentes :

- autoriser le mélange entre types de **même empreinte** (Bac M et Bac L, tous
  deux 60 × 40) ;
- le plus haut (ou le plus lourd) en bas ;
- une hauteur maximale de pile mesurée (contre le plafond) plutôt qu'en
  nombre de bacs. Pour une pile d'un seul type, le plafond est tenu depuis le
  2026-10-06 (`553422d02`, G5e) par `stackLevels`, en étages ; une pile mêlée
  devra additionner les hauteurs de ses bacs — au millimètre, comme eux
  depuis la même date.

À trancher d'abord avec le dépôt : empile-t-on des Bacs M sur des Bacs L ?

## Les secteurs doublent le temps de « Proposer » (2026-10-07)

« Proposer » compose deux fois depuis le 2026-10-07 : une fois depuis
l'insertion seule, une fois depuis des secteurs (un par véhicule, par temps
de route, `sectors.ts`), et garde la meilleure (`bestComposition`,
`propose-rounds.ts`). Banc à 200 clients, poste, temps processeur :

| Version                            | complet médiane · p95 | coût moyen | à répartir en plus |
| ---------------------------------- | --------------------- | ---------- | ------------------ |
| avant (partir tard, sans secteurs) | 3,6 · 6,5 s           | référence  | —                  |
| secteurs seuls (écarté)            | 4,1 · 5,8 s           | −11 %      | 3 jours sur 20     |
| les deux, meilleure gardée         | 7,8 · 12,4 s          | −11,5 %    | jamais             |

Les secteurs seuls ont été écartés : sur la journée enregistrée
(`recorded-day.spec.ts`), ils ouvrent deux tournées là où une suffit (434 min
contre 388). Le seuil de 5 s n'était déjà plus tenu avant (6,5 s, depuis
`EARLY_WEIGHT`). Pistes : ne composer depuis les secteurs que les jours où
plus d'un véhicule sert ; borner `improvePlans` sur la composition perdante ;
ou un nombre de secteurs choisi par la demande plutôt qu'un par véhicule. Au
volume actuel (une vingtaine d'arrêts), le calcul reste sous la seconde.

## La vitesse de « Proposer » (2026-10-05)

La borne L7b-C2 (60 arrêts en 2 s de processeur) a été **relâchée à 3 s en
CI** le 2026-10-05, sur décision de Hugo : mesuré 0,56 s sur un poste, 2,06 s
sur la machine de la CI. La promesse produit reste 2 s. Ce qui coûte, relevé
au profileur le 2026-10-04 :

- `scoreVehicle` (`vehicle-plan.ts`) refait **tout le véhicule, en deux passes**
  (la passe arrière `latestDepartures` de CA2, puis la passe avant) pour
  **chaque geste essayé** par `improvePlans` — des milliers par proposition ;
  `latestDeparture` seul pèse près de la moitié du temps ;
- la mémoïsation par configuration (`memoizedScore`, 2026-10-04) n'a gagné
  que 20 % : les configurations se répètent peu. **Retirée le 2026-10-06** :
  à 200 arrêts, sa clé coûtait plus que ce qu'elle épargnait.

À faire, du plus rentable au plus lourd :

1. **Score incrémental** : un geste ne touche qu'une ou deux tournées ; garder
   par tournée ses horaires (départ au plus tard, arrivées) et ne recalculer
   que la tournée changée et la chaîne qui la suit dans le véhicule.
2. ~~**Élaguer avant de scorer**~~ — fait le 2026-10-06 (`aca1ee895`), pour
   tous les gestes et pas seulement dans une tournée : un minorant du coût
   (`apps/lfd-api/src/delivery/domain/services/cost-floor.ts`) écarte sans `scoreVehicle` ce qui ne peut pas améliorer,
   sans changer aucun résultat. La borne de CI à 60 arrêts n'a pas été
   remesurée.
3. **Fusionner les deux passes** de `scoreVehicle` quand aucune fenêtre ne
   contraint la tournée.
4. **Mesurer sur le conteneur** au banc à 200 clients (p95 < 5 s) : c'est le
   seul temps qui compte, et il n'a jamais été mesuré.

Revenir à 2 s en CI une fois 1 fait, et la CI remesurée.
