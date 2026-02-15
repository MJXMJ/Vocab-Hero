# 🗺️ Vocab Hero — Product Roadmap

## ✅ Completed

### Stage 1 — Spelling Flashcards (v1.0)
- Upload photo of textbook / worksheet → OCR via Gemini API
- Flashcard game with check ✅ / cross ❌ swipe interface
- Word pronunciation via Web Speech API (British English female voice)
- Animated card flip with definition, example sentence, difficulty badge
- Progress bar + score tracking

### Stage 2 — Dictation Challenge (v1.1)
- OCR detects "Dictation" keyword and extracts paragraph verbatim
- Sentence-boundary-aware chunking (2-7 words per phrase)
- TTS reads each chunk 3× at 0.6× speed with spoken punctuation
- Timed writing window (3s base + 0.5s per word)
- Pause / Resume controls during playback
- LCS-based word-level diff with color-coded results
- ≥95% accuracy: "Claim Reward" button + 30s auto-redirect → Mastery Badge
- <95% accuracy: Retry option
- Skip Stage 1 button (when dictation section detected)

---

## 🚧 Planned

### Stage 3 — Sentence Building
- Scrambled words from the dictation paragraph
- Drag-and-drop to rebuild correct sentences
- Time-attack mode with combo streaks

### AI Tutor Improvements
- Context-aware hints based on error patterns
- Adaptive difficulty: repeat harder words more often
- Voice chat with the AI tutor

### Gamification
- Persistent leaderboard across sessions
- Achievement badges beyond mastery (streak, speed, accuracy)
- Daily challenge mode with unique word sets
- Parent dashboard with progress reports

### Platform
- PWA support for offline usage
- Multi-language support (French, Spanish, Mandarin)
- Classroom mode: teacher uploads words for all students
- Gemini TTS upgrade for higher-quality dictation audio
