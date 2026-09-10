import { IsOptional, IsString, Length } from 'class-validator';

export class RedeemPairingDto {
  @IsString()
  @Length(6, 6)
  code: string;

  @IsOptional()
  @IsString()
  deviceLabel?: string;

  @IsOptional()
  @IsString()
  deviceToken?: string;
}
