// Tách câu giọng nói thành các trường của S3 ("không tự phát việc —
// luôn trả về S3 để người soát"). Rule-based, chạy trên máy, không gọi dịch vụ ngoài —
// khớp quyết định "on-device, không LLM".
//
// nghe thấy từ "bạt" → line='bat', không tìm người
// nhận trong câu (mảng bạt luôn vào "Việc bạt chờ chia", không giao đích danh qua giọng
// nói); bắt cụm số + đơn vị đo ("mét"/"m") gần đó làm measurements, GIỮ NGUYÊN dạng thô đã
// nghe được — không tách number/unit có cấu trúc (không ai đối chiếu
// tự động, đã loại trừ nghiệm thu).

import { matchAssignees, stripDiacritics, type NameCandidate } from './matchAssignees';

export type VoiceWorker = NameCandidate;

export interface ParsedUtterance {
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: string | null; // ISO date (yyyy-MM-dd), không giờ
  content: string;
  rawText: string;
  line: 'may_va' | 'bat';
  measurements: string | null;
  // người gần đúng / khớp chắc ở phương án nghe sau, tối đa 3. S3 chỉ gợi
  // ý, KHÔNG tự tick (matchAssignees.ts).
  suggestedAssigneeIds: string[];
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

function lastToken(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
}

/** Tìm hạn: hôm nay / mai / mốt / thứ trong tuần → ngày ISO tới gần nhất. Export
 * để S30 (tự ghi việc) cho gõ hạn bằng chữ ("thứ Sáu", "mai") như lúc nói. */
export function findDueAt(text: string, now: Date): { dueAt: string | null; matchedPhrase: string | null } {
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
  stripGenericName = false,
): string {
  let out = text;
  const beforeName = out;
  if (assigneeName) {
    const key = lastToken(assigneeName);
    out = out.replace(new RegExp(`giao\\s+cho\\s+${key}`, 'i'), '');
    out = out.replace(new RegExp(`\\bcho\\s+${key}\\b`, 'i'), '');
  }
  if (out === beforeName && stripGenericName) {
    // tên nghe lệch ("Toán" cho "Toàn", khớp ở phương án sau, hoặc chỉ gần
    // đúng): tên thật không nằm nguyên văn trong câu nên bóc theo tên không ăn — bóc chung
    // "giao cho <từ>", không để chữ nghe sai lọt vào tên việc.
    out = out.replace(/giao\s+cho\s+\S+/i, '');
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

/**
 * `alternatives`: các phương án nghe khác của bộ nhận dạng, theo độ tin cậy
 * giảm dần — phương án đầu chính là `rawText`. Nội dung/hạn/số đo vẫn tách từ `rawText`;
 * riêng người nhận khớp trên mọi phương án (matchAssignees.ts).
 */
export function parseUtterance(
  rawText: string,
  workers: VoiceWorker[],
  now: Date = new Date(),
  alternatives: string[] = [],
): ParsedUtterance {
  const text = rawText.trim();
  const { line, measurements, matchedPhrase: measureMatch } = findLineAndMeasurements(text);
  // Mảng bạt luôn vào "Việc bạt chờ chia" — không đoán người nhận trong câu nói.
  const match = line === 'bat' ? { matchedId: null, suggestedIds: [] } : matchAssignees([text, ...alternatives], workers);
  const assignee = match.matchedId ? workers.find((w) => w.id === match.matchedId) ?? null : null;
  const due = findDueAt(text, now);
  const content = cleanContent(
    text,
    assignee?.name ?? null,
    due.matchedPhrase,
    line,
    measureMatch,
    line !== 'bat' && (!!assignee || match.suggestedIds.length > 0),
  );

  return {
    assigneeId: assignee?.id ?? null,
    assigneeName: assignee?.name ?? null,
    dueAt: due.dueAt,
    content,
    rawText: text,
    line,
    measurements,
    suggestedAssigneeIds: match.suggestedIds,
  };
}
