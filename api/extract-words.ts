import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

const PROMPT = `You are an expert at reading text from images. Follow these steps VERY carefully:

STEP 1 — FULL TRANSCRIPTION:
Read and transcribe EVERY word visible in this image. Do not skip anything.

STEP 2 — DICTATION DETECTION:
Search the transcribed text for the word "Dictation" (case-insensitive). It might appear as:
- A heading like "Dictation", "Dictation:", "Dictation Passage", "Dictation Test"
- A label or title anywhere on the page
- Part of a numbered section like "3. Dictation"

If you find the word "Dictation" anywhere, extract ALL the text that comes AFTER it as the dictation paragraph. Copy it EXACTLY — preserve every word, space, capital letter, and punctuation mark (periods, commas, question marks, exclamation marks, etc.).

STEP 3 — VOCABULARY:
Locate the "Spelling Words" column in the table or list provided in the image. Extract the vocabulary words EXCLUSIVELY from this "Spelling Words" column. Do not extract words from example sentences, definitions, other columns, or the dictation paragraph. If there is no specific "Spelling Words" column, pick up to 15 challenging vocabulary words from the remaining text. Only use words ACTUALLY visible in the image.

STEP 4 — DATE:
Look for any date on the page that indicates when the spelling test is scheduled (e.g. "Week of March 3, 2026", "Test Date: 03/03/26", "Friday 3rd March", "March 2026" etc.).
Return the test date as a string in ISO format YYYY-MM-DD. If no date is found, return null.

Return ONLY a valid JSON object — no markdown, no backticks, no explanation:
{
  "words": [
    { "word": "example", "definition": "a simple definition", "example": "a fun sentence", "difficulty": "Heroic" }
  ],
  "dictationParagraph": "Exact paragraph text here with all punctuation preserved.",
  "testDate": "2026-03-03"
}

IMPORTANT:
- If NO dictation section is found, set "dictationParagraph" to null (the JSON keyword, not the string "null").
- If a dictation section IS found, copy it VERBATIM — every comma, period, and capital letter matters.
- The "words" array can be empty [] if no suitable vocabulary words are found.
- If no test date is visible, set "testDate" to null (the JSON keyword, not the string "null").
- Do NOT invent text that is not in the image.`;

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
                    // New format: { words: [...], dictationParagraph: "...", testDate: "..." }
                    wordsArray = data.words || [];
                    dictationParagraph = data.dictationParagraph || null;
                }

                const testDate: string | null = Array.isArray(data) ? null : (data.testDate || null);

                const words = wordsArray.map((item: any, index: number) => ({
                    word: item.word || '',
                    definition: item.definition || '',
                    example: item.example || '',
                    difficulty: item.difficulty || 'Heroic',
                    id: `${Date.now()}-${index}`,
                    mastered: false,
                }));

                return res.status(200).json({ words, dictationParagraph, testDate, model });
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
