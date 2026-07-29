import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ZenStackModule } from '@zenstackhq/server/nestjs';
import { ClsModule, ClsService } from 'nestjs-cls';

import { AuthMiddleware } from './common/auth.middleware';
import { RpcMiddleware } from './common/rpc.middleware';
import { AdminModule } from './modules/admin/admin.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AuthModule } from './modules/auth/auth.module';
import { AiModule } from './modules/ai/ai.module';
import { BusinessDayModule } from './modules/business-day/business-day.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { CustomerSegmentsModule } from './modules/customer-segments/customer-segments.module';
import { CustomersModule } from './modules/customers/customers.module';
import { HealthModule } from './modules/health/health.module';
import { KitchenModule } from './modules/kitchen/kitchen.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { ProductsModule } from './modules/products/products.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { PrintModule } from './modules/print/print.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { ReportsModule } from './modules/reports/reports.module';
import { TablesModule } from './modules/tables/tables.module';
import { VersionModule } from './modules/version/version.module';
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
    PermissionsModule,
    ApprovalsModule,
    AdminModule,
    AnalyticsModule,
    AiModule,
    KitchenModule,
    BusinessDayModule,
    CheckoutModule,
    CustomerSegmentsModule,
    CustomersModule,
    PrintModule,
    ReceiptsModule,
    ReportsModule,
    TablesModule,
    VersionModule,
    MetricsModule,
    ProductsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes('*').apply(RpcMiddleware).forRoutes('api/rpc');
  }
}
