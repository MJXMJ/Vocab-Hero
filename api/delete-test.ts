import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

    const id = parseInt(req.query.id as string, 10);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    try {
        await sql`DELETE FROM test_papers WHERE id = ${id}`;
        return res.status(200).json({ ok: true });
    } catch (e: any) {
        console.error('delete-test error:', e);
        return res.status(500).json({ error: e.message || 'Database error' });
    }
}
