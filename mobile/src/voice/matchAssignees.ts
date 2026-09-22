// AC-37/AC-38 (vòng 9, CAP-FB-01) — khớp tên người nhận trên MỌI phương án nghe của bộ
// nhận dạng (`maxAlternatives`), không chỉ phương án đầu. Hàm thuần, không gọi dịch vụ ngoài
// (ARCHITECTURE.md §6 "Mở rộng vòng 9 — Giọng nói (client)").
//
// Quy tắc (DECISIONS.md 2026-09-22 (I)):
// - Tên gọi = từ cuối của `User.name` (người Việt gọi tên, không gọi họ), so sau khi bỏ dấu,
//   `đ`→`d`, chữ thường.
// - Phương án ĐẦU TIÊN (độ tin cậy cao nhất) có khớp chắc thắng → điền sẵn người nhận. Nếu
//   phương án đó khớp chắc NHIỀU người (trùng tên gọi, hoặc nói hai tên) thì không đoán —
//   những người đó xuống hàng "Gợi ý" (giữ tinh thần "không đoán" của vòng 2).
// - Người khớp chắc ở phương án sau + người gần đúng (Levenshtein ≤2 trên tên gọi) gộp vào
//   "Gợi ý" tối đa 3, bỏ trùng, gần nhất trước rồi theo tên. Không bao giờ tự chọn người gợi ý.
//   Gần đúng chỉ dò khi không phương án nào khớp chắc (AC-38 "không phương án nào khớp chắc
//   nhưng có tên gần đúng").

export interface NameCandidate {
  id: string;
  name: string;
}

export interface AssigneeMatch {
  matchedId: string | null;
  suggestedIds: string[];
}

const MAX_SUGGESTIONS = 3;
const MAX_DISTANCE = 2;

/** Bỏ dấu tiếng Việt + `đ/Đ`→`d` + chữ thường. `đ` không phải chữ có dấu kết hợp (NFD không
 * tách nó ra) nên phải đổi riêng — thiếu bước này "Đức" không bao giờ khớp "duc". */
export function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

/** Tên gọi (từ cuối của họ tên), GIỮ dấu — dùng cho `contextualStrings` của bộ nhận dạng. */
export function callName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? '';
}

function callKey(name: string): string {
  return stripDiacritics(callName(name));
}

function tokens(text: string): string[] {
  return stripDiacritics(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Từ hay đứng ngay sau "cho" mà không phải tên người — bỏ qua khi dò gần đúng.
const NOT_NAMES = new Set(['nhom', 'bat', 'may', 'anh', 'chi', 'em', 'co', 'chu', 'ban', 'thang']);

/**
 * Chỉ dò gần đúng ở 1–2 từ ngay sau "cho" (hoặc sau "giao" nếu không có "cho"). Dò trên cả
 * câu thì mọi từ ngắn đều "gần" một tên ngắn nào đó ("áo" ~ "Tú", khoảng cách 2) — hàng
 * gợi ý sẽ toàn người không liên quan.
 */
function nameSlotTokens(text: string): string[] {
  const t = tokens(text);
  let idx = t.indexOf('cho');
  if (idx < 0) idx = t.indexOf('giao');
  if (idx < 0) return [];
  return t.slice(idx + 1, idx + 3).filter((w) => !NOT_NAMES.has(w));
}

/** Khoảng cách ≤2 nhưng không quá nửa độ dài từ dài hơn — "tu"~"tuan" (2/4) được,
 * "ao"~"tu" (2/2) không. Lệch 2 thì phải cùng chữ đầu: bộ nhận dạng hay nghe sai thanh/vần
 * cuối, ít khi sai phụ âm đầu — không có luật này "Toán" gợi ý cả "Lan" (lệch 2). */
function isNear(a: string, b: string): number | null {
  const d = levenshtein(a, b);
  if (d === 0) return null; // trùng hẳn là khớp chắc, không phải gần đúng
  if (d > MAX_DISTANCE || d > Math.floor(Math.max(a.length, b.length) / 2)) return null;
  if (d === 2 && a[0] !== b[0]) return null;
  return d;
}

function exactMatches(text: string, workers: NameCandidate[]): NameCandidate[] {
  const words = new Set(tokens(text));
  return workers.filter((w) => {
    const key = callKey(w.name);
    return key.length > 0 && words.has(key);
  });
}

export function matchAssignees(alternatives: string[], workers: NameCandidate[]): AssigneeMatch {
  const alts = alternatives.map((a) => a.trim()).filter(Boolean);
  let matchedId: string | null = null;
  let firstExactFound = false;
  // id → khoảng cách tốt nhất (0 = khớp chắc ở phương án sau / trùng tên gọi).
  const scores = new Map<string, number>();
  const note = (id: string, d: number) => {
    const cur = scores.get(id);
    if (cur === undefined || d < cur) scores.set(id, d);
  };

  for (const alt of alts) {
    const exact = exactMatches(alt, workers);
    if (!firstExactFound && exact.length > 0) {
      firstExactFound = true;
      if (exact.length === 1) matchedId = exact[0].id;
      else exact.forEach((w) => note(w.id, 0));
      continue;
    }
    exact.forEach((w) => note(w.id, 0));
  }

  // AC-38 — gần đúng chỉ khi KHÔNG phương án nào khớp chắc; đã có người khớp chắc thì gợi ý
  // thêm người "na ná" chỉ làm rối (người khớp chắc ở phương án sau vẫn giữ ở trên).
  const anyExact = firstExactFound;
  for (const alt of anyExact ? [] : alts) {
    for (const word of nameSlotTokens(alt)) {
      for (const w of workers) {
        const d = isNear(word, callKey(w.name));
        if (d !== null) note(w.id, d);
      }
    }
  }

  if (matchedId) scores.delete(matchedId);
  const byId = new Map(workers.map((w) => [w.id, w]));
  const suggestedIds = Array.from(scores.entries())
    .sort((a, b) => a[1] - b[1] || (byId.get(a[0])?.name ?? '').localeCompare(byId.get(b[0])?.name ?? '', 'vi'))
    .slice(0, MAX_SUGGESTIONS)
    .map(([id]) => id);

  return { matchedId, suggestedIds };
}

/** Từ mồi cho bộ nhận dạng (`contextualStrings`): tên gọi của người đang hoạt động + vài
 * cụm giao việc hay nói. Bỏ trùng (hai người cùng tên gọi chỉ cần mồi một lần). */
export function voiceContextStrings(workers: NameCandidate[]): string[] {
  const names = workers.map((w) => callName(w.name)).filter(Boolean);
  return Array.from(new Set([...names, 'giao cho', 'may', 'bạt', 'hạn', 'nhóm bạt']));
}
