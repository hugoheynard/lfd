# Plan — envoyer le dossier du jour par e-mail à l'arrêt du plan

**Ouvert le 2026-10-06** (Hugo). Doc-first : rien n'est bâti.

## Le besoin

À l'arrêt du plan d'une journée, le dossier du jour part par e-mail à une
liste de destinataires réglée dans **Production › Réglages**, pour être
imprimé au fournil sans passer par l'écran.

## Décisions de Hugo (2026-10-06)

1. **Pièce jointe : un seul PDF « dossier du jour »**, le même papier que
   l'impression de l'écran — récapitulatif, puis un bon par commande. Il
   n'existe aujourd'hui qu'en impression navigateur
   (`apps/lfd-backoffice-frontend/src/app/production/previsionnel/dossier-du-jour/`) :
   il faut le fabriquer côté serveur.
2. **Quand** : à chaque arrêt, manuel ou automatique ; **et renvoi** après un
   retirage (« Reprendre le tirage »), avec le dossier complété.
3. **Qui règle la liste** : `production_settings:write`.
4. **Quelles adresses** : toutes. Deux façons d'ajouter :
   - **le personnel** : choisi dans une liste (l'annuaire staff) ;
   - **une autre personne** : e-mail, nom, prénom, **poste** (facultatif).
5. **Échec d'envoi** : alerte dans la cloche aux personnes qui ont
   `production_count_stop`.

## Ce qui existe (vérifié le 2026-10-06)

- PDF serveur : `apps/lfd-api/src/production/domain/services/atelier-sheet-pdf.ts`
  (`renderProductionCountPdf`, `renderAtelierSheetPdf`), servis et archivés par
  `application/services/production-paper.service.ts`. Pas de PDF « dossier ».
- Envoi : `packages/mailer` (Resend), pièces jointes possibles
  (`packages/mailer/src/types.ts`).
- L'arrêt publie le fait durable `production.day_closed` (manuel et
  automatique) ; le retirage ne publie aucun fait durable au fournil (il
  journalise `production_day.retaken`, et publie au colisage).
- Alertes staff par permission et clé d'idempotence : le mécanisme de
  `production/application/services/plan-arrest-bell.ts`.

## Conception

- **Destinataires** (schéma `production`) : une ligne par destinataire —
  soit une référence à une fiche staff (le nom et l'e-mail sont relus à
  l'envoi : un départ ou un changement d'adresse suit), soit un externe
  `{ email, prénom, nom, poste? }`. Un e-mail en double est refusé. Journalisé
  (ajout, retrait).
- **Le PDF dossier** : fabriqué côté serveur depuis ce que la journée a
  **figé** (même source que le compte à produire), archivé comme les autres
  papiers, servi aussi en téléchargement.
- **L'envoi** : un abonné **durable** du fournil à `production.day_closed`
  (fait livré au moins une fois : l'envoi porte une clé d'idempotence
  `(journée, instant de clôture)` pour ne jamais partir deux fois) ; le
  retirage publie un fait durable `production.day_retaken`, que le même
  abonné écoute (clé `(journée, instant du retirage)`). Un e-mail par
  destinataire, objet « Dossier du <jour> — N commandes, P pièces »
  (« — complété » après un retirage).
- **Échec** : un destinataire refusé n'empêche pas les autres ; une alerte
  « Le dossier du <jour> n'a pas pu être envoyé à … » par journée et par
  envoi. Journal : « Dossier du <jour> envoyé à N destinataires ».

## Lots

1. **E1** — PDF dossier côté serveur (+ route de téléchargement).
2. **E2** — destinataires (table, agrégat, routes) + section de Réglages
   (personnel choisi dans l'annuaire, externe avec nom, prénom, poste).
3. **E3** — envoi à l'arrêt et au retirage, idempotent, alerte d'échec.

## E3 — bâti le 2026-10-06

- Le retirage publie le fait durable `production.day_retaken` (`{ serviceDay, retakenAt, absorbed }`) dans son unité de travail, seulement si des commandes sont absorbées ; `production.day_closed` porte désormais `reannouncedAt` dans sa charge (additif), pour que l'envoi ignore une réannonce.
- Deux abonnés durables du fournil (`SendDossierOnDayClosed`, `SendDossierOnDayRetaken`) appellent `DossierDispatch` : liste relue (fiches suspendues, disparues ou sans adresse écartées, une adresse servie une fois), PDF par `dossierOf`, un e-mail `staff.production-dossier` par destinataire, PDF joint. Une clôture déjà reprise, ou un retirage dépassé, n'envoie rien : le dernier tirage enverra le sien.
- Idempotence : table `production.production_dossier_dispatch`, clé `(journée, instant de clôture ou de retirage, destinataire)`, prise par `ON CONFLICT DO NOTHING` avant l'envoi ; la même clé part en `Idempotency-Key` chez Resend.
- Échec : noté dans la trace, jamais retenté ; les autres partent ; une alerte `production.dossier_not_sent` (cloche + push, `production_count_stop:write`) nomme les personnes, clé `(nature, journée, instant)`.
- Journal : `production_day.dossier_sent` (`sent`, `failed`, `completed`, sans adresse ni nom), phrase « Le dossier du … a été envoyé à N destinataires ».
