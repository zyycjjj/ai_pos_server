import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ZenStackModule } from '@zenstackhq/server/nestjs';
import { ClsModule, ClsService } from 'nestjs-cls';

import { AuthMiddleware } from './common/auth.middleware';
import { RpcMiddleware } from './common/rpc.middleware';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { AiModule } from './modules/ai/ai.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { ProductsModule } from './modules/products/products.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { useZenFactory } from './zenstack/useZenFactory';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ClsModule.forRoot({
      global: true,
    }),
    PrismaModule,
    ZenStackModule.registerAsync({
      global: true,
      useFactory: useZenFactory,
      inject: [PrismaService, ClsService],
      extraProviders: [PrismaService],
    }),
    HealthModule,
    AuthModule,
    AdminModule,
    AiModule,
    CheckoutModule,
    ReceiptsModule,
    MetricsModule,
    ProductsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes('*').apply(RpcMiddleware).forRoutes('api/rpc');
  }
}
