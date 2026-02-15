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

STEP 2: Check if the image contains a section headed "Dictation" (or "Dictation Passage", "Dictation Test", etc.). If found, extract the FULL paragraph text below that heading VERBATIM — preserve exact wording, punctuation, and capitalization.

STEP 3: From the transcribed text (excluding the dictation paragraph), identify up to 15 vocabulary words that would be challenging or educational for a child aged 8-14. Only select words that ACTUALLY APPEAR in the image.

Return ONLY a valid JSON object with this structure:
{
  "words": [
    { "word": "...", "definition": "...", "example": "...", "difficulty": "Heroic|Legendary|Epic" }
  ],
  "dictationParagraph": "The full dictation paragraph text here" OR null if no dictation section found
}

Do NOT add words not visible in the image. Return ONLY the JSON object, no other text.`;

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

        // Try models in order
        const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite-001'];
        let lastError = '';

        for (const model of models) {
            const geminiResponse = await callGemini(model, apiKey, base64, mimeType);

            if (geminiResponse.ok) {
                const result = await geminiResponse.json();
                const textContent = result?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

                let cleaned = textContent.trim();
                if (cleaned.startsWith('```')) {
                    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
                }

                const data = JSON.parse(cleaned);

                // Handle both old format (array) and new format (object with words + dictation)
                let wordsArray: any[];
                let dictationParagraph: string | null = null;

                if (Array.isArray(data)) {
                    // Old format: just an array of words
                    wordsArray = data;
                } else {
                    // New format: { words: [...], dictationParagraph: "..." }
                    wordsArray = data.words || [];
                    dictationParagraph = data.dictationParagraph || null;
                }

                const words = wordsArray.map((item: any, index: number) => ({
                    word: item.word || '',
                    definition: item.definition || '',
                    example: item.example || '',
                    difficulty: item.difficulty || 'Heroic',
                    id: `${Date.now()}-${index}`,
                    mastered: false,
                }));

                return res.status(200).json({ words, dictationParagraph, model });
            }

            // Model failed — log and try next
            const errBody = await geminiResponse.text();
            lastError = `${model}: ${geminiResponse.status} - ${errBody.substring(0, 300)}`;
            console.error(`Gemini ${model} failed:`, geminiResponse.status, errBody.substring(0, 500));

            if (geminiResponse.status !== 429 && geminiResponse.status !== 503) {
                return res.status(geminiResponse.status).json({
                    error: `Gemini error: ${errBody.substring(0, 200)}`
                });
            }
        }

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
