import { sql, count } from 'drizzle-orm';
import { db } from '../src/index';
import { users } from '../src/schema';

async function main() {
  console.log('Connecting to database...');

  // 1. Simple connectivity check
  const res = await db.execute(sql`select 1 as ok`);
  console.log('Connectivity check:', res.rows[0]);

  // 2. Check table exists
  const tableExists = await db.execute(sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `);
  console.log('Tables in public schema:', tableExists.rows.map((r) => r.table_name));

  // 3. Count rows in users table (if it exists)
  try {
    const result = await db.select({ value: count() }).from(users);
    console.log('User count:', result[0].value);
  } catch (e) {
    console.log('Could not query users table:', (e as Error).message);
  }

  console.log('✅ Database connection test passed');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Database connection test failed:', e.message);
  process.exit(1);
});
