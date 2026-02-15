
import React, { useState } from 'react';
import { VocabWord, AppView, SessionStats } from './types';
import { Flashcard } from './components/Flashcard';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('upload');
  const [vocabList, setVocabList] = useState<VocabWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState<SessionStats>({ checked: 0, crossed: 0, total: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload/Camera flow state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Compress image to max 1600px and convert to JPEG for smaller payload
  const compressImage = (file: File, maxDim: number = 1600): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        // Scale down if needed
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType: 'image/jpeg' });
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
  };

  const handleExtractWords = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setError(null);

    try {
      const { base64, mimeType } = await compressImage(selectedFile);

      // Call the serverless API (API key stays on the server)
      const response = await fetch('/api/extract-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          throw new Error('QUOTA_EXHAUSTED');
        }
        throw new Error(errData.error || `Server error (${response.status})`);
      }

      const { words } = await response.json();

      if (words && words.length > 0) {
        setVocabList(words);
        setStats({ checked: 0, crossed: 0, total: words.length });
        setCurrentIndex(0);
        setView('game');
      } else {
        setError("No super-words found! Try a clearer photo with more text. 🔍");
      }
    } catch (innerErr: any) {
      console.error('OCR error:', innerErr);
      setError(innerErr.message || "Couldn't read that image. Try a clearer photo! 📸");
    } finally {
      setIsProcessing(false);
    }
  };

  const clearUpload = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
  };

  const handleDecision = (correct: boolean) => {
    if (correct) {
      setStats(prev => ({ ...prev, checked: prev.checked + 1 }));
      if (currentIndex < vocabList.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        setView('results');
      }
    } else {
      setStats(prev => ({ ...prev, crossed: prev.crossed + 1 }));
    }
  };

  const resetSession = () => {
    setVocabList([]);
    setCurrentIndex(0);
    setStats({ checked: 0, crossed: 0, total: 0 });
    setError(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setView('upload');
  };

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden relative">
      {/* Animated Background Bubbles */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0">
        <div className="bg-bubble bg-bubble-1"></div>
        <div className="bg-bubble bg-bubble-2"></div>
        <div className="bg-bubble bg-bubble-3"></div>
        <div className="bg-bubble bg-bubble-4"></div>
        <div className="bg-bubble bg-bubble-5"></div>
      </div>

      {/* Header */}
      <header className="bg-gradient-to-r from-pink-400 via-yellow-300 to-blue-400 shadow-lg py-3 px-4 z-40 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-white p-1.5 rounded-lg shadow-lg transform -rotate-3 animate-wiggle">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="hero-font text-3xl sm:text-5xl text-white tracking-wider drop-shadow-lg" style={{ textShadow: '3px 3px 0px rgba(0,0,0,0.15)' }}>VOCAB HERO</h1>
          </div>
          {view !== 'upload' && (
            <button
              onClick={resetSession}
              className="bg-white text-pink-500 font-bold px-4 py-1.5 rounded-full border-2 border-pink-200 hover:bg-pink-50 hover:scale-105 transition-all text-xs shadow-md"
            >
              ✨ NEW
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 h-full flex flex-col">

          {/* ========== UPLOAD VIEW ========== */}
          {view === 'upload' && (
            <div className="flex flex-col items-center text-center justify-center flex-1">
              <div className="mb-3">
                <span className="text-5xl mb-1 block animate-bounce-gentle">📸</span>
                <h2 className="hero-font text-3xl sm:text-5xl text-pink-500 mb-1 drop-shadow-sm" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.1)' }}>START YOUR HERO MISSION</h2>
                <p className="text-base sm:text-xl text-gray-600 max-w-md mx-auto leading-snug font-medium">
                  Snap or upload a photo of your book to find <span className="text-yellow-500 font-black">SUPER WORDS</span>! 🦸‍♂️
                </p>
              </div>

              <div className="w-full max-w-md bg-white/80 backdrop-blur-sm p-5 sm:p-8 rounded-[2rem] shadow-2xl border-4 border-dashed border-pink-300 hover:border-yellow-400 transition-all upload-glow relative">
                {isProcessing ? (
                  <div className="py-6 space-y-4">
                    <div className="relative w-16 h-16 mx-auto">
                      <div className="absolute inset-0 border-4 border-pink-100 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-yellow-400 rounded-full border-t-transparent animate-spin"></div>
                      <span className="absolute inset-0 flex items-center justify-center text-2xl">🔍</span>
                    </div>
                    <p className="hero-font text-xl text-pink-500 animate-pulse tracking-widest">READING YOUR BOOK...</p>
                    <p className="text-gray-400 text-xs">AI is scanning for super words!</p>
                  </div>
                ) : previewUrl ? (
                  <div className="space-y-3">
                    <div className="relative inline-block">
                      <img
                        src={previewUrl}
                        alt="Uploaded book page"
                        className="mx-auto rounded-xl border-4 border-yellow-200 shadow-md"
                        style={{ maxHeight: '120px', objectFit: 'cover' }}
                      />
                      <button
                        onClick={clearUpload}
                        className="absolute -top-2 -right-2 bg-red-400 text-white w-7 h-7 rounded-full flex items-center justify-center shadow-lg hover:bg-red-500 hover:scale-110 transition-all text-sm font-bold"
                      >
                        ×
                      </button>
                    </div>
                    <p className="text-gray-500 font-bold text-xs truncate max-w-[200px] mx-auto">
                      📄 {selectedFile?.name}
                    </p>
                    <button
                      onClick={handleExtractWords}
                      className="bg-gradient-to-r from-yellow-400 via-pink-400 to-blue-400 text-white px-8 py-3 rounded-full hero-font text-2xl shadow-xl hover:scale-105 hover:shadow-2xl transition-all inline-block border-b-4 border-pink-500"
                    >
                      🚀 FIND SUPER WORDS!
                    </button>
                    {error && <p className="mt-2 text-red-500 font-bold bg-red-50 p-3 rounded-2xl border-2 border-red-200 text-sm">{error}</p>}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Hidden camera input */}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileSelect}
                      id="hero-camera"
                      className="hidden"
                    />
                    {/* Hidden file upload input */}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      id="hero-upload"
                      className="hidden"
                    />

                    {/* Take Picture — primary */}
                    <label htmlFor="hero-camera" className="cursor-pointer block">
                      <div className="bg-gradient-to-r from-blue-400 to-pink-400 text-white px-8 py-3 rounded-full hero-font text-2xl shadow-xl hover:scale-105 transition-all inline-block border-b-4 border-blue-500 w-full text-center">
                        📷 TAKE PICTURE
                      </div>
                    </label>

                    <div className="flex items-center gap-3 my-1">
                      <div className="flex-1 h-px bg-gray-200"></div>
                      <span className="text-gray-400 text-xs font-bold">OR</span>
                      <div className="flex-1 h-px bg-gray-200"></div>
                    </div>

                    {/* Upload — secondary */}
                    <label htmlFor="hero-upload" className="cursor-pointer block">
                      <div className="bg-white text-pink-500 px-6 py-2.5 rounded-full hero-font text-xl shadow-md hover:scale-105 transition-all inline-block border-4 border-pink-200 hover:border-pink-300 w-full text-center">
                        📁 UPLOAD IMAGE
                      </div>
                    </label>

                    <p className="text-gray-400 text-xs font-bold">Point at any book page!</p>
                    {error && <p className="mt-3 text-red-500 font-bold bg-red-50 p-3 rounded-lg border-2 border-red-100 text-sm">{error}</p>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========== GAME VIEW ========== */}
          {view === 'game' && vocabList[currentIndex] && (
            <div className="flex flex-col flex-1">
              <div className="mb-3 flex items-center justify-between bg-white/60 backdrop-blur-sm rounded-xl p-3 shadow-md border-2 border-blue-100 flex-shrink-0">
                <div>
                  <h2 className="hero-font text-lg text-pink-500">CURRENT TARGET</h2>
                  <p className="text-gray-500 font-bold text-xs">WORD {currentIndex + 1} OF {vocabList.length}</p>
                </div>
                <div className="text-right">
                  <p className="hero-font text-lg text-yellow-500">⭐ {stats.checked}</p>
                  <div className="w-32 h-3 bg-pink-100 rounded-full mt-1 overflow-hidden border border-pink-200">
                    <div
                      className="h-full bg-gradient-to-r from-yellow-400 to-pink-400 transition-all duration-500 rounded-full"
                      style={{ width: `${((currentIndex) / vocabList.length) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center">
                <Flashcard
                  key={vocabList[currentIndex].id}
                  card={vocabList[currentIndex]}
                  onCheck={() => handleDecision(true)}
                  onCross={() => handleDecision(false)}
                />
              </div>
            </div>
          )}

          {/* ========== RESULTS VIEW ========== */}
          {view === 'results' && (
            <div className="text-center bg-white/90 backdrop-blur-sm rounded-[2rem] shadow-2xl p-8 sm:p-12 border-4 border-yellow-200 flex flex-col items-center justify-center flex-1">
              <span className="text-6xl sm:text-8xl mb-2 block animate-bounce-gentle">🏆</span>
              <h2 className="hero-font text-4xl sm:text-6xl text-yellow-500 mb-2" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.1)' }}>MISSION COMPLETE!</h2>
              <p className="text-xl sm:text-2xl text-pink-500 mb-6 font-bold">You are a True Vocab Hero! 🌟</p>

              <div className="grid grid-cols-2 gap-4 sm:gap-8 mb-6 w-full max-w-xs">
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-2xl border-4 border-green-200 shadow-md">
                  <p className="hero-font text-3xl text-green-500">✅ {stats.checked}</p>
                  <p className="text-green-700 font-bold uppercase text-xs">MASTERED</p>
                </div>
                <div className="bg-gradient-to-br from-pink-50 to-pink-100 p-4 rounded-2xl border-4 border-pink-200 shadow-md">
                  <p className="hero-font text-3xl text-pink-500">💪 {stats.crossed}</p>
                  <p className="text-pink-700 font-bold uppercase text-xs">ATTEMPTS</p>
                </div>
              </div>

              <button
                onClick={resetSession}
                className="bg-gradient-to-r from-pink-400 via-yellow-400 to-blue-400 text-white px-8 py-4 rounded-full hero-font text-2xl sm:text-3xl shadow-xl hover:scale-105 transition-all border-b-4 border-pink-500"
              >
                🚀 NEW MISSION
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default App;
