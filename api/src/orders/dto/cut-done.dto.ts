import { IsNumber, Min } from 'class-validator';

// S24 "Tính cắt vải, mút" (CAP-DEM-04, AC-20) — CAP-DEM-03 (công thức gợi ý) đẩy backlog
// (DECISIONS.md 2026-09-18), nên đây luôn là nhập tay, không có field "gợi ý".
export class CutDoneDto {
  @IsNumber()
  @Min(0)
  fabricMeters: number;

  @IsNumber()
  @Min(0)
  foamSheets: number;
}
