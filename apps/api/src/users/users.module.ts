import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

// No controller yet: AuthModule creates and looks up users
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
