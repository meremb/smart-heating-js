export const EXPONENT_RADIATOR = 1.34
export const DELTA_T_REF = (75.0 + 65.0)/2.0 - 20.0

export function calculateWeightedDeltaT(radiators: {mass_flow_rate:number}[], radiatorRows: any[]): number {
  const totalFlow = radiators.reduce((s,r)=>s+(r.mass_flow_rate||0),0)
  if (totalFlow <= 0) return 0
  let weighted = 0
  for (let i=0;i<radiatorRows.length;i++){
    const row = radiatorRows[i]
    const m = Number(row['Mass flow rate'] ?? 0)
    const sup = Number(row['Supply Temperature'] ?? 0)
    const ret = Number(row['Return Temperature'] ?? 0)
    weighted += m * (sup - ret)
  }
  return weighted / totalFlow
}

export function calculateExtraPowerNeeded(radiatorPower: number, heatLoss: number, supplyTemp: number, deltaT: number, spaceTemp: number): number {
  const rp = Number(radiatorPower || 0)
  const hl = Number(heatLoss || 0)
  const ts = Number(supplyTemp)
  const dt = Number(deltaT)
  const sp = Number(spaceTemp)
  if (![rp,hl,ts,dt,sp].every(Number.isFinite)) return 0
  if (dt <= 0 || rp <= 0) return 0
  const tReturn = ts - dt
  const deltaActual = (ts + tReturn)/2.0 - sp
  if (deltaActual <= 0) return 0
  const phi = Math.max(deltaActual / DELTA_T_REF, 1e-6)
  const available = Math.max(0, rp) * (phi ** EXPONENT_RADIATOR)
  const extraActual = Math.max(0, hl - available)
  return extraActual / (phi ** EXPONENT_RADIATOR)
}

export function initRadiatorRows(n: number, collectorOptions: string[], roomOptions: any[]): any[] {
  const rows: any[] = []
  for (let i=1;i<=n;i++){
    rows.push({
      'Radiator nr': i,
      'Collector': collectorOptions[0] ?? 'Collector 1',
      'Radiator power 75/65/20': 0.0,
      'Length circuit': 0.0,
      'Space Temperature': 20.0,
      'Electric power': 0.0,
      'Room': (roomOptions && roomOptions.length) ? roomOptions[(i-1)%Math.max(1,roomOptions.length)] : 1,
    })
  }
  return rows
}

export function resizeRadiatorRows(current: any[], desired: number, collectorOptions: string[], roomOptions:any[]): any[] {
  const rows = (current || []).slice()
  if (desired > rows.length){
    rows.push(...initRadiatorRows(desired - rows.length, collectorOptions, roomOptions))
  }
  const out = rows.slice(0, desired)
  out.forEach((r, idx) => r['Radiator nr'] = idx+1)
  return out
}

export function initCollectorRows(n: number, start = 1): any[] {
  return Array.from({length:n}, (_,i)=>({ 'Collector': `Collector ${start+i}`, 'Collector circuit length': 0.0 }))
}

export function resizeCollectorRows(current:any[], desired:number): any[] {
  const rows = (current || []).slice()
  if (desired > rows.length){
    rows.push(...initCollectorRows(desired - rows.length, rows.length+1))
  }
  return rows.slice(0, desired)
}
