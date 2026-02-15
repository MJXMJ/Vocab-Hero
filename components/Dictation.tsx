
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DiffSegment } from '../types';

interface DictationProps {
    paragraph: string;
    onComplete: (score: number) => void;
    onReplay: () => void;
}

// ─── Chunking: split paragraph into dictation-length pieces (2-7 words) ───
function splitIntoChunks(paragraph: string): string[] {
    // Split into sentences at . ! ?
    const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [paragraph];
    const chunks: string[] = [];

    for (const sentence of sentences) {
        const words = sentence.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) continue;

        if (words.length <= 8) {
            // Short sentence → 1 chunk
            chunks.push(words.join(' '));
        } else {
            // Long sentence → break at commas, conjunctions, or every ~5 words
            let current: string[] = [];
            for (let i = 0; i < words.length; i++) {
                current.push(words[i]);
                const word = words[i];
                const isBreakPoint =
                    word.endsWith(',') ||
                    word.endsWith(';') ||
                    word.endsWith(':') ||
                    ['and', 'but', 'or', 'so', 'then', 'when', 'while', 'because', 'although', 'which', 'that', 'where'].includes(words[i + 1]?.toLowerCase());

                if (current.length >= 3 && (isBreakPoint || current.length >= 7)) {
                    chunks.push(current.join(' '));
                    current = [];
                }
            }
            if (current.length > 0) {
                // Merge tiny leftover with previous chunk if too small
                if (current.length <= 2 && chunks.length > 0) {
                    chunks[chunks.length - 1] += ' ' + current.join(' ');
                } else {
                    chunks.push(current.join(' '));
                }
            }
        }
    }

    return chunks;
}

// ─── Diff algorithm: LCS-based word comparison ───
function computeDiff(expected: string, userInput: string): { segments: DiffSegment[]; score: number } {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s'-]/g, '').trim();
    const expectedWords = expected.split(/\s+/).filter(Boolean);
    const userWords = userInput.split(/\s+/).filter(Boolean);
    const expNorm = expectedWords.map(w => normalize(w));
    const usrNorm = userWords.map(w => normalize(w));

    // LCS table
    const m = expNorm.length;
    const n = usrNorm.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (expNorm[i - 1] === usrNorm[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrace to build segments
    const segments: DiffSegment[] = [];
    let i = m, j = n;

    const result: { expIdx: number; usrIdx: number; type: 'correct' | 'wrong' | 'missing' }[] = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && expNorm[i - 1] === usrNorm[j - 1]) {
            result.unshift({ expIdx: i - 1, usrIdx: j - 1, type: 'correct' });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.unshift({ expIdx: -1, usrIdx: j - 1, type: 'wrong' });
            j--;
        } else {
            result.unshift({ expIdx: i - 1, usrIdx: -1, type: 'missing' });
            i--;
        }
    }

    // Build display segments
    for (const r of result) {
        if (r.type === 'correct') {
            segments.push({ text: expectedWords[r.expIdx], type: 'correct' });
        } else if (r.type === 'missing') {
            segments.push({ text: expectedWords[r.expIdx], type: 'missing' });
        } else {
            segments.push({ text: userWords[r.usrIdx], type: 'wrong' });
        }
    }

    const correct = result.filter(r => r.type === 'correct').length;
    const total = Math.max(m, 1);
    const score = Math.round((correct / total) * 100);

    return { segments, score };
}

// ─── TTS using Web Speech API ───
let voicesLoaded = false;
let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

function getVoices(): Promise<SpeechSynthesisVoice[]> {
    if (voicesLoaded) return Promise.resolve(window.speechSynthesis.getVoices());
    if (!voicesPromise) {
        voicesPromise = new Promise((resolve) => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) { voicesLoaded = true; resolve(voices); return; }
            window.speechSynthesis.onvoiceschanged = () => { voicesLoaded = true; resolve(window.speechSynthesis.getVoices()); };
            setTimeout(() => { voicesLoaded = true; resolve(window.speechSynthesis.getVoices()); }, 1000);
        });
    }
    return voicesPromise;
}

async function speakText(text: string, rate = 0.8): Promise<void> {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    await new Promise(r => setTimeout(r, 50));

    const voices = await getVoices();
    return new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = rate;
        u.pitch = 1.0;
        u.volume = 1.0;
        const preferred = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Google') || v.name.includes('Natural')));
        const fallback = voices.find(v => v.lang.startsWith('en-'));
        if (preferred) u.voice = preferred;
        else if (fallback) u.voice = fallback;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
    });
}

export const Dictation: React.FC<DictationProps> = ({ paragraph, onComplete, onReplay }) => {
    const [phase, setPhase] = useState<'intro' | 'playing' | 'writing' | 'results'>('intro');
    const [chunks] = useState(() => splitIntoChunks(paragraph));
    const [currentChunk, setCurrentChunk] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [userInput, setUserInput] = useState('');
    const [diffResult, setDiffResult] = useState<DiffSegment[] | null>(null);
    const [score, setScore] = useState<number | null>(null);
    const [chunkRepeat, setChunkRepeat] = useState(0); // 0 = first read, 1 = second read
    const [chunkPhase, setChunkPhase] = useState<'speaking' | 'waiting'>('speaking');
    const [attempts, setAttempts] = useState(0);

    const isPausedRef = useRef(false);
    const abortRef = useRef(false);
    const timerRef = useRef<number | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    // Keep ref in sync
    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

    const playBeep = useCallback((freq: number, duration: number) => {
        if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
        osc.start();
        osc.stop(ctx.currentTime + duration);
    }, []);

    const playSuccessSound = useCallback(() => {
        playBeep(523.25, 0.2);
        setTimeout(() => playBeep(659.25, 0.2), 100);
        setTimeout(() => playBeep(783.99, 0.2), 200);
        setTimeout(() => playBeep(1046.5, 0.4), 300);
    }, [playBeep]);

    const playClapSound = useCallback(() => {
        // Simulated clap with noise bursts
        for (let i = 0; i < 5; i++) {
            setTimeout(() => playBeep(200 + Math.random() * 400, 0.08), i * 200);
        }
    }, [playBeep]);

    // Wait with pause support
    const waitMs = useCallback((ms: number): Promise<boolean> => {
        return new Promise((resolve) => {
            let elapsed = 0;
            const interval = 100;
            const tick = () => {
                if (abortRef.current) { resolve(false); return; }
                if (!isPausedRef.current) elapsed += interval;
                if (elapsed >= ms) { resolve(true); return; }
                setTimeout(tick, interval);
            };
            tick();
        });
    }, []);

    // Countdown with pause support and beeps
    const doCountdown = useCallback(async (seconds: number): Promise<boolean> => {
        for (let s = seconds; s > 0; s--) {
            if (abortRef.current) return false;
            setCountdown(s);
            if (s <= 3) playBeep(880, 0.1);
            const ok = await waitMs(1000);
            if (!ok) return false;
        }
        setCountdown(0);
        return true;
    }, [waitMs, playBeep]);

    // Main dictation playback loop
    const runDictation = useCallback(async () => {
        abortRef.current = false;

        for (let ci = 0; ci < chunks.length; ci++) {
            if (abortRef.current) return;

            const chunk = chunks[ci];
            const wordCount = chunk.split(/\s+/).length;
            const writingTime = Math.max(5, 5 + wordCount * 0.5);

            for (let rep = 0; rep < 2; rep++) {
                if (abortRef.current) return;

                // Wait while paused
                while (isPausedRef.current && !abortRef.current) {
                    await new Promise(r => setTimeout(r, 100));
                }
                if (abortRef.current) return;

                setCurrentChunk(ci);
                setChunkRepeat(rep);
                setChunkPhase('speaking');

                // Speak the chunk
                await speakText(chunk, 0.8);

                if (abortRef.current) return;
            }

            // Writing time countdown
            setChunkPhase('waiting');
            const ok = await doCountdown(Math.ceil(writingTime));
            if (!ok) return;
        }

        // All chunks done
        setPhase('writing');
        textareaRef.current?.focus();
    }, [chunks, doCountdown]);

    const handleStart = async () => {
        setPhase('playing');
        // Voice encouragement
        await speakText("Get ready for your dictation challenge! Listen carefully and type what you hear.", 0.9);
        await waitMs(500);
        runDictation();
    };

    const handlePause = () => {
        setIsPaused(prev => {
            if (prev) {
                // Resuming — also resume speech synthesis if it was interrupted
                window.speechSynthesis.resume();
            } else {
                window.speechSynthesis.pause();
            }
            return !prev;
        });
    };

    const handleVerify = () => {
        const { segments, score: sc } = computeDiff(paragraph, userInput);
        setDiffResult(segments);
        setScore(sc);
        setAttempts(prev => prev + 1);
        setPhase('results');

        if (sc >= 95) {
            playSuccessSound();
            setTimeout(() => playClapSound(), 500);
            speakText("Incredible! You are a true Vocab Hero! Perfect dictation!", 1.0);
            onComplete(sc);
        }
    };

    const handleReplay = () => {
        setPhase('intro');
        setCurrentChunk(0);
        setChunkRepeat(0);
        setChunkPhase('speaking');
        setCountdown(0);
        setIsPaused(false);
        setDiffResult(null);
        setScore(null);
        setUserInput('');
        abortRef.current = true;
        window.speechSynthesis.cancel();
        onReplay();
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            abortRef.current = true;
            window.speechSynthesis.cancel();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // Intro voice
    useEffect(() => {
        if (phase === 'intro') {
            speakText("Amazing job completing Stage One! Now get ready for the Final Dictation Challenge!", 0.95);
        }
    }, []);

    const progress = chunks.length > 0 ? ((currentChunk + 1) / chunks.length) * 100 : 0;

    return (
        <div className="flex flex-col items-center gap-4 w-full max-w-lg mx-auto px-4">
            {/* Header */}
            <div className="text-center">
                <h2 className="hero-font text-3xl sm:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500">
                    ✍️ DICTATION CHALLENGE
                </h2>
                <p className="text-gray-500 font-bold text-xs mt-1">STAGE 2 — FINAL TEST</p>
            </div>

            {/* ── INTRO PHASE ── */}
            {phase === 'intro' && (
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 sm:p-8 w-full text-center border-4 border-purple-200">
                    <div className="text-6xl mb-4">🎧</div>
                    <h3 className="hero-font text-2xl text-purple-600 mb-2">Ready for Dictation?</h3>
                    <p className="text-gray-600 text-sm mb-4 leading-relaxed">
                        Listen carefully to each phrase. It will be read <strong>twice</strong>.
                        Type everything you hear in the text box.
                    </p>
                    <div className="bg-purple-50 rounded-xl p-3 mb-4 border border-purple-100">
                        <p className="text-purple-700 text-xs font-bold">
                            📝 {chunks.length} phrase{chunks.length !== 1 ? 's' : ''} · ⏱ Write as you listen · 🔄 Each phrase read 2×
                        </p>
                    </div>
                    <button
                        onClick={handleStart}
                        className="bg-gradient-to-r from-purple-500 to-pink-500 text-white hero-font text-xl px-8 py-3 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all animate-pulse"
                    >
                        🚀 START DICTATION
                    </button>
                </div>
            )}

            {/* ── PLAYING PHASE ── */}
            {phase === 'playing' && (
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-5 sm:p-6 w-full border-4 border-blue-200">
                    {/* Progress bar */}
                    <div className="mb-3">
                        <div className="flex justify-between text-xs font-bold text-gray-400 mb-1">
                            <span>Phrase {currentChunk + 1} / {chunks.length}</span>
                            <span>{chunkRepeat === 0 ? '1st read' : '2nd read'}</span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full transition-all duration-500"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>

                    {/* Current chunk display */}
                    <div className="text-center py-4">
                        {chunkPhase === 'speaking' ? (
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center shadow-lg animate-pulse">
                                    <span className="text-3xl">🔊</span>
                                </div>
                                <p className="hero-font text-lg text-purple-600">Listening...</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg ${countdown <= 3 ? 'bg-red-400 animate-pulse' : 'bg-yellow-400'}`}>
                                    <span className="hero-font text-2xl text-white">{countdown}</span>
                                </div>
                                <p className="hero-font text-lg text-gray-600">Write now! ✍️</p>
                            </div>
                        )}
                    </div>

                    {/* Textarea for typing */}
                    <textarea
                        ref={textareaRef}
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="Type what you hear here..."
                        className="w-full h-32 bg-gray-50 border-2 border-gray-200 rounded-xl p-3 text-sm font-medium focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200 resize-none"
                    />

                    {/* Pause button */}
                    <button
                        onClick={handlePause}
                        className={`w-full mt-3 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md ${isPaused
                                ? 'bg-gradient-to-r from-green-400 to-green-500 text-white animate-pulse'
                                : 'bg-white border-2 border-gray-300 text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        {isPaused ? '▶️ RESUME' : '⏸ PAUSE'}
                    </button>
                </div>
            )}

            {/* ── WRITING PHASE (all chunks done, finalize) ── */}
            {phase === 'writing' && (
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-5 sm:p-6 w-full border-4 border-green-200">
                    <div className="text-center mb-3">
                        <div className="text-4xl mb-2">✅</div>
                        <h3 className="hero-font text-xl text-green-600">Dictation Complete!</h3>
                        <p className="text-gray-500 text-xs">Review and finalize your text, then check it.</p>
                    </div>

                    <textarea
                        ref={textareaRef}
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="Your dictation text..."
                        className="w-full h-40 bg-gray-50 border-2 border-green-200 rounded-xl p-3 text-sm font-medium focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-200 resize-none"
                    />

                    <button
                        onClick={handleVerify}
                        disabled={!userInput.trim()}
                        className="w-full mt-3 bg-gradient-to-r from-green-400 to-blue-500 text-white hero-font text-lg py-3 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
                    >
                        ✅ CHECK MY DICTATION
                    </button>
                </div>
            )}

            {/* ── RESULTS PHASE ── */}
            {phase === 'results' && diffResult && score !== null && (
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-5 sm:p-6 w-full border-4 border-pink-200">
                    {/* Score */}
                    <div className="text-center mb-4">
                        <div className={`inline-block px-6 py-2 rounded-full hero-font text-2xl ${score >= 95 ? 'bg-gradient-to-r from-yellow-300 to-yellow-500 text-yellow-900' :
                                score >= 80 ? 'bg-gradient-to-r from-green-300 to-green-500 text-green-900' :
                                    'bg-gradient-to-r from-pink-300 to-pink-500 text-pink-900'
                            }`}>
                            {score}% {score >= 95 ? '🏆' : score >= 80 ? '👏' : '💪'}
                        </div>
                        <p className="text-gray-500 text-xs mt-2 font-bold">
                            {score >= 95 ? 'PERFECT! Mastery achieved!' :
                                score >= 80 ? 'Great job! Almost there!' :
                                    'Keep practicing! You can do it!'}
                        </p>
                    </div>

                    {/* Diff display */}
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-4 max-h-48 overflow-y-auto">
                        <p className="text-xs font-bold text-gray-400 mb-2">YOUR DICTATION:</p>
                        <div className="flex flex-wrap gap-0.5 leading-relaxed">
                            {diffResult.map((seg, i) => (
                                <span
                                    key={i}
                                    className={`px-1 py-0.5 rounded text-sm font-medium ${seg.type === 'correct' ? 'text-gray-800' :
                                            seg.type === 'wrong' ? 'bg-red-500 text-white line-through' :
                                                'bg-red-500 text-white italic'
                                        }`}
                                    title={seg.type === 'missing' ? 'Missing word' : seg.type === 'wrong' ? 'Wrong word' : ''}
                                >
                                    {seg.type === 'missing' ? `[${seg.text}]` : seg.text}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="flex gap-4 justify-center text-[10px] font-bold text-gray-400 mb-4">
                        <span>✅ Correct</span>
                        <span className="text-red-500">❌ Wrong <span className="bg-red-500 text-white px-1 rounded">word</span></span>
                        <span className="text-red-500">🟡 Missing <span className="bg-red-500 text-white px-1 rounded italic">[word]</span></span>
                    </div>

                    {/* Actions */}
                    {score >= 95 ? (
                        <div className="text-center">
                            <div className="text-6xl mb-2 animate-bounce">🏆</div>
                            <p className="hero-font text-xl text-yellow-600 mb-3">MASTERY BADGE EARNED!</p>
                        </div>
                    ) : (
                        <div className="flex gap-3 w-full">
                            <button
                                onClick={handleReplay}
                                className="flex-1 bg-gradient-to-r from-purple-400 to-pink-500 text-white hero-font text-base py-3 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all"
                            >
                                🔄 TRY AGAIN
                            </button>
                            <button
                                onClick={() => {
                                    setPhase('writing');
                                    setDiffResult(null);
                                    setScore(null);
                                }}
                                className="flex-1 bg-white border-2 border-gray-300 text-gray-600 hero-font text-base py-3 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all"
                            >
                                ✏️ EDIT
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
