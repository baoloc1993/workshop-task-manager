-- CreateEnum
CREATE TYPE "TaskApproval" AS ENUM ('approved', 'pending', 'rejected');

-- AlterEnum
ALTER TYPE "TaskSource" ADD VALUE 'self';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "approval" "TaskApproval" NOT NULL DEFAULT 'approved';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "auto_approve" BOOLEAN NOT NULL DEFAULT false;
