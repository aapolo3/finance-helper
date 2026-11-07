import { createContext, useContext } from 'react'

type CardGrowth = {
  /** Ask for extra height (px) beyond the card's saved size, e.g. an opened calendar day. */
  grow: (px: number) => void
  /** The grid is in layout edit mode, where cards keep their saved size. */
  editing: boolean
}

export const GrowContext = createContext<CardGrowth>({ grow: () => {}, editing: false })

/** The grid opens whole rows below a growing card; the saved layout is untouched. */
export function useCardGrowth() {
  return useContext(GrowContext)
}
