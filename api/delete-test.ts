import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

let pool: Pool | null = null;

function getPool(): Pool {
    if (!pool) {
        const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
        if (!connectionString) throw new Error('No POSTGRES_URL configured');
        pool = new Pool({
            connectionString,
            ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
            max: 5,
        });
    }
    return pool;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

    const id = parseInt(req.query.id as string, 10);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const client = await getPool().connect();
    try {
        await client.query('DELETE FROM test_papers WHERE id = $1', [id]);
        return res.status(200).json({ ok: true });
    } catch (e: any) {
        console.error('delete-test error:', e);
        return res.status(500).json({ error: e.message || 'Database error' });
    } finally {
        client.release();
    }
}
