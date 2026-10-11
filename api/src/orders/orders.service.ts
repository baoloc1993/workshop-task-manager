import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CHAPTER_2_BASE_STEPS, STEP_GROUP } from '../common/dem-step.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { UpdateMeasurementsDto } from './dto/update-measurements.dto.js';
import { CutDoneDto } from './dto/cut-done.dto.js';

// dùng chung, KHÔNG bao giờ gồm `price`/`deposit`/`createdBy` (chỉ
// findOne() owner-only mới trả tiền).
const ORDER_LIST_SELECT = {
  id: true,
  mode: true,
  description: true,
  difficulty: true,
  dueAt: true,
  status: true,
  hasEmbroidery: true,
  deliveryMethod: true,
  customer: { select: { id: true, name: true, phone: true } },
  route: { select: { id: true, name: true } },
  tasks: { select: { id: true, step: true, status: true }, where: { deletedAt: null } },
  createdAt: true,
} as const;

// response của updateMeasurements() (owner HOẶC thợ đang đo, KHÔNG owner-only như
// findOne()): trước đây trả thẳng kết quả
// `prisma.order.update()` không `select`, lộ nguyên `price`/`deposit`/`createdById` cho
// thợ. Cùng khuôn ORDER_LIST_SELECT, cộng các field số đo/gối mà chính S20 vừa ghi.
const MEASUREMENTS_SELECT = {
  ...ORDER_LIST_SELECT,
  measurementLength: true,
  measurementDepth: true,
  measurementWidth: true,
  measurementThickness: true,
  measurementPhoto: true,
  pillows: true,
} as const;

const DUE_DAYS_BY_MODE: Record<'buon' | 'le', number> = { buon: 2, le: 7 };

function addDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function hasBackPillow(pillows: Prisma.JsonValue | null | undefined): boolean {
  return Array.isArray(pillows) && pillows.some((p) => typeof p === 'object' && p !== null && (p as { type?: string }).type === 'back');
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async nextPriority(): Promise<number> {
    const { _max } = await this.prisma.task.aggregate({ where: { deletedAt: null }, _max: { priority: true } });
    return (_max.priority ?? -1) + 1;
  }

  // khách cũ (customerId) hoặc khách mới (customer),
  // đúng một trong hai. Tạo Order + Task đầu tiên "đi đo" (step='do') trong một transaction.
  async create(user: AuthUser, dto: CreateOrderDto) {
    if (!dto.customerId && !dto.customer) {
      throw new BadRequestException('Phải chọn khách cũ hoặc nhập thông tin khách mới');
    }
    if (dto.customerId && dto.customer) {
      throw new BadRequestException('Chỉ chọn MỘT trong hai: khách cũ hoặc khách mới');
    }
    if (dto.customerId) {
      const exists = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
      if (!exists) throw new BadRequestException('Không tìm thấy khách này');
    }
    if (dto.routeId) {
      const route = await this.prisma.route.findUnique({ where: { id: dto.routeId } });
      if (!route || !route.active) throw new BadRequestException('Khu vực không hợp lệ');
    }

    const dueAt = dto.dueAt ? new Date(dto.dueAt) : addDays(DUE_DAYS_BY_MODE[dto.mode]);
    const priority = await this.nextPriority();

    // Tạo Customer TRƯỚC (nếu là khách mới) để có customerId cụ thể — tránh kiểu union
    // "customerId HOẶC customer.create" của Prisma (một request, hai bước ghi, không
    // transaction chung với Order vì Customer không có tác dụng phụ nếu Order tạo thất bại
    // ngay sau — chấp nhận được ở quy mô xưởng nhỏ, đúng "Trùng dữ liệu" đã chốt).
    const customerId =
      dto.customerId ??
      (
        await this.prisma.customer.create({
          data: {
            name: dto.customer!.name,
            phone: dto.customer!.phone,
            address: dto.customer!.address,
            areaId: dto.customer!.areaId,
            note: dto.customer!.note,
          },
        })
      ).id;

    const order = await this.prisma.order.create({
      data: {
        customerId,
        mode: dto.mode,
        description: dto.description,
        difficulty: dto.difficulty ?? 'de',
        photos: dto.photos ?? [],
        hasEmbroidery: dto.hasEmbroidery ?? false,
        pillows: (dto.pillows as unknown as Prisma.InputJsonValue) ?? undefined,
        measurementLength: dto.measurementLength,
        measurementDepth: dto.measurementDepth,
        measurementWidth: dto.measurementWidth,
        measurementThickness: dto.measurementThickness,
        measurementPhoto: dto.measurementPhoto,
        dueAt,
        deliveryMethod: dto.deliveryMethod ?? 'xe_om',
        routeId: dto.routeId,
        price: dto.price ?? 0,
        deposit: dto.deposit ?? 0,
        createdById: user.userId,
        tasks: {
          create: {
            content: `Đi đo — ${dto.description}`,
            line: 'dem',
            step: 'do',
            dueAt,
            priority,
            source: 'manual',
            createdById: user.userId,
          },
        },
      },
      select: { id: true, customerId: true, tasks: { select: { id: true } } },
    });

    void this.notifications.notifyGroup('do', 'Nhà chờ đo', dto.description, { orderId: order.id });
    return this.findOne(order.id);
  }

  // "Đơn đệm": toàn bộ đơn chưa xoá mềm, client tự gom nhóm (đang kẹt/đang làm/chờ
  // trả) bằng hàm thuần, cùng khuôn `taskBucket()` đã chọn cho S1.
  findAll() {
    return this.prisma.order.findMany({
      where: { deletedAt: null },
      select: ORDER_LIST_SELECT,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // CHỈ owner ("chỉ owner"), duy nhất nơi trả tiền.
  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: { include: { area: { select: { id: true, name: true } } } },
        route: true,
        tasks: {
          where: { deletedAt: null },
          include: {
            assignees: { include: { user: { select: { id: true, name: true } } } },
            // StepsRow cần events để tính "ai · khi nào"
            // xong; thiếu field này gây crash `task.events.find`.
            events: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!order || order.deletedAt) throw new NotFoundException('Không tìm thấy đơn này');
    return order;
  }

  // owner HOẶC người đang là assignee của Task "đi đo"
  // (step='do') còn hiệu lực của chính đơn này. Không kiểm `User.groups` ở đây — nhóm chỉ
  // quyết ai NHẬN được việc (claim), không quyết ai được sửa sau khi đã nhận.
  async updateMeasurements(user: AuthUser, orderId: string, dto: UpdateMeasurementsDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { tasks: { where: { deletedAt: null } } },
    });
    if (!order || order.deletedAt) throw new NotFoundException('Không tìm thấy đơn này');

    if (user.role !== 'owner') {
      const isAssignee = await this.prisma.task.findFirst({
        where: { orderId, step: 'do', deletedAt: null, assignees: { some: { userId: user.userId } } },
      });
      if (!isAssignee) throw new ForbiddenException('Bạn không phải người đang đo đơn này');
    }

    // sau khi "Chốt số cắt" (cut-done sinh Task
    // chặng 2), số đo đã dùng để tính fabricMeters/foamSheets — sửa số đo lúc này làm số đo
    // hiện tại lệch khỏi số vải/mút đã cắt thật ngoài xưởng, không có cách nào biết đơn nào
    // bị lệch. Khoá sửa từ đây, đúng "không sửa trực tiếp bản ghi cũ".
    if (order.tasks.some((t) => t.step !== 'do')) {
      throw new ForbiddenException('Đơn đã chốt số cắt — không sửa số đo được nữa');
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        measurementLength: dto.measurementLength,
        measurementDepth: dto.measurementDepth,
        measurementWidth: dto.measurementWidth,
        measurementThickness: dto.measurementThickness,
        measurementPhoto: dto.measurementPhoto,
        pillows: (dto.pillows as unknown as Prisma.InputJsonValue) ?? undefined,
      },
      select: MEASUREMENTS_SELECT,
    });
  }

  // chỉ owner (không có
  // nhóm "tính cắt" trong 6 nhóm chuyên trách đã chốt). Đòi Task "đi đo" đã xong trước —
  // đúng chuỗi TUẦN TỰ của chặng 1.
  async cutDone(orderId: string, dto: CutDoneDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { tasks: { where: { deletedAt: null } } },
    });
    if (!order || order.deletedAt) throw new NotFoundException('Không tìm thấy đơn này');

    const doTask = order.tasks.find((t) => t.step === 'do');
    if (!doTask || doTask.status !== 'done') {
      throw new BadRequestException('Đơn chưa đo xong — không thể chốt số cắt');
    }
    if (order.tasks.some((t) => t.step !== 'do')) {
      throw new BadRequestException('Đơn này đã chốt số cắt rồi');
    }

    const chapter2 = [...CHAPTER_2_BASE_STEPS] as (typeof CHAPTER_2_BASE_STEPS)[number][];
    const extraSteps: ('theu' | 'goi_tua')[] = [];
    if (order.hasEmbroidery) extraSteps.push('theu');
    if (hasBackPillow(order.pillows)) extraSteps.push('goi_tua');

    const allSteps = [...chapter2, ...extraSteps];
    let priority = await this.nextPriority();

    try {
      await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: orderId },
          data: { fabricMeters: dto.fabricMeters, foamSheets: dto.foamSheets, status: 'dang_lam' },
        }),
        ...allSteps.map((step) =>
          this.prisma.task.create({
            data: {
              content: `${STEP_LABEL[step]} — ${order.description}`,
              line: 'dem',
              step,
              orderId,
              dueAt: order.dueAt,
              priority: priority++,
              source: 'manual',
              createdById: order.createdById,
            },
          }),
        ),
      ]);
    } catch (e) {
      // kiểm "đã chốt chưa" (dòng 225) đọc TRƯỚC
      // transaction ghi — hai request "Chốt số cắt" gần như đồng thời (double-tap) đều đọc
      // thấy "chưa chốt" rồi cùng tạo Task chặng 2, sinh trùng cả bộ. Ràng buộc DB mới
      // `@@unique([orderId, step])` (migration `20260918164547`) chặn request thứ hai ở
      // tầng dữ liệu — bắt lỗi đó, trả thông báo giống hệt kiểm tra tường minh ở trên.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('Đơn này đã chốt số cắt rồi');
      }
      throw e;
    }

    for (const step of allSteps) {
      void this.notifications.notifyGroup(STEP_GROUP[step], `${STEP_LABEL[step]} chờ nhận`, order.description, {
        orderId,
      });
    }

    return this.findOne(orderId);
  }

  // Gọi bởi TasksService.advance() ngay sau khi một Task line=dem chuyển sang 'done'
  // (luồng D bước 5-6). Đây là quy luật vòng đời ĐƠN, không phải quy
  // luật việc chung — đặt ở orders/ theo đúng ranh giới domain.
  async onDemTaskDone(taskId: string): Promise<void> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || !task.orderId || !task.step) return;

    if (task.step === 'nhoi') {
      await this.prisma.order.update({ where: { id: task.orderId }, data: { status: 'cho_tra' } });
      return;
    }
    if (task.step === 'do' || task.step === 'tinh_cat') return; // chặng 1 — không kích hoạt gì thêm ở đây

    // Chặng 2: kiểm TOÀN BỘ Task chặng 2 của đơn đã done chưa.
    const siblings = await this.prisma.task.findMany({
      where: { orderId: task.orderId, deletedAt: null, step: { notIn: ['do', 'tinh_cat', 'nhoi'] } },
    });
    const allDone = siblings.length > 0 && siblings.every((t) => t.status === 'done');
    if (!allDone) return;

    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: task.orderId } });
    const priority = await this.nextPriority();
    try {
      await this.prisma.task.create({
        data: {
          content: `Nhồi mút vào vỏ — ${order.description}`,
          line: 'dem',
          step: 'nhoi',
          orderId: order.id,
          dueAt: order.dueAt,
          priority,
          source: 'manual',
          createdById: order.createdById,
        },
      });
    } catch (e) {
      // hai Task chặng 2 cuối cùng "Xong" gần như
      // đồng thời có thể khiến hai lời gọi onDemTaskDone() cùng thấy "allDone" rồi cùng tạo
      // Task "nhồi" — ràng buộc DB mới `@@unique([orderId, step])` chặn bản trùng, đây là
      // kết quả BÌNH THƯỜNG của việc thắng-thua khi đua nhau, không phải lỗi cần báo lại
      // (người thắng đã tạo xong, người thua không cần làm gì thêm). Lỗi KHÁC (mất kết nối
      // DB…) thì phải ném tiếp — caller (`TasksService.advance`) log qua exception filter,
      // không được nuốt trắng như trước (`.catch(() => {})` cũ khiến đơn kẹt không dấu vết).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return;
      throw e;
    }
    void this.notifications.notifyGroup('nhoi', 'Việc nhồi chờ nhận', order.description, { orderId: order.id });
  }

  // "Báo đã trả hàng · thu <còn lại>" là MỘT hành động:
  // trả hàng và thu đủ tiền còn lại cùng lúc, không tách bước.
  async markDelivered(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.deletedAt) throw new NotFoundException('Không tìm thấy đơn này');
    if (order.status !== 'cho_tra') {
      throw new BadRequestException('Đơn chưa nhồi xong — chưa thể báo trả hàng');
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'da_tra', deposit: order.price },
    });
  }
}

const STEP_LABEL: Record<string, string> = {
  may_vai: 'May vải',
  cat_mut: 'Cắt mút',
  khau_lot: 'Khâu vải lót',
  theu: 'Thêu hình',
  goi_tua: 'May/nhồi gối tựa',
  nhoi: 'Nhồi mút vào vỏ',
};
