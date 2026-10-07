/*
  Warnings:

  - You are about to drop the column `cameraId` on the `Photo` table. All the data in the column will be lost.
  - You are about to drop the `AccessLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Camera` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CatFace` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FeederStateHistory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RfidTag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_FeederToUser` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[bleMac]` on the table `Cat` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `catId` to the `Photo` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CAT_APPROACHED', 'CAT_LEFT', 'FEEDER_OPENED', 'FEEDER_CLOSED', 'HARDWARE_ERROR', 'APP_COMMAND');

-- DropForeignKey
ALTER TABLE "AccessLog" DROP CONSTRAINT "AccessLog_catId_fkey";

-- DropForeignKey
ALTER TABLE "AccessLog" DROP CONSTRAINT "AccessLog_feederId_fkey";

-- DropForeignKey
ALTER TABLE "AccessLog" DROP CONSTRAINT "AccessLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "CatFace" DROP CONSTRAINT "CatFace_catId_fkey";

-- DropForeignKey
ALTER TABLE "FeederStateHistory" DROP CONSTRAINT "FeederStateHistory_feederId_fkey";

-- DropForeignKey
ALTER TABLE "FeederStateHistory" DROP CONSTRAINT "FeederStateHistory_userId_fkey";

-- DropForeignKey
ALTER TABLE "Photo" DROP CONSTRAINT "Photo_cameraId_fkey";

-- DropForeignKey
ALTER TABLE "RfidTag" DROP CONSTRAINT "RfidTag_catId_fkey";

-- DropForeignKey
ALTER TABLE "_FeederToUser" DROP CONSTRAINT "_FeederToUser_A_fkey";

-- DropForeignKey
ALTER TABLE "_FeederToUser" DROP CONSTRAINT "_FeederToUser_B_fkey";

-- AlterTable
ALTER TABLE "Cat" ADD COLUMN     "bleMac" TEXT;

-- AlterTable
ALTER TABLE "Photo" DROP COLUMN "cameraId",
ADD COLUMN     "catId" TEXT NOT NULL;

-- DropTable
DROP TABLE "AccessLog";

-- DropTable
DROP TABLE "Camera";

-- DropTable
DROP TABLE "CatFace";

-- DropTable
DROP TABLE "FeederStateHistory";

-- DropTable
DROP TABLE "RfidTag";

-- DropTable
DROP TABLE "_FeederToUser";

-- DropEnum
DROP TYPE "StateChangeSource";

-- CreateTable
CREATE TABLE "FeedingEvent" (
    "id" TEXT NOT NULL,
    "feederId" TEXT NOT NULL,
    "catId" TEXT,
    "userId" TEXT,
    "eventType" "EventType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFeeder" (
    "userId" TEXT NOT NULL,
    "feederId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',

    CONSTRAINT "UserFeeder_pkey" PRIMARY KEY ("userId","feederId")
);

-- CreateTable
CREATE TABLE "UserCat" (
    "userId" TEXT NOT NULL,
    "catId" TEXT NOT NULL,

    CONSTRAINT "UserCat_pkey" PRIMARY KEY ("userId","catId")
);

-- CreateTable
CREATE TABLE "FeederCat" (
    "feederId" TEXT NOT NULL,
    "catId" TEXT NOT NULL,

    CONSTRAINT "FeederCat_pkey" PRIMARY KEY ("feederId","catId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cat_bleMac_key" ON "Cat"("bleMac");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingEvent" ADD CONSTRAINT "FeedingEvent_feederId_fkey" FOREIGN KEY ("feederId") REFERENCES "Feeder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingEvent" ADD CONSTRAINT "FeedingEvent_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingEvent" ADD CONSTRAINT "FeedingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFeeder" ADD CONSTRAINT "UserFeeder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFeeder" ADD CONSTRAINT "UserFeeder_feederId_fkey" FOREIGN KEY ("feederId") REFERENCES "Feeder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCat" ADD CONSTRAINT "UserCat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCat" ADD CONSTRAINT "UserCat_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeederCat" ADD CONSTRAINT "FeederCat_feederId_fkey" FOREIGN KEY ("feederId") REFERENCES "Feeder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeederCat" ADD CONSTRAINT "FeederCat_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
