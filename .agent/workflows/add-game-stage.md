---
description: How to implement a new game stage for Vocab Hero
---

# Adding a New Game Stage

## Prerequisites
- Create a feature branch: `git checkout -b feature/<stage-name>`

## Steps

### 1. Update Types
- Edit `types.ts` to add new `AppView` states (e.g. `'stage3'`, `'stage3-results'`)
- Add any new interfaces needed for the stage's state management

### 2. Update OCR (if needed)
- Edit `api/extract-words.ts` to detect new content from images
- Update the Gemini prompt to recognize new section headers
- Add new fields to the JSON response schema

### 3. Create the Stage Component
- Create `components/<StageName>.tsx`
- Implement the game loop (intro → playing → results)
- Use `speakText()` with `rate` parameter for TTS (0.6 for slow dictation, 1.0 for normal)
- Voice preference: female British English (`en-GB`, Kate/Serena/Martha)
- Call `onComplete(score)` only when user explicitly claims reward or timer expires

### 4. Integrate in App.tsx
- Import and render the new component in the correct view
- Add unlock conditions based on previous stage score
- Wire up the `onComplete` callback to transition to the next view
- Add a skip button (conditional on content detection) if needed

### 5. Deploy & Test
// turbo
```bash
npx vercel deploy --prod --yes
```

### 6. Manual Testing Checklist
- [ ] Upload image with new content section → detected by OCR
- [ ] Previous stage → unlock condition → new stage accessible
- [ ] Skip button appears only when content detected
- [ ] Game loop works (all phases)
- [ ] TTS plays at correct speed with British accent
- [ ] Results show before mastery/rewards
- [ ] Score ≥ threshold → reward flow
- [ ] Score < threshold → retry only

### 7. Merge
```bash
git add -A && git commit -m "feat: Stage N - <description>"
git checkout main && git merge feature/<stage-name>
git push origin main
```
