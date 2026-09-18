-- CreateEnum
CREATE TYPE "WorkerGroup" AS ENUM ('do', 'may', 'cat_mut', 'khau_lot', 'nhoi', 'theu');

-- CreateEnum
CREATE TYPE "TaskStep" AS ENUM ('do', 'tinh_cat', 'may_vai', 'cat_mut', 'khau_lot', 'theu', 'goi_tua', 'nhoi');

-- CreateEnum
CREATE TYPE "OrderMode" AS ENUM ('buon', 'le');

-- CreateEnum
CREATE TYPE "OrderDifficulty" AS ENUM ('de', 'kho');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('moi', 'dang_lam', 'cho_tra', 'da_tra');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('xe_om', 'route', 'self_pickup');

-- AlterEnum
ALTER TYPE "Line" ADD VALUE 'dem';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "order_id" TEXT,
ADD COLUMN     "step" "TaskStep";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "groups" "WorkerGroup"[] DEFAULT ARRAY[]::"WorkerGroup"[];

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "area_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "landmarks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "mode" "OrderMode" NOT NULL,
    "description" TEXT NOT NULL,
    "difficulty" "OrderDifficulty" NOT NULL DEFAULT 'de',
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "measurement_length" DOUBLE PRECISION,
    "measurement_depth" DOUBLE PRECISION,
    "measurement_width" DOUBLE PRECISION,
    "measurement_thickness" DOUBLE PRECISION,
    "measurement_photo" TEXT,
    "has_embroidery" BOOLEAN NOT NULL DEFAULT false,
    "pillows" JSONB,
    "due_at" TIMESTAMP(3) NOT NULL,
    "delivery_method" "DeliveryMethod" NOT NULL DEFAULT 'xe_om',
    "route_id" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "deposit" INTEGER NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'moi',
    "fabric_meters" DOUBLE PRECISION,
    "foam_sheets" DOUBLE PRECISION,
    "created_by" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
