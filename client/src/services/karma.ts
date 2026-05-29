/**
 * Karmický skórovací systém (lokální fallback).
 *
 * Pravidlo: výhra levelu = +1, prohra = -1. Hodnota se ukládá lokálně
 * (localStorage) jako fallback dle Master Bible ("Progress musí existovat
 * lokálně jako fallback"). Skóre se při startu levelu předává do enginu jako
 * proměnná `karma`, takže level může přes `flow.branch` / Karrel `whenVar`
 * měnit odpovědi Karrela podle aktuálního skóre.
 *
 * ⚠️ Není to bezpečnostní vrstva — jde o lokální stav klienta. Server zůstává
 * zdrojem pravdy pro postup v levelech (user.level).
 */

const KARMA_PREFIX = 'nedelejnic_karma';

function keyFor(scope?: string): string {
  const s = (scope ?? '').trim();
  return s ? `${KARMA_PREFIX}_${s}` : KARMA_PREFIX;
}

export function getKarma(scope?: string): number {
  try {
    const raw = localStorage.getItem(keyFor(scope));
    if (raw == null) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function setKarma(value: number, scope?: string): number {
  try {
    localStorage.setItem(keyFor(scope), String(value));
  } catch {
    // ignore (private mode / disabled storage)
  }
  return value;
}

/** Aplikuje výsledek levelu na karmu: výhra +1, prohra -1. Vrací nové skóre. */
export function applyResult(result: 'success' | 'fail', scope?: string): number {
  const delta = result === 'success' ? 1 : -1;
  return setKarma(getKarma(scope) + delta, scope);
}

export function resetKarma(scope?: string): number {
  return setKarma(0, scope);
}
