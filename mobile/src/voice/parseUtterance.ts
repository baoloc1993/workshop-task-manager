// Tách câu giọng nói thành các trường của S3 (ARCHITECTURE.md §8: "không tự phát việc —
// luôn trả về S3 để người soát"). Rule-based, chạy trên máy, không gọi dịch vụ ngoài —
// khớp quyết định "on-device, không LLM" (DECISIONS.md, vòng 2).
//
// Phạm vi vòng 2: chỉ giao đích danh mảng may vá (line=may_va), khớp CreateTaskScreen
// hiện tại. Số đo / mảng bạt (CAP-TASK-05/06) chờ vòng 4 — parser không tách riêng số đo,
// để nguyên trong content nếu người dùng lỡ nói (DECISIONS.md, vòng 2).

export interface VoiceWorker {
  id: string;
  name: string;
}

export interface ParsedUtterance {
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: string | null; // ISO date (yyyy-MM-dd), không giờ
  content: string;
  rawText: string;
}

const WEEKDAY_WORDS: Record<string, number> = {
  'chủ nhật': 0,
  'thứ hai': 1,
  'thứ ba': 2,
  'thứ tư': 3,
  'thứ năm': 4,
  'thứ sáu': 5,
  'thứ bảy': 6,
};

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function lastToken(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
}

/** Tìm người nhận: so khớp tên gọi (từ cuối họ tên) xuất hiện trong câu, không phân biệt hoa/thường/dấu. */
function findAssignee(text: string, workers: VoiceWorker[]): { id: string; name: string } | null {
  const normText = stripDiacritics(text);
  const matches = workers.filter((w) => {
    const key = stripDiacritics(lastToken(w.name));
    if (!key) return false;
    return new RegExp(`\\b${key}\\b`).test(normText);
  });
  // Trùng tên gọi giữa nhiều người: không đoán, để chủ xưởng tự chọn ở S3.
  if (matches.length !== 1) return null;
  return { id: matches[0].id, name: matches[0].name };
}

/** Tìm hạn: hôm nay / mai / mốt / thứ trong tuần → ngày ISO tới gần nhất. */
function findDueAt(text: string, now: Date): { dueAt: string | null; matchedPhrase: string | null } {
  const norm = stripDiacritics(text);

  if (/\bhom nay\b/.test(norm)) {
    return { dueAt: toIsoDate(now), matchedPhrase: 'hôm nay' };
  }
  if (/\bngay mot\b/.test(norm)) {
    return { dueAt: toIsoDate(addDays(now, 2)), matchedPhrase: 'ngày mốt' };
  }
  if (/\b(ngay mai|mai)\b/.test(norm)) {
    return { dueAt: toIsoDate(addDays(now, 1)), matchedPhrase: 'mai' };
  }
  for (const [phraseVi, weekday] of Object.entries(WEEKDAY_WORDS)) {
    const phrase = stripDiacritics(phraseVi);
    if (new RegExp(`\\b${phrase}\\b`).test(norm)) {
      return { dueAt: toIsoDate(nextWeekday(now, weekday)), matchedPhrase: phraseVi };
    }
  }
  return { dueAt: null, matchedPhrase: null };
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Ngày trong tuần TỚI GẦN NHẤT không tính hôm nay (chủ xưởng nói "thứ Sáu" nghĩa là sắp tới). */
function nextWeekday(now: Date, targetDow: number): Date {
  const diff = ((targetDow - now.getDay() + 7) % 7) || 7;
  return addDays(now, diff);
}

/** Bỏ các cụm dẫn ("giao cho", tên đã khớp, cụm hạn đã khớp) khỏi câu để còn lại nội dung việc. */
function cleanContent(text: string, assigneeName: string | null, dueMatchedPhrase: string | null): string {
  let out = text;
  if (assigneeName) {
    const key = lastToken(assigneeName);
    out = out.replace(new RegExp(`giao\\s+cho\\s+${key}`, 'i'), '');
    out = out.replace(new RegExp(`\\bcho\\s+${key}\\b`, 'i'), '');
  }
  if (dueMatchedPhrase) {
    out = out.replace(new RegExp(dueMatchedPhrase, 'i'), '');
  }
  out = out
    .replace(/[,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Không để trống — nếu bóc hết chữ thì trả nguyên câu gốc, an toàn hơn mất dữ liệu.
  return out.length > 0 ? out : text.trim();
}

export function parseUtterance(rawText: string, workers: VoiceWorker[], now: Date = new Date()): ParsedUtterance {
  const text = rawText.trim();
  const assignee = findAssignee(text, workers);
  const due = findDueAt(text, now);
  const content = cleanContent(text, assignee?.name ?? null, due.matchedPhrase);

  return {
    assigneeId: assignee?.id ?? null,
    assigneeName: assignee?.name ?? null,
    dueAt: due.dueAt,
    content,
    rawText: text,
  };
}
