#!/usr/bin/env node
/**
 * Vocab Hero — Database Setup Script
 *
 * Creates the test_papers table in your Postgres database.
 * Run once after setting POSTGRES_URL in .env.local:
 *
 *   npm run db:setup
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load .env.local before anything else
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const { Client } = require('pg');

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString || connectionString.startsWith('postgres://user:password')) {
  console.error('\n❌  No database URL found.\n');
  console.error('    1. Copy .env.example → .env.local');
  console.error('    2. Set POSTGRES_URL to your Neon / Supabase / Railway connection string');
  console.error('    3. Run: npm run db:setup\n');
  process.exit(1);
}

console.log('\n🔌  Connecting to database...');

const client = new Client({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log('✅  Connected!\n');

  console.log('📋  Creating test_papers table (if not exists)...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS test_papers (
      id                 SERIAL       PRIMARY KEY,
      test_date          DATE,
      words              JSONB        NOT NULL DEFAULT '[]',
      dictation_paragraph TEXT,
      created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  console.log('✅  Table ready!\n');

  // Quick sanity check
  const { rows } = await client.query('SELECT COUNT(*) AS count FROM test_papers');
  console.log(`📊  Current rows in test_papers: ${rows[0].count}`);
  console.log('\n🎉  Database setup complete — you\'re ready to go!\n');
} catch (err) {
  console.error('\n❌  Database setup failed:\n', err.message, '\n');
  process.exit(1);
} finally {
  await client.end();
}
