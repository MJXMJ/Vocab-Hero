import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';

export const config = {
    api: {
        bodyParser: { sizeLimit: '1mb' },
    },
};

async function ensureTable() {
    await sql`
        CREATE TABLE IF NOT EXISTS test_papers (
            id SERIAL PRIMARY KEY,
            test_date DATE,
            words JSONB NOT NULL DEFAULT '[]',
            dictation_paragraph TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        await ensureTable();

        if (req.method === 'GET') {
            const result = await sql`
                SELECT id, test_date, words, dictation_paragraph, created_at
                FROM test_papers
                ORDER BY test_date DESC NULLS LAST, created_at DESC
            `;
            return res.status(200).json({
                tests: result.rows.map(r => ({
                    id: r.id,
                    testDate: r.test_date ? r.test_date.toISOString().split('T')[0] : null,
                    words: r.words,
                    dictationParagraph: r.dictation_paragraph,
                    createdAt: r.created_at,
                })),
            });
        }

        if (req.method === 'POST') {
            const { testDate, words, dictationParagraph } = req.body;
            if (!Array.isArray(words)) {
                return res.status(400).json({ error: 'Missing or invalid words array' });
            }
            const result = await sql`
                INSERT INTO test_papers (test_date, words, dictation_paragraph)
                VALUES (${testDate || null}, ${JSON.stringify(words)}, ${dictationParagraph || null})
                RETURNING id, created_at
            `;
            return res.status(201).json({
                id: result.rows[0].id,
                createdAt: result.rows[0].created_at,
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e: any) {
        console.error('tests handler error:', e);
        return res.status(500).json({ error: e.message || 'Database error' });
    }
}
