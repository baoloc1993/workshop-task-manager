-- CreateIndex
CREATE UNIQUE INDEX "tasks_order_id_step_key" ON "tasks"("order_id", "step");
