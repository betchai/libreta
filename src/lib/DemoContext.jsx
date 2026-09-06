import { createContext, useContext, useState, useCallback } from 'react'

const DemoContext = createContext(null)

export function DemoProvider({ children }) {
  const [isDemo] = useState(true)

  const toast = useCallback((msg) => {
    console.log(`[Demo] ${msg}`)
  }, [])

  return (
    <DemoContext.Provider value={{ isDemo, toast }}>
      {children}
    </DemoContext.Provider>
  )
}

export function useDemo() {
  return useContext(DemoContext)
}