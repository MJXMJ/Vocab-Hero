
import React, { useState, useEffect, useRef } from 'react';
import { VocabWord, ImageSize } from '../types';
import { playHighQualityTTS, generateHeroIllustration, isQuotaExceeded } from '../services/geminiService';

interface FlashcardProps {
  card: VocabWord;
  onCheck: () => void;
  onCross: () => void;
}

// Ensure voices are loaded (Chrome lazy-loads them)
let voicesLoaded = false;
let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

function getVoices(): Promise<SpeechSynthesisVoice[]> {
  if (voicesLoaded) {
    return Promise.resolve(window.speechSynthesis.getVoices());
  }
  if (!voicesPromise) {
    voicesPromise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        voicesLoaded = true;
        resolve(voices);
        return;
      }
      window.speechSynthesis.onvoiceschanged = () => {
        voicesLoaded = true;
        resolve(window.speechSynthesis.getVoices());
      };
      setTimeout(() => {
        voicesLoaded = true;
        resolve(window.speechSynthesis.getVoices());
      }, 1000);
    });
  }
  return voicesPromise;
}

export const Flashcard: React.FC<FlashcardProps> = ({ card, onCheck, onCross }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [illustration, setIllustration] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageSize, setImageSize] = useState<ImageSize>(ImageSize.SIZE_1K);
  const [userSpelling, setUserSpelling] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Timer & Spelling States
  const [timeLeft, setTimeLeft] = useState(20);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const timerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const masteredRef = useRef<HTMLButtonElement | null>(null);

  const playBeep = (freq: number, duration: number) => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  };

  const playSuccessSound = () => {
    playBeep(523.25, 0.2);
    setTimeout(() => playBeep(659.25, 0.2), 100);
    setTimeout(() => playBeep(783.99, 0.4), 200);
  };

  const speakWithWebSpeechAPI = async (text: string) => {
    if (!('speechSynthesis' in window)) {
      playHighQualityTTS(text);
      return;
    }

    window.speechSynthesis.cancel();
    await new Promise(r => setTimeout(r, 100));

    const voices = await getVoices();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    utterance.pitch = 1.1;
    utterance.volume = 1.0;

    const preferred = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Google') || v.name.includes('Natural')));
    const fallbackEn = voices.find(v => v.lang.startsWith('en-'));
    if (preferred) {
      utterance.voice = preferred;
    } else if (fallbackEn) {
      utterance.voice = fallbackEn;
    }

    setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // Auto-focus the input field after speaking
      setTimeout(() => inputRef.current?.focus(), 100);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    };

    window.speechSynthesis.speak(utterance);
  };

  const handlePronounce = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    speakWithWebSpeechAPI(card.word);
    if (!isTimerActive && timeLeft === 20) {
      setIsTimerActive(true);
    }
  };

  // Keyboard-triggered speak (no event object)
  const handlePronounceKeyboard = () => {
    speakWithWebSpeechAPI(card.word);
    if (!isTimerActive && timeLeft === 20) {
      setIsTimerActive(true);
    }
  };

  const handleGenerateIllustration = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setErrorMsg(null);
    if (!(window as any).aistudio) return;

    if (!(await (window as any).aistudio.hasSelectedApiKey())) {
      await (window as any).aistudio.openSelectKey();
      return;
    }

    setLoadingImage(true);
    try {
      const url = await generateHeroIllustration(card.word, imageSize);
      setIllustration(url);
    } catch (err: any) {
      console.error(err);
      if (err.message === "QUOTA_EXHAUSTED" || isQuotaExceeded(err)) {
        setErrorMsg("Quota reached! Try later.");
        await (window as any).aistudio.openSelectKey();
      } else if (err.message.includes("Requested entity was not found")) {
        await (window as any).aistudio.openSelectKey();
      } else {
        setErrorMsg("Art failed. Try again!");
      }
    } finally {
      setLoadingImage(false);
    }
  };

  useEffect(() => {
    if (isTimerActive && timeLeft > 0 && !isFlipped) {
      timerRef.current = window.setInterval(() => {
        setTimeLeft(t => {
          const next = t - 1;
          if (next <= 3 && next > 0) playBeep(440, 0.1);
          if (next === 0) {
            playBeep(220, 0.3);
            setIsTimerActive(false);
          }
          return next;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isTimerActive, timeLeft, isFlipped]);

  const handleReveal = () => {
    if (!isFlipped) {
      const isMatch = userSpelling.toLowerCase().trim() === card.word.toLowerCase().trim();
      setIsCorrect(isMatch);
      setIsTimerActive(false);
      setIsFlipped(true);
      if (isMatch) {
        setShowConfetti(true);
        playSuccessSound();
        setTimeout(() => setShowConfetti(false), 3000);
      }
      // Auto-focus the mastered button after flip
      setTimeout(() => masteredRef.current?.focus(), 300);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleReveal();
    }
  };

  // Global keyboard handler for spacebar (speak) and enter (when flipped, mastered)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Spacebar: speak the word (only when not typing in input)
      if (e.code === 'Space' && !isFlipped && document.activeElement !== inputRef.current) {
        e.preventDefault();
        handlePronounceKeyboard();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isFlipped, isTimerActive, timeLeft, card.word]);

  const resetLocalCardState = () => {
    setIsFlipped(false);
    setUserSpelling('');
    setTimeLeft(20);
    setIsTimerActive(false);
    setIsCorrect(null);
    setShowConfetti(false);
    setErrorMsg(null);
    setIsSpeaking(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleTryAgain = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCross();
    resetLocalCardState();
  };

  // Handle mastered button via keyboard (Enter when focused)
  const handleMasteredKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCheck();
    }
  };

  useEffect(() => {
    resetLocalCardState();
    setIllustration(null);
  }, [card.id]);

  const confettiParticles = Array.from({ length: 20 });
  const confettiColors = ['#fbbf24', '#f472b6', '#60a5fa', '#34d399', '#a78bfa', '#fb923c'];

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-sm mx-auto relative">
      {/* Confetti Burst */}
      {showConfetti && confettiParticles.map((_, i) => (
        <div
          key={i}
          className={`confetti animate-confetti ${i % 3 === 0 ? 'confetti-star' : ''}`}
          style={{
            left: `${50 + (Math.random() * 60 - 30)}%`,
            top: `${40 + (Math.random() * 20 - 10)}%`,
            backgroundColor: confettiColors[Math.floor(Math.random() * confettiColors.length)],
            animationDelay: `${Math.random() * 0.5}s`,
            width: `${8 + Math.random() * 10}px`,
            height: `${8 + Math.random() * 10}px`,
          }}
        />
      ))}

      {/* Card area — responsive height */}
      <div className="perspective-1000 w-full" style={{ height: 'min(380px, 52vh)' }}>
        <div className={`relative w-full h-full flip-card-inner ${isFlipped ? 'flip-card-flipped' : ''}`}>

          {/* === FRONT — Spelling Challenge === */}
          <div
            className={`flip-card-front bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 rounded-2xl shadow-2xl flex flex-col items-center justify-between p-5 sm:p-8 border-4 sm:border-8 border-white overflow-hidden ${!isFlipped ? 'cursor-pointer group' : ''}`}
            onClick={() => !isFlipped && handleReveal()}
          >
            <div className="text-center z-10">
              <p className="text-pink-200 font-bold uppercase text-[10px] tracking-widest mb-0.5">🎯 Mission Protocol</p>
              <h2 className="hero-font text-2xl sm:text-3xl text-white">SPELLING CHALLENGE</h2>
            </div>

            <div className="flex flex-col items-center gap-2 w-full z-10">
              <button
                onClick={handlePronounce}
                className={`w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-transform ${isSpeaking ? 'ring-4 ring-yellow-400 animate-pulse' : isTimerActive ? 'ring-4 ring-yellow-400' : ''}`}
                title="Hear Word (or press Spacebar)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-8 w-8 sm:h-10 sm:w-10 ${isSpeaking ? 'text-yellow-500' : isTimerActive ? 'text-yellow-500' : 'text-pink-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.5 8.8L10.2 5.1a.7.7 0 011.2.5v12.8a.7.7 0 01-1.2.5L6.5 15.2H4a1 1 0 01-1-1v-4.4a1 1 0 011-1h2.5z" />
                </svg>
              </button>
              <p className="text-white hero-font text-base sm:text-lg tracking-widest">
                {isSpeaking ? '🔊 SPEAKING...' : isTimerActive ? `⏱ ${timeLeft}s` : '🔊 SPACE TO HEAR'}
              </p>
            </div>

            <div className="w-full space-y-2 z-10">
              <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden border border-white/30">
                <div
                  className={`h-full transition-all duration-1000 rounded-full ${timeLeft <= 5 ? 'bg-red-400' : 'bg-yellow-400'}`}
                  style={{ width: `${(timeLeft / 20) * 100}%` }}
                ></div>
              </div>

              <input
                ref={inputRef}
                type="text"
                placeholder={isTimerActive || timeLeft < 20 ? "Type the word... ✍️" : "Press SPACE to hear! 👆"}
                value={userSpelling}
                autoComplete="off"
                disabled={timeLeft === 0 || isFlipped}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={handleKeyDown}
                onChange={(e) => setUserSpelling(e.target.value)}
                className={`w-full bg-white/20 border-2 rounded-xl px-4 py-2.5 text-white text-center font-bold text-sm focus:outline-none transition-all placeholder-white/50 backdrop-blur-sm ${isTimerActive ? 'border-yellow-400 ring-2 ring-yellow-400/30' : 'border-white/40'}`}
              />
              <p className="text-white/70 font-bold uppercase text-[10px] text-center tracking-widest group-hover:text-white">
                {timeLeft === 0 ? "⏰ TAP TO REVEAL!" : "ENTER TO CHECK ✨"}
              </p>
            </div>

            <div className="absolute top-[-50px] right-[-50px] w-40 h-40 bg-white/10 rounded-full blur-xl"></div>
          </div>

          {/* === BACK — Word Reveal === */}
          <div className={`flip-card-back bg-white rounded-2xl shadow-xl flex flex-col items-center p-4 sm:p-6 border-4 sm:border-8 overflow-y-auto transition-all ${isCorrect ? 'border-green-400 hero-success-glow' : 'border-pink-200'}`}>
            <div className="flex justify-between w-full mb-2">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${card.difficulty === 'Heroic' ? 'bg-yellow-100 text-yellow-700' :
                card.difficulty === 'Legendary' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                }`}>
                {card.difficulty === 'Heroic' ? '⭐' : card.difficulty === 'Legendary' ? '🌟' : '💎'} {card.difficulty}
              </span>
              {/* Small inline speaker — does NOT overlap */}
              <button
                onClick={handlePronounce}
                className="p-1.5 bg-pink-50 rounded-full hover:bg-pink-100 transition-colors hover:scale-110"
                title="Hear Word Again"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.5 8.8L10.2 5.1a.7.7 0 011.2.5v12.8a.7.7 0 01-1.2.5L6.5 15.2H4a1 1 0 01-1-1v-4.4a1 1 0 011-1h2.5z" />
                </svg>
              </button>
            </div>

            <div className="text-center mb-2">
              <h1 className="hero-font text-3xl sm:text-4xl text-pink-500 leading-tight tracking-wide">{card.word}</h1>
              {userSpelling && (
                <div className="mt-1 flex items-center justify-center gap-1.5 bg-gray-50 px-2 py-0.5 rounded-full text-sm">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">You:</span>
                  <span className={`font-mono font-bold ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                    {userSpelling}
                  </span>
                  <span>{isCorrect ? '✅' : '❌'}</span>
                </div>
              )}
            </div>

            {illustration ? (
              <img src={illustration} alt={card.word} className="w-28 h-28 rounded-2xl mb-2 object-cover border-4 border-pink-100 shadow-md" />
            ) : (
              <div className="flex items-center gap-2 mb-2">
                <select
                  onClick={(e) => e.stopPropagation()}
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value as ImageSize)}
                  className="text-[10px] border-2 border-pink-200 rounded-full px-1.5 py-0.5 bg-white shadow-sm"
                >
                  <option value={ImageSize.SIZE_1K}>1K</option>
                  <option value={ImageSize.SIZE_2K}>2K</option>
                  <option value={ImageSize.SIZE_4K}>4K</option>
                </select>
                <button
                  onClick={handleGenerateIllustration}
                  disabled={loadingImage}
                  className="text-[10px] font-bold bg-gradient-to-r from-pink-400 to-purple-500 text-white px-3 py-1 rounded-full hover:scale-105 transition-all shadow-md active:scale-95 disabled:from-gray-300 disabled:to-gray-400"
                >
                  {loadingImage ? '🎨 Drawing...' : '🎨 AI Art'}
                </button>
                {errorMsg && <p className="text-[8px] text-red-500 font-bold max-w-[100px]">{errorMsg}</p>}
              </div>
            )}

            <div className="text-center w-full bg-gradient-to-br from-blue-50 to-pink-50 rounded-xl p-3 border border-blue-100">
              <p className="text-gray-700 font-bold text-sm leading-snug">"{card.definition}"</p>
              <p className="text-pink-500 italic text-xs font-medium mt-1">📝 {card.example}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons after flip */}
      {isFlipped && (
        <div className="flex gap-3 w-full">
          <button
            onClick={handleTryAgain}
            className="flex-1 bg-white border-4 border-pink-300 text-pink-500 rounded-xl py-3 flex flex-col items-center justify-center hover:bg-pink-50 transition-all shadow-lg active:scale-95 hover:scale-105 group"
          >
            <span className="text-xl">🔄</span>
            <span className="hero-font text-base">TRY AGAIN</span>
          </button>
          <button
            ref={masteredRef}
            onClick={onCheck}
            onKeyDown={handleMasteredKeyDown}
            className={`flex-1 border-4 border-white text-white rounded-xl py-3 flex flex-col items-center justify-center shadow-lg transition-all active:scale-95 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-yellow-300 ${isCorrect ? 'bg-gradient-to-r from-green-400 to-green-500 animate-pulse' : 'bg-gradient-to-r from-blue-400 to-pink-400'}`}
          >
            <span className="text-xl">{isCorrect ? '🎉' : '👍'}</span>
            <span className="hero-font text-base">MASTERED!</span>
            <span className="text-[9px] text-white/70 font-bold mt-0.5">ENTER ↵</span>
          </button>
        </div>
      )}

      {/* Keyboard hint */}
      {!isFlipped && (
        <p className="text-gray-400 text-[10px] font-bold text-center tracking-wider">
          ⌨️ SPACE = hear · TYPE = spell · ENTER = check
        </p>
      )}
    </div>
  );
};
