# Input System Bug Analysis

## Problem

### Current Behavior
1. User enters GamePage
2. Phase transitions: "loading" → "intro" → "playing"
3. When phase becomes "playing", `engine.start()` is called
4. `engine.start()` calls `setupInputDetection()`
5. **ISSUE:** This attaches global input listeners (mousemove, click, keyboard, etc.)
6. These listeners remain active for the entire GamePage lifecycle
7. Even when phase is "intro" or "ended", the listeners are still active
8. Any interaction with DEV MENU checkbox or intro screen triggers game fail

### Root Cause
```typescript
// In LevelEngine.start()
setupInputDetection(); // 🔴 This happens immediately, no state check
```

**Input listeners become global and stay active indefinitely.**

---

## Architecture Problem

The current design violates the "state-driven input" principle:

```
WRONG: setupInputDetection() → global listeners (always active)

RIGHT: if (gameState === "LEVEL_RUNNING") → activate listeners
       else → deactivate listeners
```

### Current State Machine (Broken)

```
loading → intro → playing → ended
         ↓(ignored)
      Input listeners are ALWAYS ACTIVE
      regardless of actual game state
```

### Required State Machine

```
loading → intro → playing → ended
          X        ✓         X
      Input listeners active only in "playing" state
```

---

## Why DEV Menu Fails

1. User clicks DEV STEP MODE checkbox
2. Listener catches `click` event (if rules require it)
3. Engine calls `onFail()`
4. Game ends with "PROHRÁL JSI"
5. **User can't even interact with UI!**

---

## Design Violations

1. ❌ **No state guard:** Input logic doesn't check game phase
2. ❌ **Global listeners:** Attached to document globally
3. ❌ **No isolation:** UI interactions trigger gameplay logic
4. ❌ **No event capture:** Input handling doesn't distinguish UI events from gameplay events

---

## Required Fix

### 1. Input System Module
- Separate module that manages input listeners
- Methods: `attach()`, `detach()`
- Called based on game state

### 2. State-Based Control
- Input listeners only active when `phase === "playing"`
- Listeners removed when phase changes

### 3. Event Target Checking
- UI elements should have `data-no-game-input` attribute
- Input handler should skip events from UI elements

### 4. GamePage State Management
- Control when listeners are attached/detached
- Use useEffect to sync phase with input system state

---

## Example Fix

```typescript
// BEFORE (broken)
useEffect(() => {
  const engine = new LevelEngine(cfg, callbacks);
  engine.start(); // 🔴 Input listeners activated globally
}, []);

// AFTER (fixed)
useEffect(() => {
  const engine = new LevelEngine(cfg, callbacks);
  engine.start(); // Only setup events, NOT input
}, []);

useEffect(() => {
  if (phase === "playing" && engineRef.current) {
    engineRef.current.attachInputListeners(); // Only NOW
  } else {
    engineRef.current?.detachInputListeners(); // Clean up
  }
}, [phase]);
```

---

## ✅ Solution Implemented

### 1. InputSystem Module (`engine/InputSystem.ts`)

New module that manages input listeners independently:

```typescript
class InputSystem {
  attachListeners()   // Activate input detection
  detachListeners()   // Deactivate input detection
}
```

**Key features:**
- Only attaches listeners when explicitly called
- Checks `data-no-game-input` attribute to skip UI events
- Handles grace period for mousemove
- Provides clean API for attachment/detachment

### 2. LevelEngine Refactor

Separated input management from engine logic:

```typescript
class LevelEngine {
  private inputSystem: InputSystem  // ✓ Manages listeners

  start() {
    // Setup events and timers FIRST
    this.setupEvents()
    this.setupTimer()
    
    // THEN attach listeners (not automatically)
    this.attachInputListeners()
  }

  attachInputListeners()   // Public method
  detachInputListeners()   // Public method
}
```

### 3. GamePage State Control

Added `useEffect` to control input based on game phase:

```typescript
useEffect(() => {
  if (phase === "playing") {
    engineRef.current?.attachInputListeners()
  } else {
    engineRef.current?.detachInputListeners()
  }
}, [phase])
```

**Result:**
- phase = "intro" → input OFF ✓
- phase = "playing" → input ON ✓
- phase = "ended" → input OFF ✓

### 4. UI Safety

Added `data-no-game-input` to all UI elements:

```tsx
<div data-no-game-input>
  <input type="checkbox" />  ← Can interact safely
  <button />                  ← Can interact safely
</div>
```

InputSystem checks for this attribute:
```typescript
const target = e.target as HTMLElement
if (target?.closest('[data-no-game-input]')) return  // Skip
```

---

## Result

### Before Fix ❌
- User clicks DEV checkbox
- Input listener triggers `click` event
- Game fails: "PROHRÁL JSI"
- User can't interact with UI

### After Fix ✅
- phase = "intro" → input listeners NOT attached
- User clicks DEV checkbox safely
- No game fail
- User can interact with UI
- phase = "playing" → input listeners attached
- User WILL fail if they interact

---

## Files Changed

1. **New:** `client/src/engine/InputSystem.ts` (~100 lines)
   - Manages input listener lifecycle
   
2. **Modified:** `client/src/engine/LevelEngine.ts`
   - Uses InputSystem instead of direct listeners
   - Removes global input setup from constructor
   - Adds public attach/detach methods
   
3. **Modified:** `client/src/pages/GamePage.tsx`
   - Controls input based on phase with useEffect
   - Adds `data-no-game-input` to UI elements
   
4. **Updated:** `docs/ARCHITECTURE.md`
   - Comprehensive documentation of new system

---

## Implementation Checklist

- [x] Create `InputSystem` module
- [x] Extract input logic from LevelEngine
- [x] Add `attachInputListeners()` to LevelEngine
- [x] Add `detachInputListeners()` to LevelEngine
- [x] Update GamePage to control input lifecycle
- [x] Add `data-no-game-input` to UI elements
- [x] Ensure listeners cleanup on unmount
- [x] Update ARCHITECTURE.md documentation
