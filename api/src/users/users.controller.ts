import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UsersService } from './users.service.js';

@Controller('users')
@Roles('owner')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query('paired') paired?: string) {
    if (paired === 'false') return this.users.listUnpaired();
    return this.users.listAll();
  }
}
