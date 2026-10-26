# Le dossier des tournées du jour (PDF)

> ✅ implémenté le 2026-10-26 — **décision de Hugo du 2026-10-26**. Route
> servie, exemple sur la planche ; le bouton qui l'ouvrira depuis Tour manager
> n'est **pas encore posé** (il viendra avec la refonte du bandeau).

Un seul PDF qui part au dépôt le matin, sur le modèle du dossier du jour du
fournil (`production/domain/services/day-dossier-pdf.ts`) : même cadre
(`platform/pdf/paper-pages.ts` — logo, titre de section, « (1/2) » quand une
section déborde, numéro de page encadré, « Tiré le … » au pied).

## Ce qu'il contient, dans l'ordre

1. **Répartition des tournées** — une ligne par tournée : véhicule et passage,
   heure de départ prévue (« Départ non calculé » sans horaire), livreur
   affecté, nombre d'arrêts, bacs chargés / attendus (bacs non annulés, lus au
   chargement), échéance la plus serrée (fin de fenêtre d'une livraison non
   annulée, heure d'arrivée requise d'un transfert), et les transferts vers un
   site derrière le carré de la **couleur de transfert** du site (Réglages ›
   Sites ; aucun carré si elle n'est pas posée). Puis les **livraisons non
   placées** : attendues ce jour, non annulées, dans aucune tournée vivante —
   elles ne disparaissent pas du dossier.
2. **Une section par tournée** : la feuille remise au livreur, **la même** que
   `round.pdf` — même assemblage (`application/round-paper-assembly.ts`), même
   corps dessiné (`drawRoundPaper`), seul le cadre change. Chaque section
   commence sur une page neuve et se titre « Camion 1 · passage 1 (1/2) ».

**Case « Déposé à __ h __ »** (décision de Hugo du 2026-10-26) : en pied de
chaque arrêt de la feuille — livraison comme transfert vers un site —, un
cadre au bord droit où le livreur note au stylo l'heure de dépôt. Aucune sur
une commande annulée ni sur un arrêt absent de la feuille de route. La case
est une rangée du bloc de l'arrêt : elle compte dans la décision de tourner
la page et ne s'en sépare pas (`apps/lfd-api/src/delivery/domain/services/round-paper-pdf-dropped.ts`).

**Ordre** : heure de départ prévue, puis passage ; une tournée sans horaire
vient en dernier, on ne lui invente pas d'heure.

## Route et droits

`GET /admin/delivery/rounds/day/:day/dossier.pdf` (`AAAA-MM-JJ`), sous
`delivery_rounds` comme `round.pdf` ; sans `delivery_procedures:read`, les
feuilles partent sans étapes. Fichier `dossier-tournees-AAAA-MM-JJ.pdf`.
Papier **vivant** : chaque tirage relit tout, rien n'est archivé.

Query `GetDayRoundsDossierPdfQuery` ; lecteurs du bloc livraison seulement,
plus un canal neuf `TransferSiteColorsReader` (déclaré par la livraison,
implémenté par `b2b/sites`, relié dans `appBootstrap/delivery-feed.module.ts`).

Exemple : `admin/document-specimens/rounds-dossier.pdf`
([planche des documents](../../comptabilite/planche-des-documents.md)).
