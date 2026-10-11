import { IsNumber, Min } from 'class-validator';

// (công thức gợi ý) đẩy backlog
// nên đây luôn là nhập tay, không có field "gợi ý".
export class CutDoneDto {
  @IsNumber()
  @Min(0)
  fabricMeters: number;

  @IsNumber()
  @Min(0)
  foamSheets: number;
}
