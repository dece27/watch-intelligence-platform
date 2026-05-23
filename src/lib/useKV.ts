import { useCallback, useEffect, useRef, useState } from "react"
import { installSparkKVFallback } from "@/lib/sparkKV"

type KvSetValue<T> = T | ((currentValue: T | undefined) => T | undefined)

export function useKV<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T | undefined>(initialValue)
  const initialValueRef = useRef(initialValue)
  const mutationVersionRef = useRef(0)

  useEffect(() => {
    initialValueRef.current = initialValue
    setValue(initialValue)
  }, [initialValue, key])

  useEffect(() => {
    installSparkKVFallback()

    let isCancelled = false
    const loadVersion = mutationVersionRef.current

    const loadValue = async () => {
      try {
        const storedValue = await window.spark.kv.get<T>(key)
        if (isCancelled || mutationVersionRef.current !== loadVersion) return

        if (storedValue === undefined) {
          await window.spark.kv.set(key, initialValueRef.current)
          if (!isCancelled && mutationVersionRef.current === loadVersion) {
            setValue(initialValueRef.current)
          }
          return
        }

        setValue(storedValue)
      } catch {
        if (!isCancelled) {
          setValue(initialValueRef.current)
        }
      }
    }

    void loadValue()

    return () => {
      isCancelled = true
    }
  }, [key])

  const deleteValue = useCallback(() => {
    installSparkKVFallback()
    mutationVersionRef.current += 1
    void window.spark.kv.delete(key)
    setValue(undefined)
  }, [key])

  const userSetValue = useCallback((newValue: KvSetValue<T>) => {
    installSparkKVFallback()
    mutationVersionRef.current += 1

    setValue((currentValue) => {
      const nextValue = typeof newValue === "function"
        ? (newValue as (currentValue: T | undefined) => T | undefined)(currentValue)
        : newValue

      if (nextValue === undefined) {
        void window.spark.kv.delete(key)
      } else {
        void window.spark.kv.set(key, nextValue)
      }

      return nextValue
    })
  }, [key])

  return [value, userSetValue, deleteValue] as const
}
