import { useState, useEffect, useRef, useCallback } from 'react'

interface ElapsedTime {
  minutes: number
  seconds: number
  milliseconds: number
  formatted: string
  totalMs: number
}

interface UseElapsedTimerOptions {
  /** Start time as Date.now() timestamp. If not provided, timer starts from 0 on mount */
  startTime?: number | null
  /** Whether the timer should be running */
  isRunning: boolean
  /** Update interval in ms (default: 47ms for smooth ~21fps) */
  interval?: number
}

/**
 * Hook for displaying elapsed time with millisecond precision.
 * Used in progress dialogs to show real-time operation duration.
 *
 * Format: MM:SS.mmm (e.g., "00:45.230")
 */
export function useElapsedTimer({
  startTime,
  isRunning,
  interval = 47
}: UseElapsedTimerOptions): ElapsedTime {
  const [elapsed, setElapsed] = useState<ElapsedTime>({
    minutes: 0,
    seconds: 0,
    milliseconds: 0,
    formatted: '00:00.000',
    totalMs: 0
  })

  const intervalRef = useRef<number | null>(null)
  const frozenTimeRef = useRef<ElapsedTime | null>(null)

  const calculateElapsed = useCallback((totalMs: number): ElapsedTime => {
    const totalSeconds = Math.floor(totalMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const milliseconds = totalMs % 1000

    const formatted = `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`

    return { minutes, seconds, milliseconds, formatted, totalMs }
  }, [])

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (isRunning) {
      // Reset frozen time when starting
      frozenTimeRef.current = null

      const effectiveStartTime = startTime ?? Date.now()

      const tick = () => {
        const now = Date.now()
        const totalMs = now - effectiveStartTime
        setElapsed(calculateElapsed(totalMs))
      }

      // Initial tick
      tick()

      // Start interval
      intervalRef.current = window.setInterval(tick, interval)
    } else if (!isRunning && frozenTimeRef.current === null) {
      // Freeze the current time when stopping
      frozenTimeRef.current = elapsed
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRunning, startTime, interval, calculateElapsed])

  // Return frozen time if stopped, otherwise current elapsed
  return frozenTimeRef.current ?? elapsed
}
