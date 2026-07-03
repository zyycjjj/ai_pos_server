import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterStoreDto } from './dto/register-store.dto';
import { SwitchStoreDto } from './dto/switch-store.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login with staff email and password.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Read current staff identity, active store, and role.' })
  me(@Req() request: Request & { user?: { id: string }; storeId?: string }) {
    return this.authService.me(request.user?.id ?? '', request.storeId ?? '');
  }

  @Post('switch-store')
  @ApiOperation({ summary: 'Switch active store for a multi-store user.' })
  switchStore(@Req() request: Request & { user?: { id: string } }, @Body() dto: SwitchStoreDto) {
    return this.authService.switchStore(request.user?.id ?? '', dto);
  }

  @Post('register-store')
  @ApiOperation({ summary: 'Create a first store and owner account for local demos.' })
  registerStore(@Body() dto: RegisterStoreDto) {
    return this.authService.registerStore(dto);
  }
}
