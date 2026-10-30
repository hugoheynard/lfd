# Le rangement du fournil par catégorie racine — référence

**Bâti le 2026-10-30** (demande de Hugo, non commité à la date d'écriture).
État : ✅ implémenté sur `dev` après commit ; e2e ciblée
`test/production-display.e2e-spec.ts`.

## Ce qui a changé, et pourquoi

Les catégories du référentiel sont imbriquées : « Viennoiserie fine » est
enfant de « Viennoiserie ». Le fournil rangeait par la famille de l'article —
chaque sous-catégorie faisait donc son propre groupe : un onglet de la fiche
d'atelier, un rayon du prévisionnel, une page du dossier du jour.

Décision de Hugo (2026-10-30) : on range par **catégorie racine** (un seul
groupe « Viennoiserie »), et un réglage **« Afficher les sous-catégories »**
(défaut : non) pose, **à l'intérieur** du groupe racine, un intertitre par
sous-catégorie. Jamais un onglet par sous-catégorie.

| Écran ou papier                               | Où le rangement se calcule                                       |
| --------------------------------------------- | ---------------------------------------------------------------- |
| Fiche d'atelier (onglets, liste, Supervision) | serveur — `worksheetGroupsOf` (`production-worksheet-groups.ts`) |
| Dossier du jour, PDF                          | serveur — `dayDossierOf` (`day-dossier.ts`), intertitre au rendu |
| Prévisionnel (matrice)                        | écran — `forecastRayons` (`previsionnel-matrix.ts`)              |
| Dossier du jour, écran d'impression           | écran — `productionRecap` (`production-recap.ts`)                |

Le compte à produire ne range pas par rayon (`countPaperRowsOf`) : inchangé.
La saisie d'une commande (`source-produits`) range toujours par famille avec
`catalogShelves` : ce n'est pas la même décision, et elle n'a pas été touchée.

## L'ordre

Racines par `position`, puis nom (puis id, pour départager deux homonymes).
Dans une racine, les articles rangés **directement** dans la racine viennent en
tête sans intertitre ; les sous-catégories suivent, par `position` puis nom.
L'intertitre est la famille **propre** de l'article (pas le niveau 2 d'un arbre
plus profond). Dans chaque section, le tri habituel : l'ordre reçu à la fiche
d'atelier, le plus gros d'abord au prévisionnel et au dossier. Réglage éteint :
le tri habituel sur tout le groupe racine. Un article sans famille connue reste
dans « Hors catalogue » / « Rayon inconnu », en dernier, sans section.

## Comment la famille arrive au fournil

La production ne lit pas le commerce. La famille lui arrive, comme avant, par
le port qu'elle déclare, `WorkshopShelvesReader`
(`production/channels/commerce/`), que le commerce implémente
(`CatalogWorkshopShelvesReader`) avec `familyView`. Ce chemin a été **étendu,
pas doublé** : `CatalogFamilyView` porte désormais deux champs additifs —
`root` (`{ id, name, position }`, la plus lointaine des parentes, ou la famille
elle-même) et `path` (les ids, la famille en tête). Facultatifs dans le type,
toujours émis par le serveur ; ils voyagent aussi dans le catalogue du
back-office et la tarification, qui servent `familyView`.

Les écrans lisent le réglage sans droit supplémentaire : le prévisionnel le
reçoit dans `ProductionForecastView.showSubcategories`, la fiche d'atelier
reçoit ses `sections` déjà calculées (`WorkshopGroup.sections`, absentes quand
le réglage est éteint).

## Le réglage

Réglages › Production (`/reglages/production/fournil`), carte « Rangement des
fiches », s'enregistre d'un geste. `PUT /admin/production/settings/display`
`{ showSubcategories }`, sous `production_settings`, lu dans
`GET /admin/production/settings` (`display`). Une ligne,
`production.production_display_settings` (clé `house`, migration
`20261031010000_le_rangement_du_fournil`, additive, défaut `false`), auteur
figé, fait `production_display_settings.updated` au journal.

## Ce qui reste, et ce qu'on sait

- Un dossier du jour déjà **archivé** garde le rangement de son premier tirage :
  changer le réglage ne refait pas un papier parti.
- La préférence « dernière fiche ouverte » d'une personne qui pointait une
  sous-catégorie retombe sur la première fiche, une fois.
- Le spécimen du dossier du jour (`lint:pdf-specimens`) est rendu réglage
  éteint : pas de spécimen « avec intertitres ».
