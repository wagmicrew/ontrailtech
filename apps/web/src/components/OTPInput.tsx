import { useRef, useState, useCallback, useEffect, type KeyboardEvent, type ClipboardEvent, type ChangeEvent } from 'react';

interface OTPInputProps {
  length?: number;
  onComplete: (code: string) => void;
  disabled?: boolean;
  error?: string;
}

export default function OTPInput({ length = 6, onComplete, disabled = false, error }: OTPInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset values when length changes
  useEffect(() => {
    setValues(Array(length).fill(''));
  }, [length]);

  const focusInput = useCallback((index: number) => {
    if (index >= 0 && index < length) {
      inputRefs.current[index]?.focus();
    }
  }, [length]);

  const checkComplete = useCallback((newValues: string[]) => {
    const code = newValues.join('');
    if (code.length === length && newValues.every(v => v !== '')) {
      onComplete(code);
    }
  }, [length, onComplete]);

  const handleChange = useCallback((index: number, e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Only accept single digit
    if (val.length > 1 || (val && !/^\d$/.test(val))) return;

    setValues(prev => {
      const next = [...prev];
      next[index] = val;
      if (val) {
        // Move focus to next input
        focusInput(index + 1);
      }
      checkComplete(next);
      return next;
    });
  }, [focusInput, checkComplete]);

  const handleKeyDown = useCallback((index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      setValues(prev => {
        const next = [...prev];
        if (next[index]) {
          // Clear current input
          next[index] = '';
        } else if (index > 0) {
          // Move to previous and clear it
          next[index - 1] = '';
          focusInput(index - 1);
        }
        return next;
      });
    }
  }, [focusInput]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;

    const newValues = Array(length).fill('');
    for (let i = 0; i < pasted.length; i++) {
      newValues[i] = pasted[i];
    }
    setValues(newValues);

    // Focus the next empty input or the last one
    const nextEmpty = newValues.findIndex(v => v === '');
    focusInput(nextEmpty >= 0 ? nextEmpty : length - 1);

    checkComplete(newValues);
  }, [length, focusInput, checkComplete]);

  const borderClass = error
    ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
    : 'border-gray-200 focus:ring-emerald-500 focus:border-emerald-500';

  return (
    <div>
      <div className="flex justify-center gap-2">
        {values.map((val, i) => (
          <input
            key={i}
            ref={el => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]"
            maxLength={1}
            value={val}
            disabled={disabled}
            aria-label={`Digit ${i + 1} of ${length}`}
            onChange={e => handleChange(i, e)}
            onKeyDown={e => handleKeyDown(i, e)}
            onPaste={handlePaste}
            className={`w-12 h-14 text-center text-xl font-semibold rounded-xl border ${borderClass} outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
          />
        ))}
      </div>
      {error && (
        <p className="mt-2 text-center text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}
