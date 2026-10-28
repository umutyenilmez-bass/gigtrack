# GigTrack AI Asistanı ve Eylem Hafızası (Audit Log) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GigTrack içerisine kullanıcının yaptığı tüm ekleme, silme, düzenleme ve takvim hareketlerini hafızaya alan bir denetim motoru (audit log) ile kullanıcının yerel Gemini API anahtarıyla çalışan akıllı bir yapay zeka asistanı eklemek.

**Architecture:** Modüler bir ayrım yapılır: `ai-logger.js` tüm kullanıcı mutasyonlarını (alan bazlı diff ile) yakalar ve `localStorage`'da saklar; `ai-assistant.js` güncel veri tabanı (gigs, dayNotes, finans özeti) ve eylem geçmişinden zengin bir sistem bağlamı derleyerek doğrudan Google Gemini 2.5 Flash REST API'siyle konuşur; `index.html` içerisine Umut OS standartlarında şık bir Header tetikleyicisi, AI Drawer paneli ve Ayarlar menüsü kartı entegre edilir.

**Tech Stack:** Vanilla JavaScript (ES6+), Node.js (test runner via `node:test`), Google Gemini REST API (`gemini-2.5-flash`), LocalStorage API, CSS3 (Umut OS dark aesthetic).

**Spec:** [docs/superpowers/specs/2026-10-28-gigtrack-ai-assistant-design.md](file:///c:/Users/umut/Desktop/gigtrack-main/gigtrack-main/docs/superpowers/specs/2026-10-28-gigtrack-ai-assistant-design.md)

## Global Constraints

- API anahtarı KESİNLİKLE hiçbir kod dosyasında, repoda veya GitHub'a giden dosyalarda bulunmayacak (`localStorage`'da saklanacak).
- Renkler ve tasarım Umut OS standartlarına uygun olacak (mat antrasit, aşırı sadelik, laf kalabalığı yok).
- Geriye dönük uyumluluk: Mevcut `gigs`, `dayNotes`, `cfosBridge` ve `firebase-sync` işleyişi asla bozulmayacak.
- Eylem günlüğü kapasitesi performansı korumak için son 200 işlem ile sınırlandırılacak (FIFO).
- Testler `node:test` ile harici kütüphane bağımlılığı olmadan çalıştırılabilir olacak.

## Review Focus

1. **Silinen Konser Hatırlama:** Konser silindikten sonra konser listesinde bulunamaz; eylem günlüğünden (`DELETE_GIG`) tüm alanlarının eksiksiz okunabildiğinin doğrulanması.
2. **Kısmi Düzenleme Diff Doğruluğu:** Bir konserin yalnızca ücreti veya sadece tarihi değiştiğinde, sadece değişen alanların `diff` dizisine yazıldığının ve eski/yeni değerlerin korunduğunun doğrulanması.
3. **Eksik API Anahtarı Durumu:** Kullanıcı henüz API anahtarı girmeden AI paneline soru sorduğunda uygulamanın çökmemesi, kibarca anahtar giriş formunu açması.
4. **Takvim Notları Değişimi:** Gün notu silindiğinde veya güncellendiğinde takvim gününün ve eski not içeriğinin kaydedilmesinin doğrulanması.
5. **Ağ Hatası / Geçersiz Anahtar (400/403/429):** Gemini API'den hata döndüğünde kullanıcıya anlaşılır hata mesajı gösterilmesi.

---

### Task 1: Eylem Hafızası ve Diff Motoru (`ai-logger.js`)

**Files:**
- Create: `ai-logger.js`
- Test: `tests/ai-logger.test.js`

**Interfaces:**
- Produces: `window.ActionLogger` (veya Node.js ortamında `module.exports`)
  - `ActionLogger.log(type: string, summary: string, details: object): object`
  - `ActionLogger.getHistory(limit?: number): Array<ActionLogEntry>`
  - `ActionLogger.calculateDiff(oldGig: object, newGig: object): Array<{field: string, from: any, to: any}>`
  - `ActionLogger.clear(): void`
  - `ActionLogger.setStorage(customStorage: object): void` (test izolasyonu için)

- [ ] **Step 1: Write the failing unit tests for `ActionLogger`**

Create `tests/ai-logger.test.js` testing:
- Action logging with timestamps and auto-generated IDs.
- FIFO queue limit (max 200 items).
- `calculateDiff` correctly identifying changes across fields (`artist`, `venue`, `fee`, `currency`, `date`, `time`, `notes`, `paid`).
- Clearing history.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai-logger.test.js`  
Expected: FAIL (Cannot find module `../ai-logger.js`)

- [ ] **Step 3: Implement `ai-logger.js`**

Implement `ActionLogger` supporting browser (`window.ActionLogger`) and Node environment.
Handle:
- `STORAGE_KEY = 'gigtrack_action_log'`
- `MAX_ENTRIES = 200`
- Timestamp formatting (`YYYY-MM-DD HH:mm:ss`)
- `calculateDiff(oldGig, newGig)` comparing fields and returning changed fields array.
- Safe serialization and error recovery if JSON is corrupted.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai-logger.test.js`  
Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add ai-logger.js tests/ai-logger.test.js
git commit -m "feat(ai): implement ActionLogger engine with diff calculation"
```

---

### Task 2: Veri Mutasyon Kancalarının Entegrasyonu (`index.html`)

**Files:**
- Modify: `index.html:1998-2005` (script import)
- Modify: `index.html:3881-3930` (`saveGig` add & edit hooks)
- Modify: `index.html:3933-3945` (`confirmDelete` delete hook)
- Modify: `index.html:3263-3280` (`togglePaidStatus` hook)
- Modify: `index.html:3185-3215` (`saveDayNote` & `deleteDayNote` hooks)
- Modify: `index.html:2186-2195` (`undo` hook)
- Test: `tests/mutation-hooks.test.js`

**Interfaces:**
- Consumes: `ActionLogger.log(...)`, `ActionLogger.calculateDiff(...)`
- Produces: Persistent logs populated automatically during application usage.

- [ ] **Step 1: Write test for mutation integration expectations**

Create `tests/mutation-hooks.test.js` verifying that simulating mutation workflows generates corresponding `ADD_GIG`, `EDIT_GIG`, `DELETE_GIG`, `TOGGLE_PAID`, and `SAVE_NOTE` events in the log with correct diffs.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/mutation-hooks.test.js`  
Expected: FAIL

- [ ] **Step 3: Hook `ActionLogger` into `index.html` mutation functions**

- Add `<script src="ai-logger.js"></script>` before the main script.
- In `saveGig()`:
  - If editing: calculate diff via `ActionLogger.calculateDiff(oldGig, data)`, if changes exist call `ActionLogger.log('EDIT_GIG', ...)`.
  - If new: call `ActionLogger.log('ADD_GIG', ...)`.
- In `confirmDelete()`:
  - Call `ActionLogger.log('DELETE_GIG', '... silindi', { gig })`.
- In `togglePaidStatus()`:
  - Call `ActionLogger.log('TOGGLE_PAID', '...', { id, artist, venue, date, paid })`.
- In `saveDayNote()` and `deleteDayNote()`:
  - Call `ActionLogger.log('SAVE_NOTE', ...)` and `ActionLogger.log('DELETE_NOTE', ...)`.
- In `undo()`:
  - Call `ActionLogger.log('UNDO', 'Son işlem geri alındı')`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/mutation-hooks.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add index.html tests/mutation-hooks.test.js
git commit -m "feat(ai): hook ActionLogger into gig and calendar mutations"
```

---

### Task 3: Bağlam Derleyici ve Gemini REST İstemcisi (`ai-assistant.js`)

**Files:**
- Create: `ai-assistant.js`
- Test: `tests/ai-assistant.test.js`

**Interfaces:**
- Consumes: `ActionLogger.getHistory(...)`, `localStorage.getItem('gigtrack_gemini_api_key')`
- Produces: `window.AiAssistant` (or `module.exports`)
  - `AiAssistant.getApiKey(): string`
  - `AiAssistant.setApiKey(key: string): void`
  - `AiAssistant.removeApiKey(): void`
  - `AiAssistant.buildContext(state: { gigs, dayNotes, activeYear }): string`
  - `AiAssistant.ask(userPrompt: string, history: Array, state: object): Promise<string>`

- [ ] **Step 1: Write unit tests for context builder and payload generator**

Create `tests/ai-assistant.test.js`:
- Test `buildContext()` includes current date, financial counts, gigs list, day notes, and action history.
- Test Gemini API request payload format matching Gemini 2.5 Flash API specifications (`contents`, `systemInstruction`, `generationConfig`).
- Test error translation (invalid API key, empty key, network failure).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai-assistant.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement `ai-assistant.js`**

Implement:
- `STORAGE_KEY_API_KEY = 'gigtrack_gemini_api_key'`
- `buildContext({ gigs, dayNotes, activeYear })` generating comprehensive markdown context.
- `ask(userPrompt, history, state)`:
  - Validates API key exists.
  - Constructs REST call to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`.
  - Handles response and error codes cleanly (400, 403, 429).
  - Returns assistant answer string.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai-assistant.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-assistant.js tests/ai-assistant.test.js
git commit -m "feat(ai): implement context builder and Gemini REST API client"
```

---

### Task 4: AI Drawer Arayüzü ve Umut OS Tasarımı (`index.html`)

**Files:**
- Modify: `index.html` (Header, Drawer HTML, CSS styles, UI event handlers)
- Test: `tests/ui-structure.test.js`

**Interfaces:**
- Consumes: `AiAssistant`, `ActionLogger`
- Produces:
  - Header button `#btnAiAssistant` with `✨` icon.
  - Drawer container `#aiDrawerOverlay` & `#aiDrawer`.
  - Functions: `openAiDrawer()`, `closeAiDrawer()`, `sendAiMessage()`, `setAiApiKeyFromUI()`, `clearAiChat()`.

- [ ] **Step 1: Write structure tests for AI UI elements**

Create `tests/ui-structure.test.js` verifying `index.html` includes:
- AI button in header with id `btnAiAssistant`.
- Drawer overlay `#aiDrawerOverlay` with role and closing handlers.
- Chat input `#aiPromptInput` and send button.
- Quick question chips container `#aiQuickChips`.
- API key modal/prompt elements.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ui-structure.test.js`  
Expected: FAIL

- [ ] **Step 3: Add CSS and HTML for AI Drawer in `index.html`**

- Add header button next to calculator/settings.
- Add `#aiDrawerOverlay` and `#aiDrawer` modal with Umut OS dark aesthetic (`#1A1A1C`, `#0F0F10`, `#FFB300`).
- Add message feed with markdown renderer (bold, code, lists, linebreaks).
- Add Quick Chips:
  - *"Dün ne sildim?"*
  - *"Son düzenlemelerim"*
  - *"Bu ayki durumum"*
  - *"Bekleyen ödemelerim"*
- Add API key input view when key is empty.
- Add JS functions: `openAiDrawer`, `closeAiDrawer`, `sendAiMessage`, `handleAiChipClick`, `clearAiChat`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ui-structure.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add index.html tests/ui-structure.test.js
git commit -m "feat(ai): add AI Assistant drawer and Umut OS interface to index.html"
```

---

### Task 5: Ayarlar Entegrasyonu ve Uçtan Uca Doğrulama

**Files:**
- Modify: `index.html:4379-4500` (`openSettings()` body generator)
- Modify: `.gitignore` (verify no API key or env files can be committed)
- Test: `tests/e2e-verification.test.js`

**Interfaces:**
- Settings card for Gemini API Key (Enter key, Save, Test, Clear).

- [ ] **Step 1: Write integration test for Settings and E2E workflow**

Create `tests/e2e-verification.test.js` testing:
- Setting Gemini API key in settings updates `localStorage`.
- Gigs mutation + dayNotes mutation + ActionLogger + Context compilation produces complete prompt with full memory.
- `.gitignore` verification ensuring local keys or configs are ignored.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/e2e-verification.test.js`  
Expected: FAIL

- [ ] **Step 3: Integrate Gemini API Key section into `openSettings()` in `index.html`**

- In `openSettings()`, render a clean "Yapay Zeka (Gemini API)" card.
- Provide input for API key (type password with show/hide toggle).
- Add "Kaydet", "Test Et" (makes a lightweight ping to Gemini), and "Sil" buttons.
- Ensure `.gitignore` explicitly includes `.env*` or any key files just in case.

- [ ] **Step 4: Run all test suites**

Run: `node --test tests/*.test.js`  
Expected: ALL PASS

- [ ] **Step 5: Commit and Final Push**

```bash
git add .
git commit -m "feat(ai): complete Gemini API settings integration and end-to-end verification"
```
