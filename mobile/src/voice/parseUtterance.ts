// Tách câu giọng nói thành các trường của S3 (ARCHITECTURE.md §8: "không tự phát việc —
// luôn trả về S3 để người soát"). Rule-based, chạy trên máy, không gọi dịch vụ ngoài —
// khớp quyết định "on-device, không LLM" (DECISIONS.md, vòng 2).
//
// Vòng 4 (CAP-TASK-05/06, AC-12/AC-13): nghe thấy từ "bạt" → line='bat', không tìm người
// nhận trong câu (mảng bạt luôn vào "Việc bạt chờ chia", không giao đích danh qua giọng
// nói); bắt cụm số + đơn vị đo ("mét"/"m") gần đó làm measurements, GIỮ NGUYÊN dạng thô đã
// nghe được — không tách number/unit có cấu trúc (DECISIONS.md, vòng 4: không ai đối chiếu
// tự động, PRD.md §5 đã loại trừ nghiệm thu).

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
  line: 'may_va' | 'bat';
  measurements: string | null;
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

// Số đọc bằng lời (không dấu) — recognizer tiếng Việt hay trả số ở dạng chữ số thật
// ("4 mét 6") nhưng đôi khi vẫn ra chữ ("bốn mét sáu"); chấp cả hai dạng.
const NUM = '(?:không|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười|\\d+(?:[.,]\\d+)?)';
const UNIT = '(?:mét|m)\\b';
const MEASURE_CHUNK = `${NUM}\\s*${UNIT}(?:\\s*${NUM})?`;
const MEASURE_RE = new RegExp(`${MEASURE_CHUNK}(?:\\s*(?:x|nhân)\\s*${MEASURE_CHUNK})?`, 'i');

/** Nghe thấy "bạt" → việc mảng bạt; tìm kèm cụm số đo gần đó nếu có, giữ nguyên dạng thô. */
function findLineAndMeasurements(text: string): {
  line: 'may_va' | 'bat';
  measurements: string | null;
  matchedPhrase: string | null;
} {
  if (!/\bbạt\b/i.test(text)) return { line: 'may_va', measurements: null, matchedPhrase: null };
  const m = text.match(MEASURE_RE);
  return { line: 'bat', measurements: m ? m[0].trim() : null, matchedPhrase: m ? m[0] : null };
}

/** Bỏ các cụm dẫn ("giao cho", tên đã khớp, cụm hạn đã khớp, "nhóm bạt", số đo) khỏi câu
 * để còn lại nội dung việc. */
function cleanContent(
  text: string,
  assigneeName: string | null,
  dueMatchedPhrase: string | null,
  line: 'may_va' | 'bat',
  measureMatchedPhrase: string | null,
): string {
  let out = text;
  if (assigneeName) {
    const key = lastToken(assigneeName);
    out = out.replace(new RegExp(`giao\\s+cho\\s+${key}`, 'i'), '');
    out = out.replace(new RegExp(`\\bcho\\s+${key}\\b`, 'i'), '');
  }
  if (dueMatchedPhrase) {
    out = out.replace(new RegExp(dueMatchedPhrase, 'i'), '');
  }
  if (line === 'bat') {
    out = out.replace(/\b(?:giao\s+)?cho\s+nhóm\s+bạt\b/i, '');
    out = out.replace(/\bnhóm\s+bạt\b/i, '');
    out = out.replace(/\bcho\s+bạt\b/i, '');
    out = out.replace(/\bbạt\b/i, '');
  }
  if (measureMatchedPhrase) {
    out = out.replace(measureMatchedPhrase, '');
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
  const { line, measurements, matchedPhrase: measureMatch } = findLineAndMeasurements(text);
  // Mảng bạt luôn vào "Việc bạt chờ chia" (CAP-TASK-06) — không đoán người nhận trong câu nói.
  const assignee = line === 'bat' ? null : findAssignee(text, workers);
  const due = findDueAt(text, now);
  const content = cleanContent(text, assignee?.name ?? null, due.matchedPhrase, line, measureMatch);

  return {
    assigneeId: assignee?.id ?? null,
    assigneeName: assignee?.name ?? null,
    dueAt: due.dueAt,
    content,
    rawText: text,
    line,
    measurements,
  };
}
