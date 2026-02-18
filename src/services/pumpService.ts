import { PumpCurvePoint } from '../config'

// Port of services/pump_service.py
// - Linear interpolation
// - Returns NaN for x values outside the points range

export function interpolateCurve(points: PumpCurvePoint[], xVals: number[]): number[] {
  if (!points.length) return xVals.map(() => NaN)
  const pts = [...points].sort((a,b)=>a[0]-b[0])
  const xs = pts.map(p=>p[0])
  const ys = pts.map(p=>p[1])

  return xVals.map(x => {
    if (x < xs[0] || x > xs[xs.length-1]) return NaN
    // find bracket
    for (let i=0;i<xs.length-1;i++){
      const x0=xs[i], x1=xs[i+1]
      const y0=ys[i], y1=ys[i+1]
      if (x>=x0 && x<=x1){
        const t = (x-x0)/(x1-x0)
        return y0 + t*(y1-y0)
      }
    }
    return NaN
  })
}

export function deriveSystemCurveK(Q_total_kgph: number, branch_kpa: number): number {
  if (Q_total_kgph <= 0) return 0
  return Math.max(branch_kpa, 0) / (Math.max(Q_total_kgph, 1e-6) ** 2)
}

export function findOperatingPoint(Qgrid: number[], pump_kpa: number[], Ksys: number): { q?: number, dp?: number, warnings: string[] } {
  const warnings: string[] = []
  const sys_kpa = Qgrid.map(q => Ksys * q*q)
  const mask = Qgrid.map((_,i)=>Number.isFinite(pump_kpa[i]) && Number.isFinite(sys_kpa[i]))
  const validIdx = mask.map((m,i)=>m?i:-1).filter(i=>i>=0)
  if (validIdx.length < 2){
    warnings.push('Insufficient data to find pump operating point.')
    return { warnings }
  }

  const diff = Qgrid.map((_,i)=>pump_kpa[i]-sys_kpa[i])
  const diffs = validIdx.map(i=>diff[i])
  const signs = diffs.map(d=>Math.sign(d))

  let signChange = -1
  for (let i=0;i<signs.length-1;i++){
    if (signs[i] !== signs[i+1]) { signChange = i; break }
  }

  if (signChange === -1){
    const allPos = diffs.every(d=>d>0)
    warnings.push(allPos
      ? 'Pump curve stays above system curve – operating point may be at a higher flow than the provided curve covers.'
      : 'System curve stays above pump curve – pump likely insufficient.'
    )
    return { warnings }
  }

  const i0 = validIdx[signChange]
  const i1 = validIdx[signChange+1]

  const x0 = Qgrid[i0], x1 = Qgrid[i1]
  const y0 = diff[i0], y1 = diff[i1]
  const qStar = (y1-y0) !== 0 ? (x0 - y0*(x1-x0)/(y1-y0)) : x0

  // interpolate dp on pump curve between i0 and i1
  const t = (qStar - x0)/(x1-x0)
  const dpStar = pump_kpa[i0] + t*(pump_kpa[i1]-pump_kpa[i0])

  return { q: qStar, dp: dpStar, warnings }
}
