-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "kbis_content_type" TEXT,
ADD COLUMN     "kbis_file_name" TEXT,
ADD COLUMN     "kbis_size" INTEGER,
ADD COLUMN     "kbis_storage_key" TEXT,
ADD COLUMN     "kbis_uploaded_at" TIMESTAMP(3);
