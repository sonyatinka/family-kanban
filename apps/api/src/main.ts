import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { setupSwagger } from './swagger/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // Parses the Cookie header into req.cookies, where we read the refresh token
  app.use(cookieParser());
  // The Vite frontend (port 5173) reaches the API through a proxy, but CORS helps other clients
  app.enableCors({ origin: 'http://localhost:5173' });
  app.enableShutdownHooks();
  // Only in development: a forgotten or misspelled NODE_ENV on a server keeps the docs closed
  const docs = app.get(ConfigService).get('NODE_ENV') === 'development';
  if (docs) setupSwagger(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API: http://localhost:${port}/api/health`);
  console.log(
    docs
      ? `Docs: http://localhost:${port}/api/docs`
      : 'Docs: off (set NODE_ENV=development in .env to turn them on)',
  );
}

bootstrap();
