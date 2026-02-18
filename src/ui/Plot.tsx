import React, { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'

type Props = {
  data: any[]
  layout?: any
  style?: React.CSSProperties
}

export default function Plot({ data, layout, style }: Props){
  const divRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!divRef.current) return
    Plotly.newPlot(divRef.current, data, { margin: { t: 30, r: 10, b: 40, l: 50 }, ...layout }, { responsive: true })
    return () => {
      if (divRef.current) Plotly.purge(divRef.current)
    }
  }, [JSON.stringify(data), JSON.stringify(layout)])

  return <div ref={divRef} style={{ width: '100%', height: 360, ...style }} />
}
