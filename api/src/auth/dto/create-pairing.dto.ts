import { IsUUID } from 'class-validator';

export class CreatePairingDto {
  @IsUUID()
  userId: string;
}
