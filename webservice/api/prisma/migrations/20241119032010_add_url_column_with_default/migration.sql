/*
  Warnings:

  - You are about to drop the column `dados` on the `Foto` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Foto" DROP COLUMN "dados",
ADD COLUMN     "url" TEXT NOT NULL DEFAULT 'default-url';
