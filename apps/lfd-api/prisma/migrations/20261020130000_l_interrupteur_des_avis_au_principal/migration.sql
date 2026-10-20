-- L'interrupteur des avis au principal (plan-notifications-sous-comptes.md,
-- « Interrupteur bâti », décision de Hugo du 2026-10-20).
--
-- Additive : une table neuve. Pas de ligne = avis DÉSACTIVÉS pour ce
-- principal ; aucune ligne n'est semée, donc tous les principaux partent
-- désactivés. Aucun droit n'est accordé à un rôle : l'interrupteur se règle
-- sous `b2b_companies`, déjà existant.
--
-- Retour arrière :
--   DROP TABLE "public"."sub_account_notice_settings";

-- CreateTable
CREATE TABLE "public"."sub_account_notice_settings" (
    "principal_company_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updated_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sub_account_notice_settings_pkey" PRIMARY KEY ("principal_company_id")
);

-- AddForeignKey
ALTER TABLE "public"."sub_account_notice_settings" ADD CONSTRAINT "sub_account_notice_settings_principal_company_id_fkey" FOREIGN KEY ("principal_company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
