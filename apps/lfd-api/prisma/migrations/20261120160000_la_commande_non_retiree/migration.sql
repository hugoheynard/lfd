-- ───────────────────────────────────────────────────────────────────────────
-- LA COMMANDE NON RETIRÉE — l'état `no_show` d'une commande.
--
-- Plan documentation/commandes/passation/plan-commande-particulier-reglee-en-boutique.md,
-- § 5 bis (lot B4b). Une commande à régler en boutique, produite et jamais
-- retirée, n'est ni annulée (personne ne l'a décidé) ni remise : c'est un
-- état terminal à lui.
--
-- Migration à part : Postgres refuse d'utiliser une valeur d'enum dans la
-- transaction qui l'ajoute (« unsafe use of new value of enum type »), et
-- Prisma applique chaque fichier dans UNE transaction. Le CHECK qui s'en sert
-- est dans le dossier suivant (cf. 20260730045900_company_status_pending).
--
-- ADDITIVE : aucune ligne réécrite.
--
-- Retour arrière : `prisma/rollback/20261120160000_la_commande_non_retiree.sql`.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TYPE "public"."OrderStatus" ADD VALUE 'no_show';
