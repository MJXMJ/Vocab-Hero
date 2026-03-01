
import { GoogleGenAI, Modality } from "@google/genai";
import { ImageSize } from "../types";

// Client-side Gemini client — only used for TTS and illustration (non-sensitive features)
// The API key comes from build-time env or is empty (these features are optional)
const getGeminiClient = () => {
  const key = process.env.API_KEY || '';
  return new GoogleGenAI({ apiKey: key });
};

export const isQuotaExceeded = (err: any): boolean => {
  const message = err?.message || String(err);
  return message.includes("RESOURCE_EXHAUSTED") || message.includes("429");
};

export const generateHeroIllustration = async (word: string, size: ImageSize): Promise<string | null> => {
  const ai = getGeminiClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          { text: `A vibrant, high-quality, playful 3D cartoon illustration of a superhero mascot representing the word "${word}". Dynamic pose, colorful, suitable for a kid's vocabulary game.` }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: size
        }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (e) {
    if (isQuotaExceeded(e)) {
      throw new Error("QUOTA_EXHAUSTED");
    }
    throw e;
  }
  return null;
};

export const playHighQualityTTS = async (text: string) => {
  const ai = getGeminiClient();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Pronounce the following word clearly and naturally for a spelling challenge: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Aoede' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) return;

    // Safari on iOS often requires AudioContext to be resumed during a user interaction
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.start();
  } catch (e) {
    if (isQuotaExceeded(e)) {
      console.warn("TTS Quota exceeded.");
    }
  }
};

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
