# Plan — retirer l'ancien chemin du catalogue et des opérations

> 📐 **Doc-first, rien n'est bâti** (réécrit le 2026-10-16 au soir, après la
> bascule en production). Retire du code qui écrit en base et finira dans le
> **runbook** : `vitruve` d'office avant de bâtir (CLAUDE.md §9 bis). Contredit
> le même soir ; ses corrections, en fin de document, priment.
>
> Il remplace la version du même jour (« plus d'interrupteurs, réémission au
> démarrage »), contredite par `vitruve` puis rendue sans objet : la bascule a
> été faite **à la main** le soir même. Ses trois objections bloquantes
> portaient sur la bascule ; elles sont rappelées au §5.

## 0. La demande (Hugo, 2026-10-16)

> « Et donc ensuite on peut se débarrasser de l'ancien système ? » — puis :
> « écris-moi le plan, avec un état des lieux de ce qui a été fait aujourd'hui
> et le travail à faire ».

## 1. État des lieux — ce qui a été fait le 2026-10-16

### En production (`main`)

Promotion de `dev` sur `main` à `08a0cb866`, puis trois révisions de l'API
(`0ede26f33`, `01b4d0f82`, `dcb18aca7`). Sauvegarde : l'automatique du
2026-10-16 7 h 01 (Hugo, en connaissance de cause : produits saisis depuis).
21 migrations relues par `lecteur-de-migrations` (18 additives, 3
contraignantes, 2 destructrices — le canal retiré). `pnpm test` à la racine
vert sur `08a0cb866` (10 621 unitaires, 3 636 e2e de l'API).

| Chantier                           | Ce qui tourne en production                                                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Opérations au commerce**         | interrupteur `OPERATIONS_AT_COMMERCE` **ouvert** (constaté à l'écran) ; l'écran « Opérations » (`/operations`) écrit ; l'ancien écran du référentiel est retiré ; heure de clôture par opération. Reprise : **0 opération au référentiel**, rien à reprendre. |
| **Catalogue synchronisé**          | bascule d'audience appliquée (**0 fiche désactivée**, aperçu vide) ; `CATALOG_FACTS_ENABLED` **posé** et relu par `dcb18aca7` — à confirmer après la réémission (§2) ; lots 1, 2a, 2b, P, S, D, 3 en service.                                                 |
| **Prix pro (lot S)**               | la base est en `ratio_ttc` (requête de Hugo) : le rapport sert encore de repli ; la bascule en prix saisi n'est pas faite.                                                                                                                                    |
| **Droits**                         | `lfc_catalog` (L1 + L2 : gardes sur `lfc_catalog`, `b2b_catalog` retiré), `lfc_loyalty` (F1 + F2 : la fidélité en Gestion Boutique, `/fidelite`), `lfc_operations`, `lfc_legal` — **à accorder à l'écran par Hugo**.                                          |
| **Ancien canal de vente en ligne** | retiré du code, de la base (deux colonnes, mesure : 1 point de vente) et de la doc ; porte `lint:former-channel-name`.                                                                                                                                        |
| **Démo**                           | composition du matin par le calcul.                                                                                                                                                                                                                           |
| **Écrans**                         | carte « Basculer vers les faits » (page Intégrations) ; texte de la limite de commande ; encart des photos refusées après création (`afecebf6c`, sur `dev` à pousser).                                                                                        |

### Ce qui n'est pas fait

- **Réémettre tout** : en cours au moment d'écrire (étape 7 du runbook, carte
  « Basculer vers les faits ») ; puis contrôle de parité.
- **Accorder les droits à l'écran** et retirer `b2b_catalog` des rôles (Hugo).
- **Second passage à midi dans la démo** : le calcul ne l'ouvre pas avec trois
  camionnettes libres (diagnostic du 2026-10-16) ; options (a) flotte réduite,
  (b) calcul, (c) renoncer — à trancher. **Bug possible vu au passage** : une
  tournée qui reçoit un arrêt de transfert perd son horaire prévu — non
  confirmé.

## 2. Le point d'arrêt avant de retirer quoi que ce soit

Le code de l'ancien chemin ne part **qu'après** avoir constaté, en production :

1. la réémission a fini : aucune fiche en échec, boîte d'envoi vide, aucune
   lettre morte ;
2. « Catalogue publié » liste toutes les fiches (inactives comprises, avec leur
   état), et le croissant et le pain au chocolat sont toujours en vente ;
3. une fiche modifiée au référentiel arrive seule sur la plateforme, sans push
   ni réception ;
4. la parité (`GET /admin/catalog/parity`) ne montre que les écarts attendus.

Tant que ce n'est pas constaté, l'ancien chemin est le retour arrière : on
referme `CATALOG_FACTS_ENABLED` et une révision neuve le rouvre.

## 3. Le travail à faire

### R1 — Les deux interrupteurs disparaissent

Le code suit toujours le chemin ouvert. Lecteurs à retirer (relevé du
2026-10-16, `catalogFactsEnabled()` / `operationsAtCommerce()`) :
`platform/config/app-config.ts`, `appBootstrap/media-carriers.module.ts`,
`b2b/catalog/application/ingest-catalog.service.ts`,
`b2b/catalog/application/shop-catalogue-pricing.service.ts`,
`b2b/catalog/application/handlers/on-operation-image-changed.handler.ts`,
`b2b/catalog/infrastructure/prisma-catalog-operations.reader.ts`,
`b2b/catalog/infrastructure/prisma-received-operations.reader.ts`,
`b2b/operations/infrastructure/config-operation-writing.switch.ts` (et son
port), `b2b/storefront/infrastructure/catalog-backed-storefront-operations.reader.ts`,
`pim/channels/b2b-platform/products/catalog-facts.emitter.ts`,
`catalog-reemission.service.ts`, `catalog-rules.emitter.ts`,
`pim/channels/b2b-platform/application/reemit-catalog.ts`,
`pim/operations/infrastructure/config-referential-operation-writing.ts`.
Les deux variables sortent d'`AppConfig`, de `container/worker.ts`, du
workflow `deploy_lfd_api.yml` et de `ops/secrets-et-variables.md` ; les
erreurs qui nomment l'interrupteur (`OperationWritingClosedError`,
`OperationsNotAtCommerceError`) partent.

**`PIM_PUBLICATION_ENABLED`** : l'émetteur le lit aussi
(`catalog-facts.emitter.ts`). Décider s'il reste (il protège un environnement
sans plateforme) ou part — question à Hugo (§4).

### R2 — Le push et la réception partent

Référentiel : `push-b2b-catalog.ts`, `push.service.ts`, `push.controller.ts`,
le pilote `driver.ts` et sa liaison, l'écran « Publication »
(`pim/publication/**`) et le bouton « Publier vers les canaux » de la liste des
produits. Les **révisions** du référentiel restent (photographies, retour en
arrière d'une fiche) ; seule leur **publication** part.

Plateforme : `ingest-catalog.service.ts`, la boîte d'arrivée
(`catalog-delivery` : entité, dépôt, événements, `accept-delivery`,
`get-pending-delivery`, `admin-catalog-delivery.controller.ts`,
`in-process-catalog.driver.ts`, `catalog-delivery-products.reader.ts`,
`in-process-delivery-facts.reader.ts`, `appBootstrap/delivery-feed.module.ts`),
`preview-catalog-push.handler.ts`, et `B2B_DELIVERY_INBOX`. Front : l'écran
« Réception » (`b2b/reception/**`) — **sa section « Opérations reçues »**
sert encore la surcharge des opérations : à vérifier avant de la retirer.

### R3 — Les versions du catalogue, et ce qu'une commande fige

🔴 **Point dur.** Une commande porte un `catalogVersionId`
(`b2b/orders/domain/entities/order.ts:66`) : la version acceptée au moment de
la commande. Sans push, plus aucune version ne se crée. Le lot 5 du plan qui
fait foi prévoyait de la remplacer par une **estampille `seq`** (le numéro de
publication de la fiche). Décision à prendre (§4) : estampiller par `seq`, ou
ne plus rien estampiller (la ligne de commande porte déjà son snapshot de
prix, nom et TVA). La colonne reste en base.

### R4 — La santé et la parité

`check-catalog-health` compare le miroir à la dernière version acceptée : sans
versions, elle n'a plus de référent. `check-catalog-parity` et
`ops_catalog_parity.yml` comparent le référentiel au miroir : à garder si on
leur donne le bon référent (le fait le plus récent de chaque fiche), sinon à
retirer. Décision §4.

### R5 — Les opérations au référentiel (lot 4 des opérations)

`pim/operations/**` (domaine, application, http, infrastructure), ce que le
push portait des opérations, la surcharge de réception si elle n'a plus de
lecteur. Les tables restent.

### R6 — La matrice des canaux (lot 5 du plan qui fait foi)

Le lien au canal B2B et la matrice partent ; **les contextes de vente
restent** (TVA par contexte, Hugo 2026-10-16). Le « point de vente » que le
lot 5 cite est à identifier avant (§4).

### R7 — Les tests

26 fichiers `apps/lfd-api/test/` s'appuient sur l'ingestion, le push ou
l'acceptation (relevé du 2026-10-16) ; `test/setup-env.ts` force les deux
interrupteurs fermés. Chaque suite **bascule sur les faits** (semer par le
référentiel, puis attendre le fait) ou **meurt avec ce qu'elle éprouvait**.
Lister les deux colonnes avant de bâtir.

### R8 — La doc

`catalogue-synchronise.md` perd son §6 bis (« tant que les faits sont fermés »)
et son §6 ; le runbook perd « Basculer le catalogue vers les faits » (fait) et
gagne « réémettre une fiche ». Ce plan devient une ligne de la doc d'état.

## 4. Questions à Hugo

1. **`PIM_PUBLICATION_ENABLED`** : on le garde (une instance sans plateforme
   n'émet rien) ou il part avec les autres ?
2. **R3 — la commande** : estampille `seq` par ligne, ou plus d'estampille ?
3. **R4 — la parité** : on la garde avec un nouveau référent, ou on la retire ?
4. **R6 — le « point de vente »** du lot 5 : le regarder ensemble.

## 5. Lots proposés

| Lot | Contenu                                                                   | Condition                       |
| --- | ------------------------------------------------------------------------- | ------------------------------- |
| X1  | R1 (interrupteurs) + R7 pour les suites qui ne testaient que la fermeture | le point d'arrêt du §2 constaté |
| X2  | R2 (push, réception) + R4 + R7                                            | X1 en production                |
| X3  | R3 (la commande)                                                          | décision Q2                     |
| X4  | R5 (opérations au PIM) + R6 (matrice)                                     | X2 en production                |
| X5  | R8 (doc), les tables mortes listées pour un ordre de Hugo                 | à la fin                        |

## Rappel — la contradiction de `vitruve` sur la version précédente

Trois objections bloquantes, toutes sur une réémission **au démarrage** : un
verrou consultatif qui ne tient pas sur une réémission en plusieurs
transactions ; un échec au démarrage sans bonne issue ; une reprise des
opérations bloquée tant que les faits n'étaient pas appliqués. **Sans objet
depuis le 2026-10-16** : la réémission est un geste à l'écran et la reprise
n'avait rien à reprendre. Ses objections sérieuses qui restent sont reprises
ci-dessus : la santé qui sonnerait (R4), la boîte de réception qui recevrait
des push sans effet (R2), les suites e2e (R7), le retour arrière (§2).

## Contradiction de `vitruve` (2026-10-16 au soir), qui prime sur §3 et §5

- **R3 est déjà actif en production** (BLOQUANT, vérifié) : la passation lit
  `catalogVersions.currentId()` (`b2b/orders/application/services/order-drafting.service.ts:174`),
  un `findFirst` sur la version la plus récente
  (`b2b/catalog/infrastructure/prisma-catalog-version.repository.ts:274-279`).
  Faits ouverts, plus aucune version ne se crée : toute commande passée depuis
  reçoit l'identifiant de la dernière version poussée, alors que ses lignes
  viennent des faits — l'« estampille en avance » que le commentaire du même
  fichier (l. 168-173) appelle un mensonge. **Correction de l'ordre** : un lot
  **X0**, avant tout le reste, décide l'estampille (Q2) et l'applique ; jusque-là,
  pas d'activité commerciale (week-end), aucune commande n'est attendue.
- **La liste de R1 est incomplète de moitié** (BLOQUANT) : une trentaine de
  fichiers de production lisent les interrupteurs, dont `env-readers.ts`,
  `operation-media-focus.ts`, `operation-carriers-by-switch.ts`,
  `commerce-operation-media-carriers.ts`, `shop-catalogue-operations.ts`,
  `effective-operation.ts`, `received-operations.reader.ts`,
  `operation-library-alts.ts`, `storefront-catalog-operations.ts`, le
  contrôleur, les vues, la migration et les erreurs de `b2b/operations`, et
  côté PIM `catalogue.module.ts`, `catalog-emitter.ts`,
  `prisma-operation-media-carriers.ts`, `apply-audience-switch.ts` et
  `pim/operations/**`. X1 part d'un `grep` refait au premier jour, pas de la
  liste du §3.
- **La santé sonnera dès maintenant** (BLOQUANT) : `ops_catalog_parity.yml:71`
  interroge `admin/ops/catalog-health`, qui compare le miroir à la dernière
  version acceptée — un référent qui ne bouge plus. **Correction** : X0 désarme
  ce cron (ou lui donne le fait le plus récent comme référent) ; R4 tranche ensuite.
- **Le point d'arrêt** (SÉRIEUX) dit qui constate, comment (boîte d'envoi et
  lettres mortes : la carte de santé `ops` ; « Catalogue publié » ; une fiche
  modifiée et relue), et où c'est écrit (une ligne datée dans ce plan). La
  parité n'en fait pas partie tant que R4 n'a pas tranché.
- **Le retour arrière** (SÉRIEUX) : après X1, plus d'interrupteur ; après X2,
  plus de push. X1 est le **point de non-retour** ; au-delà, revenir = revert
  et redéploiement.
- **`PIM_PUBLICATION_ENABLED`** (SÉRIEUX) est lu aussi par
  `catalog-rules.emitter.ts`, `catalog-reemission.service.ts`,
  `reemit.controller.ts`, `audience-switch.controller.ts`,
  `pim/publication/publication-switch.ts`, `publication.controller.ts`, le
  conteneur et le workflow, avec sa suite `pim-publication-switch.e2e-spec.ts`.
  Si `pim/publication/**` part en R2, la question Q1 est déjà à moitié tranchée.
- **La surcharge des opérations** (SÉRIEUX) : `admin-catalog-operations.controller.ts`,
  `CatalogOperationOverride`, `operation-override-panel`, `received-operations*`
  et `effective-operation.ts` la servent encore. Opérations écrites au
  commerce, elle n'a plus d'objet : à **trancher** (Q5), pas « à vérifier ».
- **R7** : le compte réel est à refaire (84 fichiers sur un filtre large, 26
  annoncés) ; `test/orders.e2e-spec.ts:632-672` affirme `catalogVersionId` et
  dépend de Q2 ; les deux suites `*-closed` et leurs scènes partent avec X1.
- **L'ordre X1 / X4** : X1 retire la garde d'écriture des opérations au PIM
  (`config-referential-operation-writing.ts`) ; le contrôleur PIM écrirait
  alors jusqu'à X4. **Correction** : la garde reste en refus permanent en X1,
  ou `pim/operations/http` part dès X1.
- **Les révisions du référentiel** : vérifier si leur retour en arrière
  republie par le push ; si oui, il faut un autre chemin avant X2.
- Mineurs : liens et chemins manquants ; « 18 + 3 + 2 » migrations, à recompter.

**Questions ajoutées** : Q5 — la surcharge des opérations reçues part-elle ?

## Décisions de Hugo (2026-10-16 au soir)

- **Q1 — `PIM_PUBLICATION_ENABLED` part aussi** : « ça ne sert plus à rien, moins
  on a de variables mieux c'est ». Il sort avec les deux autres interrupteurs
  (X1) : l'émetteur, la réémission, la bascule et leurs routes émettent
  toujours ; `pim/publication/publication-switch.ts` et sa suite
  `pim-publication-switch.e2e-spec.ts` partent ; la variable sort du conteneur,
  du workflow et de `ops/secrets-et-variables.md`. `B2B_DELIVERY_INBOX` part avec
  la réception (X2).
