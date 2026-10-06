# TODO — le calculateur de tournée (lot 7), ce qui reste hors du code

> **Ouvert le 2026-09-29.** Ce que le lot 7 laisse derrière lui et que personne
> n'a encore pris. La conception est dans
> [`plan-preparation-de-tournee.md`](plan-preparation-de-tournee.md), **Lot 7**.

## 🔴 Avant d'activer le géocodage en production

- **Reporter le paragraphe « géocodage » dans la page de confidentialité
  publiée.** Le texte du dépôt
  ([`../legal/texte-politique-de-confidentialite.md`](../legal/texte-politique-de-confidentialite.md))
  le porte depuis le lot 7 ; mais la page que lisent les clients **vit en base**
  (document légal `privacy`), et ne change que par le back-office. Tant qu'elle
  ne le dit pas, des adresses de clients partiraient à la Base Adresse
  Nationale sans que la politique l'annonce. Geste de Hugo.
- La variable GitHub `BAN_GEOCODER_URL` existe depuis le 2026-09-29
  (`https://api-adresse.data.gouv.fr`) : le géocodage s'allumera au premier
  déploiement de `lfd-api` qui contient le lot 7. **Le paragraphe doit être
  publié avant ce déploiement.**

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

- **La purge du cache de géocodage à 365 jours n'est pas bâtie.** Une entrée
  périmée n'est plus lue, mais sa ligne reste en base (`delivery_geocode`). Un
  balayage quotidien, comme celui des traces de journée, suffira. La ligne de
  conservation du texte légal est marquée « À VÉRIFIER » en attendant.
- **Les adresses de type « place »** répondent souvent sous le seuil de score
  (0,489 pour une place de Chambéry, seuil 0,5) : elles restent « non
  situées ». Le remède est le point GPS saisi dans le carnet, pas un seuil
  abaissé.

## À juger à l'usage (Hugo, 2026-09-29)

- **Le prix de la marge de sécurité.** Sur la journée du jeu de données, avec
  la marge à 20 min, protéger UN arrêt de plus dans la marge coûtait une
  tournée, 44 km et 69 min de livreur de plus (lot 7 ter, tableau sous
  L7t-C4). C'est l'ordre tranché (« d'abord le client ») ; le prix est fixé
  par `MARGIN_WEIGHT` (`apps/lfd-api/src/delivery/domain/services/vehicle-plan.ts`).
  À revoir quand l'équipe aura planifié de vraies journées : garder, rendre la
  marge moins chère, ou baisser la marge par défaut.
- **Le glisser-déposer au doigt et au clavier** (écran Planifier). Il est en
  HTML5 natif : souris seulement. Remède : `@angular/cdk` (drag-drop), qui
  n'est pas encore une dépendance du dépôt. Les listes de composition, sous le
  planificateur, restent la voie clavier en attendant.

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

« Proposer » tient compte de la place depuis CA4 (2026-10-06, non commité) :
voir [`composition-automatique.md`](composition-automatique.md), §5. Ce qui
reste :

- la composition à la main **avertit** sans refuser : une jauge litres +
  plancher par tournée ;
- prévenir quand une tournée qui tenait sur l'estimation ne tient plus une
  fois les vrais bacs déclarés ;
- le poids (I5) reste hors champ tant qu'aucun bac n'en porte ;
- les lignes des commandes sont lues une commande à la fois par « Proposer »
  (le port du commerce n'a pas de lecture groupée) : environ 200 requêtes à
  200 clients. À grouper si le banc le montre.

## Des piles mêlant plusieurs tailles de bac — à réfléchir (Hugo, 2026-10-03)

Aujourd'hui une pile ne porte qu'**un seul type** de bac : un bac va sur la
dernière pile ouverte de SON type (`Stacker.stackFor`, par `binType.id`),
sinon il en ouvre une ([`algorithme-de-chargement.md`](algorithme-de-chargement.md), §3.2).
Les raisons : deux bacs du même modèle s'emboîtent, ont la même empreinte, et
`maxStack` est propre à chaque type.

Le prix : plus de piles basses — une rangée porte au moins une pile par type
présent, et une pile peut finir à un bac. Piste, si le dépôt empile vraiment
des tailles différentes :

- autoriser le mélange entre types de **même empreinte** (Bac M et Bac L, tous
  deux 60 × 40) ;
- le plus haut (ou le plus lourd) en bas ;
- une hauteur maximale de pile **en cm** (contre le plafond, G5e) plutôt qu'en
  nombre de bacs.

À trancher d'abord avec le dépôt : empile-t-on des Bacs M sur des Bacs L ?

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
2. ~~**Élaguer avant de scorer**~~ — fait le 2026-10-06 (non commité), pour
   tous les gestes et pas seulement dans une tournée : un minorant du coût
   (`apps/lfd-api/src/delivery/domain/services/cost-floor.ts`) écarte sans `scoreVehicle` ce qui ne peut pas améliorer,
   sans changer aucun résultat. La borne de CI à 60 arrêts n'a pas été
   remesurée.
3. **Fusionner les deux passes** de `scoreVehicle` quand aucune fenêtre ne
   contraint la tournée.
4. **Mesurer sur le conteneur** au banc à 200 clients (p95 < 5 s) : c'est le
   seul temps qui compte, et il n'a jamais été mesuré.

Revenir à 2 s en CI une fois 1 fait, et la CI remesurée.
