import { $ } from 'bun';
import { existsSync, rmSync } from 'fs';
import path from 'path';

console.log('🔨 Building Nova TON Backend for Production...\n');

const distPath = path.join(process.cwd(), 'dist');

// Clean dist directory
if (existsSync(distPath)) {
  console.log('🧹 Cleaning dist directory...');
  rmSync(distPath, { recursive: true });
}

// Build the application
console.log('📦 Building application...');

try {
  await $`bun build src/index.ts --outdir dist --target bun --minify`;
  
  // Copy necessary files
  console.log('📄 Copying configuration files...');
  await $`cp prisma/schema.prisma dist/`;
  await $`cp package.json dist/`;
  await $`cp .env.production dist/.env.example`;
  
  // Generate Prisma client
  console.log('🔧 Generating Prisma client...');
  process.env.DATABASE_URL = 'file:./data/nova.db';
  await $`bun run db:generate`;
  
  console.log('\n✅ Build completed successfully!');
  console.log('📁 Output directory: dist/');
  console.log('\n📝 Next steps:');
  console.log('  1. Copy dist/ folder to your server');
  console.log('  2. Run: bun install --production');
  console.log('  3. Configure .env file');
  console.log('  4. Run: bun run start');
  
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
