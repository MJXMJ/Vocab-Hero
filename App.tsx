
import React, { useState, useEffect, useCallback } from 'react';
import { VocabWord, AppView, SessionStats, SavedTestPaper } from './types';
import { Flashcard } from './components/Flashcard';
import { Dictation } from './components/Dictation';

const SAMPLE_DICTATION = "The brave explorer climbed the steep mountain, carrying a heavy backpack filled with supplies. When she reached the summit, she could see the entire valley below, stretching out like a beautiful green carpet. The wind was cold but the view was absolutely magnificent.";

// Format a date string (ISO or Date object string) for display
function formatTestDate(isoDate: string | null, fallback: string): string {
  if (isoDate) {
    const d = new Date(isoDate + 'T12:00:00'); // noon to avoid TZ shift
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  // Fallback to createdAt
  const d = new Date(fallback);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

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

  // Stage 2 — Dictation
  const [dictationParagraph, setDictationParagraph] = useState<string | null>(null);
  const [dictationScore, setDictationScore] = useState<number | null>(null);

  // Home screen tabs
  const [homeTab, setHomeTab] = useState<'new' | 'history'>('new');

  // History / saved tests
  const [savedTests, setSavedTests] = useState<SavedTestPaper[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [savingToDB, setSavingToDB] = useState(false);

  // Load history when switching to history tab
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch('/api/tests');
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const data = await res.json();
      setSavedTests(data.tests || []);
    } catch (e: any) {
      setHistoryError(e.message || 'Could not load history');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Auto-load history on first render so count is always fresh
  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Save extracted data to DB after successful OCR
  const saveToDB = async (words: VocabWord[], dp: string | null, testDate: string | null) => {
    setSavingToDB(true);
    try {
      await fetch('/api/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testDate, words, dictationParagraph: dp }),
      });
      // Refresh history so the new entry appears immediately
      await loadHistory();
    } catch {
      // Non-critical — game continues even if save fails
    } finally {
      setSavingToDB(false);
    }
  };

  // Delete a saved test paper
  const deleteTest = async (id: number) => {
    if (!window.confirm('Delete this test paper? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/delete-test?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setSavedTests(prev => prev.filter(t => t.id !== id));
    } catch {
      alert('Could not delete — please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  // Load a saved test and start the game
  const practiceFromHistory = (test: SavedTestPaper) => {
    setVocabList(test.words);
    setDictationParagraph(test.dictationParagraph);
    setStats({ checked: 0, crossed: 0, total: test.words.length });
    setCurrentIndex(0);
    setDictationScore(null);
    setError(null);

    if (test.words.length > 0) {
      setView('game');
    } else if (test.dictationParagraph) {
      setView('stage2');
    }
  };

  // Compress image to max 1600px and convert to JPEG for smaller payload
  const compressImage = (file: File, maxDim: number = 1600): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
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

      const response = await fetch('/api/extract-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${response.status})`);
      }

      const data = await response.json();
      const { words, dictationParagraph: dp, testDate } = data;

      if (dp) setDictationParagraph(dp);

      if (words && words.length > 0) {
        setVocabList(words);
        setStats({ checked: 0, crossed: 0, total: words.length });
        setCurrentIndex(0);
        // Save to DB in the background (non-blocking)
        saveToDB(words, dp || null, testDate || null);
        setView('game');
      } else if (dp) {
        saveToDB([], dp, testDate || null);
        setView('stage2');
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
    } else {
      setStats(prev => ({ ...prev, crossed: prev.crossed + 1 }));
    }

    if (currentIndex < vocabList.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setView('stage1-results');
    }
  };

  const resetSession = () => {
    setVocabList([]);
    setCurrentIndex(0);
    setStats({ checked: 0, crossed: 0, total: 0 });
    setError(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setDictationParagraph(null);
    setDictationScore(null);
    setView('upload');
  };

  const skipToStage2 = () => {
    if (!dictationParagraph) {
      setDictationParagraph(SAMPLE_DICTATION);
    }
    setView('stage2');
  };

  const masteryPercent = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;
  const canGoToStage2 = dictationParagraph && masteryPercent >= 80;

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
            <div className="flex flex-col flex-1">

              {/* Tabs */}
              <div className="flex gap-2 mb-4 flex-shrink-0">
                <button
                  onClick={() => setHomeTab('new')}
                  className={`flex-1 py-2.5 rounded-2xl font-bold text-sm border-2 transition-all shadow-md ${
                    homeTab === 'new'
                      ? 'bg-gradient-to-r from-pink-400 to-yellow-400 text-white border-pink-400'
                      : 'bg-white/70 text-gray-500 border-gray-200 hover:border-pink-200'
                  }`}
                >
                  📸 NEW MISSION
                </button>
                <button
                  onClick={() => { setHomeTab('history'); loadHistory(); }}
                  className={`flex-1 py-2.5 rounded-2xl font-bold text-sm border-2 transition-all shadow-md relative ${
                    homeTab === 'history'
                      ? 'bg-gradient-to-r from-purple-400 to-blue-400 text-white border-purple-400'
                      : 'bg-white/70 text-gray-500 border-gray-200 hover:border-purple-200'
                  }`}
                >
                  📚 PAST MISSIONS
                  {savedTests.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-white text-xs font-black rounded-full w-5 h-5 flex items-center justify-center border-2 border-white shadow">
                      {savedTests.length}
                    </span>
                  )}
                </button>
              </div>

              {/* ---- NEW MISSION TAB ---- */}
              {homeTab === 'new' && (
                <div className="flex flex-col items-center text-center flex-1 justify-center">
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
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleFileSelect}
                          id="hero-camera"
                          className="hidden"
                        />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileSelect}
                          id="hero-upload"
                          className="hidden"
                        />

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

                  {/* Saving indicator */}
                  {savingToDB && (
                    <p className="mt-3 text-purple-500 font-bold text-xs animate-pulse">💾 Saving to your missions...</p>
                  )}
                </div>
              )}

              {/* ---- PAST MISSIONS TAB ---- */}
              {homeTab === 'history' && (
                <div className="flex flex-col flex-1">
                  <div className="flex items-center justify-between mb-3 flex-shrink-0">
                    <h2 className="hero-font text-2xl text-purple-500">PAST MISSIONS</h2>
                    <button
                      onClick={loadHistory}
                      disabled={historyLoading}
                      className="text-xs font-bold text-gray-400 hover:text-purple-500 transition-colors px-3 py-1 rounded-full border border-gray-200 hover:border-purple-200"
                    >
                      {historyLoading ? '...' : '↻ Refresh'}
                    </button>
                  </div>

                  {historyLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center space-y-3">
                        <div className="relative w-12 h-12 mx-auto">
                          <div className="absolute inset-0 border-4 border-purple-100 rounded-full"></div>
                          <div className="absolute inset-0 border-4 border-purple-400 rounded-full border-t-transparent animate-spin"></div>
                        </div>
                        <p className="text-purple-400 font-bold text-sm">Loading missions...</p>
                      </div>
                    </div>
                  ) : historyError ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 text-center max-w-sm">
                        <p className="text-4xl mb-2">⚠️</p>
                        <p className="text-red-600 font-bold text-sm mb-1">Could not load history</p>
                        <p className="text-red-400 text-xs mb-3">{historyError}</p>
                        <p className="text-gray-400 text-xs">Make sure your Vercel Postgres database is connected.</p>
                      </div>
                    </div>
                  ) : savedTests.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center space-y-3">
                        <span className="text-6xl block animate-bounce-gentle">📚</span>
                        <p className="hero-font text-xl text-gray-400">NO PAST MISSIONS YET!</p>
                        <p className="text-gray-400 text-sm font-medium">Upload your first test paper to save it here.</p>
                        <button
                          onClick={() => setHomeTab('new')}
                          className="mt-2 bg-gradient-to-r from-pink-400 to-yellow-400 text-white px-6 py-2.5 rounded-full hero-font text-lg shadow-lg hover:scale-105 transition-all border-b-4 border-pink-500"
                        >
                          📸 START NEW MISSION
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto space-y-3 pb-4">
                      {savedTests.map(test => (
                        <div
                          key={test.id}
                          className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-md border-2 border-purple-100 p-4 hover:border-purple-300 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {/* Date */}
                              <p className="hero-font text-lg text-purple-600 leading-tight">
                                📅 {formatTestDate(test.testDate, test.createdAt)}
                              </p>
                              {/* Badge row */}
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {test.words.length > 0 && (
                                  <span className="bg-yellow-100 text-yellow-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-yellow-200">
                                    ✏️ {test.words.length} words
                                  </span>
                                )}
                                {test.dictationParagraph && (
                                  <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-blue-200">
                                    🎧 Dictation
                                  </span>
                                )}
                                {!test.testDate && (
                                  <span className="bg-gray-100 text-gray-500 text-xs px-2.5 py-0.5 rounded-full border border-gray-200">
                                    Uploaded {new Date(test.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Delete button */}
                            <button
                              onClick={() => deleteTest(test.id)}
                              disabled={deletingId === test.id}
                              className="flex-shrink-0 w-8 h-8 bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 rounded-full flex items-center justify-center border border-red-200 hover:border-red-300 transition-all hover:scale-110 text-sm"
                              title="Delete this test paper"
                            >
                              {deletingId === test.id ? '...' : '🗑'}
                            </button>
                          </div>

                          {/* Practice button */}
                          <button
                            onClick={() => practiceFromHistory(test)}
                            className="mt-3 w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white py-2.5 rounded-xl hero-font text-lg shadow-md hover:scale-105 hover:shadow-lg transition-all border-b-4 border-purple-600"
                          >
                            🚀 PRACTICE AGAIN
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========== GAME VIEW (Stage 1) ========== */}
          {view === 'game' && vocabList[currentIndex] && (
            <div className="flex flex-col flex-1">
              <div className="mb-3 flex items-center justify-between bg-white/60 backdrop-blur-sm rounded-xl p-3 shadow-md border-2 border-blue-100 flex-shrink-0">
                <div>
                  <h2 className="hero-font text-lg text-pink-500">STAGE 1 — SPELLING</h2>
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

              {/* Skip to Stage 2 — only when dictation was detected */}
              {dictationParagraph && (
                <div className="flex-shrink-0 text-center py-2">
                  <button
                    onClick={skipToStage2}
                    className="bg-purple-100 text-purple-600 font-bold px-6 py-2 rounded-full border-2 border-purple-200 hover:bg-purple-200 hover:scale-105 transition-all text-sm shadow-md"
                  >
                    ⏭ SKIP TO STAGE 2 — DICTATION
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ========== STAGE 1 RESULTS ========== */}
          {view === 'stage1-results' && (
            <div className="text-center bg-white/90 backdrop-blur-sm rounded-[2rem] shadow-2xl p-8 sm:p-12 border-4 border-yellow-200 flex flex-col items-center justify-center flex-1">
              <span className="text-6xl sm:text-8xl mb-2 block animate-bounce-gentle">
                {canGoToStage2 ? '🎯' : '🏆'}
              </span>
              <h2 className="hero-font text-3xl sm:text-5xl text-yellow-500 mb-2" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.1)' }}>
                STAGE 1 COMPLETE!
              </h2>
              <p className="text-lg sm:text-xl text-pink-500 mb-2 font-bold">
                Score: {masteryPercent}% — {stats.checked}/{stats.total} mastered
              </p>

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

              {canGoToStage2 ? (
                <div className="space-y-3">
                  <div className="bg-purple-50 rounded-xl p-3 border border-purple-200 mb-2">
                    <p className="text-purple-700 text-sm font-bold">
                      🎧 Dictation section detected! Ready for the Final Challenge?
                    </p>
                  </div>
                  <button
                    onClick={() => setView('stage2')}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-8 py-4 rounded-full hero-font text-2xl shadow-xl hover:scale-105 transition-all border-b-4 border-purple-600 animate-pulse"
                  >
                    ✍️ STAGE 2: DICTATION →
                  </button>
                  <button
                    onClick={resetSession}
                    className="block mx-auto text-gray-400 text-xs font-bold underline hover:text-gray-600 mt-2"
                  >
                    Skip → New Mission
                  </button>
                </div>
              ) : dictationParagraph && masteryPercent < 80 ? (
                <div className="space-y-3">
                  <p className="text-orange-500 text-sm font-bold">
                    Need 80%+ to unlock Dictation! You got {masteryPercent}%.
                  </p>
                  <button
                    onClick={resetSession}
                    className="bg-gradient-to-r from-pink-400 via-yellow-400 to-blue-400 text-white px-8 py-4 rounded-full hero-font text-2xl shadow-xl hover:scale-105 transition-all border-b-4 border-pink-500"
                  >
                    🚀 TRY AGAIN
                  </button>
                </div>
              ) : (
                <button
                  onClick={resetSession}
                  className="bg-gradient-to-r from-pink-400 via-yellow-400 to-blue-400 text-white px-8 py-4 rounded-full hero-font text-2xl shadow-xl hover:scale-105 transition-all border-b-4 border-pink-500"
                >
                  🚀 NEW MISSION
                </button>
              )}
            </div>
          )}

          {/* ========== STAGE 2 — DICTATION ========== */}
          {view === 'stage2' && dictationParagraph && (
            <div className="flex flex-col flex-1 justify-center">
              <Dictation
                paragraph={dictationParagraph}
                onComplete={(score) => {
                  setDictationScore(score);
                  setView('mastery');
                }}
                onReplay={() => {
                  // Stay on stage2, Dictation handles internal reset
                }}
              />
            </div>
          )}

          {/* ========== MASTERY CELEBRATION ========== */}
          {view === 'mastery' && (
            <div className="text-center bg-white/90 backdrop-blur-sm rounded-[2rem] shadow-2xl p-8 sm:p-12 border-4 border-yellow-300 flex flex-col items-center justify-center flex-1 relative overflow-hidden">
              {/* Confetti effect */}
              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: 30 }).map((_, i) => (
                  <div
                    key={i}
                    className="confetti animate-confetti"
                    style={{
                      left: `${Math.random() * 100}%`,
                      top: `${Math.random() * 30}%`,
                      backgroundColor: ['#fbbf24', '#f472b6', '#60a5fa', '#34d399', '#a78bfa', '#fb923c'][i % 6],
                      animationDelay: `${Math.random() * 2}s`,
                      width: `${8 + Math.random() * 12}px`,
                      height: `${8 + Math.random() * 12}px`,
                    }}
                  />
                ))}
              </div>

              <div className="relative z-10">
                <div className="text-8xl mb-4 animate-bounce">🏆</div>
                <h2 className="hero-font text-4xl sm:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 mb-2">
                  VOCAB HERO MASTERY!
                </h2>
                <p className="text-xl text-gray-600 font-bold mb-2">
                  Dictation Score: {dictationScore}%
                </p>
                <p className="text-lg text-pink-500 mb-6 font-bold">
                  You've conquered both stages! You are a TRUE VOCAB HERO! 🌟
                </p>

                <div className="inline-block bg-gradient-to-br from-yellow-100 to-yellow-200 p-6 rounded-2xl border-4 border-yellow-400 shadow-2xl mb-6" style={{ animation: 'hero-glow 2s infinite' }}>
                  <div className="text-5xl mb-2">🥇</div>
                  <p className="hero-font text-xl text-yellow-700">MASTER BADGE</p>
                  <p className="text-yellow-600 text-xs font-bold">Dictation Mastery Achieved</p>
                </div>

                <br />
                <button
                  onClick={resetSession}
                  className="bg-gradient-to-r from-pink-400 via-yellow-400 to-blue-400 text-white px-8 py-4 rounded-full hero-font text-2xl shadow-xl hover:scale-105 transition-all border-b-4 border-pink-500"
                >
                  🚀 NEW MISSION
                </button>
              </div>
            </div>
          )}

          {/* ========== FINAL RESULTS (legacy fallback) ========== */}
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
