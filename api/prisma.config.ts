// Prisma 7: URL kết nối cho CLI (migrate/introspect) khai ở đây, không còn trong
// schema.prisma. Repo này đã tách khỏi repo gốc —
// đọc .env ngay tại gốc repo, không còn đường dẫn tương đối sang deployment/local/.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
