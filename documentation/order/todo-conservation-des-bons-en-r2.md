# TODO — la conservation des bons de commande en R2

**Ouvert le 2026-09-07**, en livrant le PDF du bon de commande (lot 8 de
[`architecture-bon-de-commande.md`](architecture-bon-de-commande.md)).
**Tranché le 2026-09-17** (Hugo) : **on ne supprime pas un bon émis à juste
titre.** Aucune purge, aucune règle de cycle de vie. L'interdiction est
**structurelle** depuis le même jour (§4, point 1) ; restent deux vérifications
de configuration.

## 1. La décision

> « on ne peut pas supprimer un bon qui a été émis à juste titre » — Hugo,
> 2026-09-17.

Un bon de commande est la pièce qu'un client peut **opposer** : il porte des
montants convenus. Le garder coûte quelques mégaoctets ; le perdre coûte une
contestation qu'on ne peut plus trancher. La question de 2026-09-07 — « combien
de temps ? » — est donc close par la seule réponse qui ne demande pas de
connaître une durée légale : **aussi longtemps que le stockage existe**.

Ce que la décision **écarte**, et qui était proposé ici :

- une purge « au bout de N mois », même en gardant la dernière révision ;
- une règle de cycle de vie R2 (`lifecycle rule`) sur le préfixe `orders/` ;
- l'idée de ne pas archiver la révision 0 au motif qu'elle se reconstitue.
  Elle se reconstitue **tant que le code de rendu ne change pas** — et un bon
  rendu à nouveau avec une mise en page corrigée n'est plus celui que le client
  a dans la poche.

« **À juste titre** » borne la décision, et c'est voulu : un bon qui n'aurait
jamais dû exister — une commande de test en production, une fuite de données
dans un rendu — reste supprimable, **par un geste humain décidé au cas par
cas**, jamais par du code. Comme la remise à blanc (`CLAUDE.md` §0), ce geste se
décrirait dans le runbook, sans outil.

## 2. L'état du code (vérifié le 2026-09-17)

- **Clé** : `orders/{orderId}/bon-de-commande-r{revision}.pdf`
  (`orderSheetPdfKey`, `order-sheet-pdf.ts`). La révision est dans la clé pour
  qu'un avenant ajoute une pièce au lieu d'écraser la précédente.
- **La révision vaut toujours 0** (`REVISION_WITHOUT_AMENDMENTS`,
  `order-sheet.ts`) : les avenants n'existent pas encore.
- **Écrit au premier téléchargement**, jamais à la passation
  (`OrderSheetArchive.pdfOf`), et best-effort : un R2 en panne rend le PDF sans
  l'archiver.
- **Le courriel de confirmation ne joint PAS le bon.** Il ne porte que le QR de
  retrait en image. Le pari « seule une fraction des commandes est archivée »
  tient donc toujours — le TODO d'origine le croyait sur le point de tomber.
- **Aucun code ne supprime une clé `orders/`** — et depuis le 2026-09-17,
  aucun ne le peut (§4). Les seuls appelants de
  `DocumentStore.delete` sont la purge des preuves de mandat
  (`mandate-proof-purge.ts`), les photos de notes et de cartes. Aucune règle de
  cycle de vie n'est déclarée dans le dépôt ; la configuration du bucket côté
  Cloudflare n'est pas vérifiable d'ici.
- 🔴 **VÉRIFIÉ le 2026-09-21 : `R2_CUSTOMERS_EU_*` n'existe nulle part.** Ni
  secret, ni variable de dépôt — les quatre noms sont absents (22 secrets et 18
  variables listés ; `R2_KBIS_*` et `R2_MEDIA_*`, eux, sont bien là). La boucle
  de synchronisation du déploiement ne pousse un nom que **s'il est non vide**
  (`if [ -n "$value" ]`, `deploy_lfd_api.yml`) : les quatre n'ont donc jamais
  atteint Cloudflare.

  **Conséquence, de bout en bout** : `readIfPresent` lève,
  `OrderSheetArchive.readArchived` rattrape l'indisponibilité et rend `null`,
  `archive()` échoue en silence — **aucun bon n'a jamais été archivé en
  production, et chaque téléchargement le rend à nouveau**.

  ⚠️ **Ce n'est pas rassurant, c'est l'inverse.** Tant que rien n'est figé, la
  promesse « deux rendus de la même révision produisent les mêmes octets » ne
  tient que **tant que le code ne change pas**. Un client qui retélécharge son
  bon après un déploiement qui touche le rendu reçoit un autre document que
  celui qu'il a dans la poche — et rien ne le dit.

## 3. L'ordre de grandeur, pour mémoire

Un bon de deux articles pèse ~2,5 Ko, cinquante lignes tiennent sous 10 Ko. Même
avec un bon archivé par commande, c'est quelques mégaoctets par jour à un volume
très au-dessus du réel. La décision ne coûte rien de mesurable.

## 4. Ce qui reste à faire

1. ~~**Rendre l'interdiction structurelle.**~~ **Fait le 2026-09-17.**
   `CustomerDocumentStore` n'hérite plus de `DocumentStore` et ne déclare pas
   `delete` ; la racine de composition le fournit par `KeptDocumentStore`, une
   enveloppe qui ne délègue que `save`, `read` et `readIfPresent`. Le verbe
   n'existe ni dans le type, ni sur l'objet — un test le tient
   (`kept-document-store.spec.ts`). Tout le **bucket `customers`** est
   couverte, factures à venir comprises : c'est le bucket de ce qu'un client
   peut nous opposer.
2. **Vérifier la configuration du bucket** dans le tableau de bord Cloudflare :
   aucune règle de cycle de vie sur `orders/`. Geste de Hugo.
3. ~~**Vérifier `R2_CUSTOMERS_EU_*` en production.**~~ **Fait le 2026-09-21 :
   les quatre noms sont ABSENTS.** La décision du §1 protège donc, à ce jour, un
   stockage vide — elle reste juste, et elle n'a encore rien à garder.

   **Ce qu'il faut décider** : brancher le bucket `customers` (créer les quatre
   entrées, la moitié en variables, la moitié en secrets), ou assumer que le bon
   se refabrique à chaque demande. Les deux se défendent ; ce qui ne se défend
   pas, c'est de croire qu'on archive alors qu'on ne le fait pas.

   ⚠️ **Tant que ce n'est pas branché, tout changement du RENDU réécrit
   rétroactivement tous les bons passés.** C'est la raison pour laquelle R3 a
   choisi de **sceller** le taxe compris plutôt que de le dériver
   ([`plan-bon-de-commande-public-en-ttc.md`](plan-bon-de-commande-public-en-ttc.md)).

4. **Le jour où le courriel joindra le bon**, l'archiver au même moment : le
   document envoyé doit être celui qui est gardé.
