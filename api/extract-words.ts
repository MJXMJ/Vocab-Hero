import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

const PROMPT = `You are an expert at reading text from images. 

STEP 1: Carefully read and transcribe ALL visible text from this image.

STEP 2: From the transcribed text, identify up to 15 vocabulary words that would be challenging or educational for a child aged 8-14. Only select words that ACTUALLY APPEAR in the image.

Return ONLY a valid JSON array where each element has:
- "word": The exact word (correct spelling)
- "definition": A simple, child-friendly definition
- "example": A fun example sentence
- "difficulty": "Heroic" (medium), "Legendary" (hard), or "Epic" (expert)

Do NOT add words not visible in the image. Return ONLY the JSON array, no other text.`;

async function callGemini(model: string, apiKey: string, base64: string, mimeType: string) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { inlineData: { data: base64, mimeType } },
                    { text: PROMPT }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.2
            }
        }),
    });

    return response;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server.' });
    }

    try {
        const { base64, mimeType } = req.body;
        if (!base64 || !mimeType) {
            return res.status(400).json({ error: 'Missing image data' });
        }

        // Try models in order — gemini-2.5-flash has the best vision quality,
        // fall back to lighter models if rate-limited
        const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite-001'];
        let lastError = '';

        for (const model of models) {
            const geminiResponse = await callGemini(model, apiKey, base64, mimeType);

            if (geminiResponse.ok) {
                const result = await geminiResponse.json();
                const textContent = result?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

                let cleaned = textContent.trim();
                if (cleaned.startsWith('```')) {
                    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
                }

                const data = JSON.parse(cleaned);
                const words = (Array.isArray(data) ? data : []).map((item: any, index: number) => ({
                    word: item.word || '',
                    definition: item.definition || '',
                    example: item.example || '',
                    difficulty: item.difficulty || 'Heroic',
                    id: `${Date.now()}-${index}`,
                    mastered: false,
                }));

                return res.status(200).json({ words, model });
            }

            // Model failed — log and try next
            const errBody = await geminiResponse.text();
            lastError = `${model}: ${geminiResponse.status} - ${errBody.substring(0, 300)}`;
            console.error(`Gemini ${model} failed:`, geminiResponse.status, errBody.substring(0, 500));

            // If it's NOT a rate limit or availability error, don't bother retrying
            if (geminiResponse.status !== 429 && geminiResponse.status !== 503) {
                // Return the actual error for debugging
                return res.status(geminiResponse.status).json({
                    error: `Gemini error: ${errBody.substring(0, 200)}`
                });
            }
        }

        // All models failed with rate limits
        return res.status(429).json({
            error: `All models rate-limited. Last error: ${lastError.substring(0, 200)}. Wait 1 minute and try again.`
        });
    } catch (e: any) {
        console.error('OCR handler error:', e?.message || e);
        return res.status(500).json({
            error: 'Server error: ' + (e?.message || 'Unknown error.')
        });
    }
}
