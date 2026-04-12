# ARCHITECTURE

## Backend

Responsibilities:

- level generation
- progress storage
- result validation
- session management

## Frontend

Contains:

- level engine
- input system
- audio system
- UI rendering

Important rule:

During level execution there must be 0 server requests.

---

## Input System (State-Based)

### Problem
Previously, input listeners were global and always active, causing UI interactions (like clicking dev buttons) to trigger game fail conditions.

### Solution
Input listeners are now **state-controlled** and only active when `phase === "playing"`.

### Architecture

```
InputSystem (manages listeners independently)
  ├─ attachListeners() — attach input event handlers
  └─ detachListeners() — remove input event handlers

LevelEngine
  ├─ attachInputListeners() → InputSystem.attachListeners()
  └─ detachInputListeners() → InputSystem.detachListeners()

GamePage (orchestrates state)
  └─ useEffect([phase]) 
      ├─ if phase === "playing" → engine.attachInputListeners()
      └─ else → engine.detachInputListeners()
```

### Game State Machine

```
"loading"
  ↓
"intro" (input: OFF)
  ↓
"playing" (input: ON) ← only here are listeners active
  ↓
"ended" (input: OFF)
```

### Input Listener Lifecycle

**When phase changes:**
```typescript
// phase = "intro" → "playing"
engine.attachInputListeners()  // ✓ Listeners now active
// Hráč MŮŽE failnout

// phase = "playing" → "ended"
engine.detachInputListeners()  // ✓ Listeners removed
// Hráč NE MŮŽE failnout, UI je bezpečné
```

### UI Safety

UI elements that should NOT trigger game input are marked with `data-no-game-input`:

```tsx
<div data-no-game-input>
  <button onClick={() => setDevModeEnabled(true)}>
    DEV STEP MODE
  </button>
</div>
```

Both strategies work together:
1. **Phase-based** (primary): Listeners are detached when not playing
2. **Element-based** (secondary): Even if listeners are active, UI elements with `data-no-game-input` are skipped

---

## InputSystem Module

```typescript
class InputSystem {
  attachListeners()  // Called when phase = "playing"
  detachListeners()  // Called when phase ≠ "playing"
}
```

**Features:**
- Manages all input event listeners in one place
- Checks `data-no-game-input` attribute on event targets
- Handles grace period for mousemove (800ms)
- Provides clean attachment/detachment API

---

## Level Engine Architecture

### Engine States

```
EngineState = 'idle' | 'running' | 'paused' | 'ended'
```

The engine tracks its lifecycle state and supports pause/resume for DEV/ADMIN users.

### Normal Mode (PLAYER)

```
LevelEngine.start()
├─ setupEvents() — schedule events based on time
├─ setupTimer() — track progress, detect level end
└─ attachInputListeners() ← only when called from GamePage

GamePage:
│
└─ useEffect([phase])
   └─ when phase === "playing": engine.attachInputListeners()
```

**Time-based:** All events fire at `eventTime * 1000` milliseconds.

### Dev/Admin Mode (DEV, ADMIN)

DEV and ADMIN users get a full debug overlay on the GamePage:

```
LevelEngine.start()
├─ setupEvents() — schedule events
├─ setupTimer() — track progress
├─ Event log recording — tracks all engine events
└─ Snapshot system — captures engine state at any time

GamePage DEV overlay:
│
├─ Pause / Resume engine
├─ Step mode (trigger one event at a time)
├─ Skip to end (execute all remaining events)
├─ Reset current level
├─ Jump to any level number
├─ View event log in real-time
└─ Reset entire game (back to level 1)
```

### Engine Methods

Core methods available for all modes:

- `start()` — begin level execution
- `stop()` — halt engine (cleanup timers)
- `attachInputListeners()` — activate input detection
- `detachInputListeners()` — deactivate input detection

DEV/Admin-only methods:

- `pause()` — freeze timer and pending events (state → 'paused')
- `resume()` — resume from paused state, reschedule remaining events
- `nextEvent()` — execute next event in sequence (step mode)
- `skipToEnd()` — execute all remaining events and trigger success
- `resetLevel()` — reset engine to initial state
- `jumpToLevel(id)` — switch to a different level
- `triggerEvent(index)` — fire a specific event by index
- `getSnapshot()` — capture engine state (state, progress, eventIndex, elapsed, eventLog)
- `getEventLog()` — get recorded event history
- `restartLevel()` — reset and re-start current level

---

## Dev Mode UI Panel (DEV/ADMIN overlay)

Full debug panel on GamePage for DEV and ADMIN users:

```
┌──────────────────────────────────────┐
│ ENGINE: running | Elapsed: 5.2s      │
│ Level: 3 | Event: 4/8 | Progress: 52%│
├──────────────────────────────────────┤
│ [⏸ Pause]  [⏭ Next Event]           │
│ [⏩ Skip To End]  [↻ Reset Level]    │
│ ☑ Step Mode                          │
├──────────────────────────────────────┤
│ Jump to level: [___] [Go]            │
│ [Reset Game]                         │
├──────────────────────────────────────┤
│ Event Log:                           │
│  0.0s  [subtitle] "Nedělej nic."    │
│  3.0s  [voice] welcome.mp3          │
│  5.2s  [clear]                       │
└──────────────────────────────────────┘
```

The entire panel is marked with `data-no-game-input`, so clicking buttons doesn't trigger game fail.

---

## Role-Based Game Behavior

### PLAYER
- Normal gameplay with auto-progression
- After level end: 10-second countdown → auto-logout
- Cannot access other levels; server enforces current level
- Session invalidated after each level result

### DEV / ADMIN
- Full debug overlay visible during gameplay
- No auto-logout after level end — can restart or jump levels
- Backend allows access to ANY level (not just current)
- Backend does NOT auto-increment level on success
- Can pause/resume/step through events
- Can reset game progress from the overlay

---

## Post-Level Flow

### PLAYER Flow (production behavior)
1. Frontend fires `postResult` to backend
2. Backend saves progress (increments level)
3. Frontend shows "PROHRÁL JSI" / troll screen with 10-second countdown
4. Input listeners are automatically detached (phase = "ended")
5. Player can click "odhlásit se" to logout immediately
6. After 10 seconds: frontend calls `onLogout()` → AuthPage

### DEV/ADMIN Flow
1. Frontend fires `postResult` to backend
2. Backend records result but does NOT increment level
3. Frontend shows result (success/fail) without countdown
4. User can: Restart level, Jump to another level, Go to Admin Dashboard
5. No auto-logout — session remains valid

## API: POST /result

Saves level result, increments level, destroys session.

Returns: `{ message, newLevel }`

Session is invalidated as part of this request.
The player cannot make any further authenticated requests without logging in again.