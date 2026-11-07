import { sankey as d3Sankey, type SankeyLink, type SankeyNode } from 'd3-sankey'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatMoney } from '../domain/money'
import type { SankeyModel, SankeyNodeDef } from '../domain/sankey'
import {
  getSankeyTheme,
  sankeyNodeColor,
  type SankeyThemeId,
} from '../domain/sankeyThemes'

type NodeExtra = SankeyNodeDef
type LinkExtra = { value: number }

type LayoutNode = SankeyNode<NodeExtra, LinkExtra>
type LayoutLink = SankeyLink<NodeExtra, LinkExtra>

/** Node: [x0, y0, x1, y1]. Link: [sourceX, sourceY, targetX, targetY, width]. */
type Geometry = {
  nodes: Record<string, number[]>
  links: Record<string, number[]>
}

const MORPH_MS = 520

function linkKey(link: LayoutLink, seen: Map<string, number>): string {
  const base = `${(link.source as LayoutNode).id}->${(link.target as LayoutNode).id}`
  const count = seen.get(base) ?? 0
  seen.set(base, count + 1)
  return count === 0 ? base : `${base}#${count}`
}

function geometryOf(layout: { nodes: LayoutNode[]; links: LayoutLink[] } | null): Geometry {
  const geometry: Geometry = { nodes: {}, links: {} }
  if (!layout) return geometry
  for (const node of layout.nodes) {
    geometry.nodes[node.id] = [node.x0 ?? 0, node.y0 ?? 0, node.x1 ?? 0, node.y1 ?? 0]
  }
  const seen = new Map<string, number>()
  for (const link of layout.links) {
    geometry.links[linkKey(link, seen)] = [
      (link.source as LayoutNode).x1 ?? 0,
      link.y0 ?? 0,
      (link.target as LayoutNode).x0 ?? 0,
      link.y1 ?? 0,
      link.width ?? 0,
    ]
  }
  return geometry
}

/** Collapsed start for shapes that did not exist before: zero height at their middle. */
function collapsedNode([x0, y0, x1, y1]: number[]): number[] {
  const mid = (y0 + y1) / 2
  return [x0, mid, x1, mid]
}

function collapsedLink([sx, sy, tx, ty]: number[]): number[] {
  return [sx, sy, tx, ty, 0]
}

function lerpGeometry(from: Geometry, to: Geometry, t: number): Geometry {
  const mix = (a: number[], b: number[]) => b.map((value, i) => a[i] + (value - a[i]) * t)
  const out: Geometry = { nodes: {}, links: {} }
  for (const [id, target] of Object.entries(to.nodes)) {
    out.nodes[id] = mix(from.nodes[id] ?? collapsedNode(target), target)
  }
  for (const [id, target] of Object.entries(to.links)) {
    out.links[id] = mix(from.links[id] ?? collapsedLink(target), target)
  }
  return out
}

/**
 * When the budget changes, ribbons and bars morph from where they are on screen to the new
 * layout instead of snapping. Size changes follow the frame directly.
 */
function useMorph(target: Geometry, sizeKey: string): Geometry {
  const [shown, setShown] = useState(target)
  const current = useRef(target)
  const lastSize = useRef(sizeKey)

  useLayoutEffect(() => {
    // A size change already arrives frame by frame from the resizing card; easing toward
    // each frame would trail behind it, so follow the size directly.
    const resized = lastSize.current !== sizeKey
    lastSize.current = sizeKey
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (resized || reduce) {
      current.current = target
      setShown(target)
      return
    }
    const from = current.current
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / MORPH_MS)
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      const next = lerpGeometry(from, target, eased)
      current.current = next
      setShown(next)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, sizeKey])

  return shown
}

/** Same curve d3's sankeyLinkHorizontal draws, from tweened numbers. */
function ribbonPath([sx, sy, tx, ty]: number[]): string {
  const mx = (sx + tx) / 2
  return `M${sx},${sy}C${mx},${sy} ${mx},${ty} ${tx},${ty}`
}

type SankeyChartProps = {
  model: SankeyModel
  currency: string
  themeId?: SankeyThemeId
  /** Draw labels for a dark card, and size the chart for a dashboard column. */
  surface?: 'default' | 'dark'
}

export function SankeyChart({
  model,
  currency,
  themeId,
  surface = 'default',
}: SankeyChartProps) {
  const onDark = surface === 'dark'
  const frameRef = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState({ width: 0, height: 0 })
  const [hover, setHover] = useState<string | null>(null)

  // Re-attach when the empty state swaps for the chart, which is a different element.
  const hasLayout = model.nodes.length > 0 && model.links.length > 0
  useEffect(() => {
    const node = frameRef.current
    if (!node) return
    const measure = () => {
      const rect = node.getBoundingClientRect()
      setFrame({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      })
    }
    measure()
    // Re-layout on every resize frame (cheap at this size) so the diagram tracks the card
    // exactly while it grows beside an opened calendar day, with no scaling or recentering.
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasLayout])

  const fitted = frame.width > 48 && frame.height > 48
  const width = fitted ? frame.width : onDark ? 640 : 960
  const height = fitted
    ? frame.height
    : Math.max(onDark ? 280 : 320, (onDark ? 72 : 80) + model.nodes.length * (onDark ? 30 : 28))
  const nodePadding = Math.min(
    onDark ? 14 : 18,
    Math.max(4, (height - 24) / Math.max(1, model.nodes.length)),
  )
  const theme = getSankeyTheme(themeId)
  const colorFor = (node: Pick<SankeyNodeDef, 'kind' | 'category'>) =>
    sankeyNodeColor(theme, node.kind, node.category)

  const layout = useMemo(() => {
    if (model.nodes.length === 0 || model.links.length === 0) return null
    const generator = d3Sankey<NodeExtra, LinkExtra>()
      .nodeId((d) => d.id)
      .nodeWidth(Math.max(8, Math.min(14, width * 0.02)))
      .nodePadding(nodePadding)
      .extent([
        [8, 10],
        [width - 8, height - 10],
      ])

    return generator({
      nodes: model.nodes.map((n) => ({ ...n })),
      links: model.links.map((l) => ({ ...l })),
    })
  }, [model, height, nodePadding, width])

  const target = useMemo(() => geometryOf(layout), [layout])
  const geometry = useMorph(target, `${width}x${height}`)
  const clipId = useId()

  if (!layout) {
    return (
      <div
        ref={frameRef}
        className={
          onDark
            ? 'flex h-64 items-center justify-center rounded-2xl border border-dashed border-rule-strong text-sm text-zinc-400'
            : 'flex h-64 items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700'
        }
      >
        Add income and expenses to see money flow.
      </div>
    )
  }

  const linkKeys = new Map<string, number>()
  const incomeTotal = model.totals.available || model.totals.income || 1
  const labelClass = onDark
    ? 'fill-zinc-100 text-sm'
    : 'fill-zinc-800 text-[12px] dark:fill-zinc-100'
  const valueClass = onDark
    ? 'fill-zinc-400 text-[12px] tabular-nums'
    : 'fill-zinc-500 text-xs tabular-nums'

  return (
    <div ref={frameRef} className="h-full min-h-0 w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label="Sankey diagram of income flowing to expenses"
      >
        <defs>
          {/* First paint: money flows in from the left. */}
          <clipPath id={clipId}>
            <rect className="sankey-reveal" x={0} y={0} width={width} height={height} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
        {layout.links.map((link) => {
          const source = link.source as LayoutNode
          const target = link.target as LayoutNode
          const key = linkKey(link, linkKeys)
          const shape = geometry.links[key]
          if (!shape) return null
          const related = hover === source.id || hover === target.id
          const opacity = hover
            ? related
              ? onDark ? 0.75 : 0.55
              : 0.06
            : onDark ? 0.5 : 0.35
          return (
            <path
              key={key}
              d={ribbonPath(shape)}
              className="sankey-link"
              fill="none"
              stroke={colorFor(target)}
              strokeOpacity={opacity}
              strokeWidth={Math.max(1, shape[4])}
            />
          )
        })}
        {layout.nodes.map((node) => {
          const shape = geometry.nodes[node.id]
          if (!shape) return null
          const [x0, y0, x1, y1] = shape
          const value = node.value ?? 0
          const dimmed = hover && hover !== node.id
          const hideLabel = onDark && node.kind === 'available'
          const fullLabel = node.label
          const name =
            onDark && fullLabel.length > 16 ? `${fullLabel.slice(0, 15)}…` : fullLabel
          const valueLabel = `${formatMoney(value, currency)} · ${((value / incomeTotal) * 100).toFixed(0)}%`
          const nameWidth = name.length * (onDark ? 7.4 : 6.4)
          const spaceRight = width - x1 - 10
          const spaceLeft = x0 - 10
          const placeRight = spaceRight >= nameWidth || spaceRight >= spaceLeft
          const labelX = placeRight ? x1 + 8 : x0 - 8
          const anchor = placeRight ? 'start' : 'end'
          const tall = y1 - y0 >= (onDark ? 28 : 24)
          return (
            <g
              key={node.id}
              onMouseEnter={() => setHover(node.id)}
              onMouseLeave={() => setHover(null)}
              className="sankey-node cursor-default"
            >
              <title>{`${fullLabel}: ${valueLabel}`}</title>
              <rect
                x={x0}
                y={y0}
                width={Math.max(1, x1 - x0)}
                height={Math.max(1, y1 - y0)}
                rx={3}
                fill={colorFor(node)}
                opacity={dimmed ? 0.35 : 1}
              />
              <g
                className="sankey-label"
                style={{ animationDelay: `${300 + (node.depth ?? 0) * 110}ms` }}
                opacity={dimmed ? 0.45 : 1}
              >
              {!hideLabel && (
                <text
                  x={labelX}
                  y={(y0 + y1) / 2 + (tall ? -7 : 0)}
                  textAnchor={anchor}
                  dominantBaseline={tall ? 'auto' : 'middle'}
                  className={labelClass}
                >
                  {name}
                </text>
              )}
              {!hideLabel && tall && (
                <text
                  x={labelX}
                  y={(y0 + y1) / 2 + (onDark ? 11 : 10)}
                  textAnchor={anchor}
                  className={valueClass}
                >
                  {valueLabel}
                </text>
              )}
              </g>
            </g>
          )
        })}
        </g>
      </svg>
    </div>
  )
}
