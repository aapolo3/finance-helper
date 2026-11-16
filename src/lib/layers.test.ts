import { describe, expect, it, vi } from 'vitest'
import { createLayerStack } from './layers'

describe('layer stack', () => {
  it('closes only the newest layer on each Escape', () => {
    const layers = createLayerStack()
    const sheet = vi.fn()
    const menu = vi.fn()
    layers.push(sheet)
    layers.push(menu)

    expect(layers.escape()).toBe(true)
    expect(menu).toHaveBeenCalledTimes(1)
    expect(sheet).not.toHaveBeenCalled()
  })

  it('reaches the layer below once the top one is gone', () => {
    const layers = createLayerStack()
    const sheet = vi.fn()
    const menu = vi.fn()
    layers.push(sheet)
    const removeMenu = layers.push(menu)

    removeMenu()
    layers.escape()
    expect(sheet).toHaveBeenCalledTimes(1)
    expect(menu).not.toHaveBeenCalled()
  })

  it('removes a middle layer without disturbing the order', () => {
    const layers = createLayerStack()
    const bottom = vi.fn()
    const middle = vi.fn()
    // Closing a layer unmounts it, which removes it from the stack.
    const top = vi.fn(() => removeTop())
    layers.push(bottom)
    const removeMiddle = layers.push(middle)
    const removeTop = layers.push(top)

    removeMiddle()
    layers.escape()
    layers.escape()
    expect(top).toHaveBeenCalledTimes(1)
    expect(bottom).toHaveBeenCalledTimes(1)
    expect(middle).not.toHaveBeenCalled()
  })

  it('reports when nothing is open', () => {
    expect(createLayerStack().escape()).toBe(false)
  })
})
