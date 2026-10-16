# Plan — plus d'interrupteurs : les faits du catalogue et les opérations au commerce deviennent la norme

> 📐 **Doc-first, rien n'est bâti** (rédigé le 2026-10-16). Porte une
> **migration de données** (la reprise des opérations) et finira dans le
> **runbook** : `vitruve` d'office (CLAUDE.md §9 bis). Sa contradiction est en
> fin de document.
>
> ⏸️ **Reporté le 2026-10-16 (Hugo, option B)** : la promotion part avec les
> interrupteurs ; ce plan devient le lot suivant, après correction des
> objections ci-dessous.

## 0. La demande (Hugo, 2026-10-16)

> « Si tu dégages les interrupteurs comme pour le catalogue pub/sub, ça devient
> le nouveau truc, non ? » — puis, pour la réémission : « automatique, non ? »

## 1. Ce qui existe (ouvert le 2026-10-16)

Deux interrupteurs, lus par `AppConfig` et passés par
`.github/workflows/deploy_lfd_api.yml:267,273` (variables GitHub, absentes =
fermées) :

- **`CATALOG_FACTS_ENABLED`** — `catalogFactsEnabled()`. Fermé : le push porte
  fiches, familles et opérations, et la réception les applique. Ouvert : le
  référentiel émet un fait par enregistrement, et l'ingestion d'un push ne
  touche plus ni fiche ni famille (`b2b/catalog/application/ingest-catalog.service.ts:72`).
  Plan : [`plan-catalogue-synchronise-par-audience.md`](plan-catalogue-synchronise-par-audience.md), lot 2b ; état :
  [`catalogue-synchronise.md`](catalogue-synchronise.md).
- **`OPERATIONS_AT_COMMERCE`** — `operationsAtCommerce()`. Fermé : l'opération
  vit au référentiel, l'écran du commerce lit en 409, ses écritures refusent.
  Ouvert : le commerce écrit, le PIM refuse, la vitrine lit au commerce, le push
  ignore les opérations (`ingest-catalog.service.ts:169`). Lecteurs : une
  vingtaine de fichiers sous `b2b/catalog`, `b2b/operations`, `appBootstrap`
  (`operation-carriers-by-switch.ts`, `media-carriers.module.ts`).
  Plan : [`../operations-datees/plan-l-operation-passe-au-commerce.md`](../operations-datees/plan-l-operation-passe-au-commerce.md).

En production, les deux sont fermés (variables absentes) ; `PIM_PUBLICATION_ENABLED`
et `B2B_DELIVERY_INBOX` valent `true`.

## 2. Décisions proposées

### I1 — Les deux interrupteurs disparaissent

Le code ne lit plus `catalogFactsEnabled()` ni `operationsAtCommerce()` : il
suit toujours le chemin « ouvert ». Les branches « fermé » partent dans le même
lot (pré-release, §0) ; les deux variables sortent de `AppConfig`, du
workflow et de `documentation/ops/secrets-et-variables.md`. Les tests qui
fermaient un interrupteur pour éprouver l'ancien chemin sont retirés ; ceux qui
l'ouvraient n'ont plus à le faire.

### I2 — La réémission du catalogue, automatique, une seule fois

Au premier démarrage de la version, le catalogue entier est réémis
(`CatalogReemission.everything()`), puis un **marqueur** en base dit que c'est
fait. Les démarrages suivants le lisent et ne refont rien.

- Rejouer est **sans danger** : le récepteur n'applique un fait que si son
  `seq` dépasse `applied_seq`. Le marqueur n'est là que pour ne pas réémettre
  à chaque démarrage de chaque instance.
- Plusieurs instances démarrent en même temps : un verrou consultatif
  Postgres, pris avant de lire le marqueur, fait qu'une seule réémet.
- La réémission passe par la boîte d'envoi durable : un échec se relance par
  le relais, comme tout fait.

### I3 — La reprise des opérations reste un geste de Hugo

Déployée, l'écran « Opérations » écrit, le PIM refuse, et la boutique lit au
commerce — qui est vide. Jusqu'à l'application de la reprise (aperçu, puis
« Appliquer », écran existant), **la boutique ne montre aucune opération**.
Accepté en pré-release. Elle n'est pas automatique : un aperçu relu vaut
mieux qu'une copie silencieuse, et la reprise sait déjà se rejouer.

### I4 — Le prix pro n'est pas touché

La méthode de prix pro (rapport ou prix saisi) est indépendante des faits :
la projection applique la méthode en vigueur. Basculer en prix saisi reste le
geste du lot S, à part.

### I5 — L'ordre, au runbook

1. Sauvegarde ; `lecteur-de-migrations` ; CI de `dev` verte.
2. Promotion sur `main` → déploiement : la réémission part seule.
3. Accorder à l'écran `lfc_operations`, `lfc_catalog`, `lfc_loyalty`,
   `lfc_legal` ; retirer `b2b_catalog`.
4. « Opérations » → aperçu de la reprise → appliquer.
5. Vérifier : un article en boutique (prix, audience), une opération annoncée.

**Retour arrière** : redéployer la version précédente rouvre l'ancien chemin
(push, opérations au PIM) — les données du commerce restent, mais une
opération créée au commerce après la bascule n'existe pas au PIM.

## 3. Lot

Un seul : I1, I2 (marqueur, verrou, tests), runbook (I5), doc d'état des deux
sujets, `secrets-et-variables.md`. Le reste du code des chemins fermés
(push des fiches et des opérations, réception, routes d'écriture du PIM) part
aux lots 4 et 5, déjà prévus.

## Contradiction de `vitruve` (2026-10-16) — non intégrée, à reprendre

- **BLOQUANT — le verrou** : `pg_advisory_xact_lock` se libère au premier
  commit, et la réémission ouvre une transaction par fiche
  (`catalog-reemission.service.ts:46-80`) ; un verrou de session passe par le
  pooler mutualisé. Autre mécanisme à nommer (ligne réclamée par `INSERT … ON
CONFLICT`), ou abandonner I2.
- **BLOQUANT — l'échec au démarrage** : une famille en échec fait planter et
  boucler le démarrage ; une fiche en échec n'écrit rien dans la boîte
  d'envoi, le relais n'a rien à relancer ; le marqueur ne sait que faire des
  `failedProducts`.
- **BLOQUANT — la reprise attend la réémission** : sans interrupteur, la
  reprise lit les SKU aussi dans `catalog_entries`, vide en production ; il
  faut un point d'arrêt vérifiable (boîte vide, pas de lettre morte, autant
  d'entrées que de fiches). _(Interrupteurs gardés, la reprise reconnaît les
  SKU dans `catalog_items` — `prisma-operation-sku.catalogue.ts:29-37` — :
  vérifié le 2026-10-16.)_
- **SÉRIEUX** : durée non mesurée face au canary (~7 min,
  `deploy_lfd_api.yml:426-445`) ; deux instances coexistent pendant un
  déploiement (saisies non émises) ; le retour arrière écrase les audiences
  par `replaceAll` ; la santé du catalogue sonnera en permanence ; la boîte
  de réception reçoit des push qu'« Accepter » n'applique plus ; 18 suites e2e
  héritent de la fermeture forcée (`test/setup-env.ts:108-117`) ; I4 doit
  dire qu'aucune déclinaison ne peut lever `IncompleteVariantProjectedError`.
- **Recommandation retenue pour la reprise du plan** : pas de réémission au
  démarrage ; la route existante `POST /pim/channels/b2b/reemit` comme étape
  du runbook, suivie du point d'arrêt ; couper push et réception, désarmer la
  sonde, basculer les suites dans le même lot.
