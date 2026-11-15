import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // Parses the Cookie header into req.cookies, where we read the refresh token
  app.use(cookieParser());
  // The Vite frontend (port 5173) reaches the API through a proxy, but CORS helps other clients
  app.enableCors({ origin: 'http://localhost:5173' });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API: http://localhost:${port}/api/health`);
}

bootstrap();
