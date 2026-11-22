-- La nature d'une demande de paiement libre (plan du lien vers un sujet, §5.7,
-- lot N) : pourquoi on demande cette somme — régularisation, supplément
-- convenu, solde après litige, autre.
--
-- Additive : une colonne nullable, rien n'est réécrit. Les demandes d'avant
-- restent à NULL (« non précisée ») : on ne leur invente pas de nature.
--
-- Sans CHECK, délibérément : la liste admise est le registre
-- `FREE_CHARGE_NATURES` (`@lfd/contracts`), et le domaine refuse une clé qui
-- n'y est pas. Un CHECK ferait d'une nature de plus une migration.

ALTER TABLE "public"."payment_links" ADD COLUMN "nature" TEXT NULL;
