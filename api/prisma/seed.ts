// Dữ liệu mẫu — nguồn:. Đây là chỗ DUY NHẤT tạo User
// (không có endpoint "tạo nhân viên" —
// và backlog).
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { v5 as uuidv5 } from 'uuid';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// id phải là UUID thật (DTO validate @IsUUID) — nhưng vẫn cần ổn định qua các lần
// seed lại, nên sinh bằng uuid v5 (deterministic theo tên) thay vì random mỗi lần.
const SEED_NAMESPACE = '3f7f6c9e-6b8a-4f0a-9b3a-8f4b8a2b0a11';
const seedId = (key: string) => uuidv5(key, SEED_NAMESPACE);

// Dữ liệu mẫu: 10 thợ mảng may vá + 5 thợ mảng bạt + 1 điều phối mảng bạt + 1 owner (tên đều là tên giả).
const MAY_VA_NAMES = ['Thợ A', 'Thợ B', 'Thợ C', 'Thợ D', 'Thợ E', 'Thợ G', 'Thợ H', 'Thợ I', 'Thợ K', 'Thợ L'];
const BAT_NAMES = ['Thợ M', 'Thợ N', 'Thợ O', 'Thợ P', 'Thợ Q'];

async function main() {
  // mật khẩu mặc định 'doicaimatkhaunay' công khai trong git history —
  // âm thầm rơi về giá trị này trên production (chạy nhầm `db:seed` mà quên set biến) là
  // cấp quyền owner cho bất kỳ ai đọc được repo. Local/dev thì fallback vẫn tiện.
  if (process.env.APP_ENV === 'production' && !process.env.OWNER_SEED_PASSWORD) {
    throw new Error('OWNER_SEED_PASSWORD bắt buộc khi APP_ENV=production — không seed bằng mật khẩu mặc định');
  }

  const ownerEmail = process.env.OWNER_SEED_EMAIL ?? 'owner@task-manager.local';
  const ownerPassword = process.env.OWNER_SEED_PASSWORD ?? 'doicaimatkhaunay';

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: {
      id: seedId('owner'),
      name: 'Chủ xưởng',
      role: 'owner',
      email: ownerEmail,
      password: await bcrypt.hash(ownerPassword, 10),
    },
  });

  for (const name of MAY_VA_NAMES) {
    const id = seedId(`worker-mayva-${name}`);
    await prisma.user.upsert({
      where: { id },
      update: {},
      create: { id, name, role: 'worker', line: 'may_va' },
    });
  }

  for (const name of BAT_NAMES) {
    const id = seedId(`worker-bat-${name}`);
    await prisma.user.upsert({
      where: { id },
      update: {},
      create: { id, name, role: 'worker', line: 'bat' },
    });
  }

  const coordinatorId = seedId('bat-coordinator');
  await prisma.user.upsert({
    where: { id: coordinatorId },
    update: {},
    create: { id: coordinatorId, name: 'Điều phối', role: 'bat_coordinator', line: 'bat' },
  });

  console.log(`Seed xong. Owner: ${owner.email} / mật khẩu: ${ownerPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
