import { MODE_EXISTING, MODE_FIXED, MODE_PUMP, MODE_BAL, PUMP_LIBRARY } from '../config'
import { Radiator, POSSIBLE_DIAMETERS, selectPipeDiameter } from '../domain/radiator'
import { Circuit, checkPipeVelocities, PRESSURE_LOSS_BOILER_Pa } from '../domain/hydraulics'
import { calculateExtraPowerNeeded, calculateWeightedDeltaT } from './radiatorService'
import { interpolateCurve, deriveSystemCurveK, findOperatingPoint } from './pumpService'
import { calcPressureValveOpen_Pa, addValvePositionAndKv } from '../domain/valve'

export type Config = {
  design_mode: string
  delta_T: number
  supply_temp_input?: number | null
  fix_diameter: boolean
  pump_model: string
  pump_speed: string
  valve_type: string
  positions: number
  kv_max: number
}

export function computeAll(
  radiatorRows: any[],
  collectorRows: any[],
  heatLossSplitRows: any[],
  cfg: Config,
  roomRows: any[],
  valveOverrideRows: any[]
){
  const warnings: string[] = []
  if (!radiatorRows?.length || !collectorRows?.length || !heatLossSplitRows?.length){
    return { warnings: ['Complete Tab 1 & 2 first.'], merged: [], collectors: [], metrics: emptyMetrics(), charts: emptyCharts() }
  }

  const splitMap = new Map<any, number>()
  heatLossSplitRows.forEach(r => splitMap.set(r['Radiator nr'], Number(r['Calculated Heat Loss (W)'] ?? 0)))

  const roomTempMap = new Map<any, number>()
  ;(roomRows||[]).forEach(r => roomTempMap.set(r['Room #'], Number(r['Indoor Temp (°C)'] ?? 20)))

  let rad = radiatorRows.map(r => ({
    ...r,
    'Calculated heat loss': splitMap.get(r['Radiator nr']) ?? 0,
    'Space Temperature': roomTempMap.get(r['Room']) ?? (Number(r['Space Temperature'] ?? 20)),
  }))

  const mode = cfg.design_mode || MODE_EXISTING
  const deltaT = Number(cfg.delta_T ?? 10)

  const simulateForDt = (dt: number) => {
    const localWarnings: string[] = []
    let localRad = rad.map(r => ({...r}))

    const calcRows: Radiator[] = []
    localRad.forEach(row => {
      const base = Number(row['Radiator power 75/65/20'] ?? 0)
      const hl = Number(row['Calculated heat loss'] ?? 0)
      const elec = Number(row['Electric power'] ?? 0)
      const want = Math.max(hl - elec, 0)
      const qRatio = base ? (want/base) : 0
      calcRows.push(new Radiator({ q_ratio: qRatio, delta_t: dt, space_temperature: Number(row['Space Temperature'] ?? 20), heat_loss: hl }))
    })

    let supplyT = 55.0
    const supplies = calcRows.map(r => r.supply_temperature).filter(Number.isFinite)
    if (supplies.length) supplyT = Math.max(...supplies)

    calcRows.forEach(r => {
      r.supply_temperature = supplyT
      r.return_temperature = r.calculateTreturn(supplyT)
      r.mass_flow_rate = r.calculateMassFlowRate()
    })

    localRad = localRad.map((row, i) => ({
      ...row,
      'Supply Temperature': supplyT,
      'Return Temperature': calcRows[i].return_temperature,
      'Mass flow rate': calcRows[i].mass_flow_rate,
      'Extra radiator power': 0.0,
    }))

    if (cfg.fix_diameter){
      localRad = localRad.map(row => ({ ...row, 'Diameter': Number(row['Fixed Diameter (mm)'] ?? 16) }))
    } else {
      let maxDia = 16
      for (const r of calcRows){
        try { maxDia = Math.max(maxDia, r.calculateDiameter(POSSIBLE_DIAMETERS)) }
        catch (e:any){ localWarnings.push(String(e.message || e)); }
      }
      localRad = localRad.map(row => ({ ...row, 'Diameter': maxDia }))
    }

    localRad = localRad.map(row => {
      try {
        const c = new Circuit(Number(row['Length circuit'] ?? 0), Number(row['Diameter'] ?? 16), Number(row['Mass flow rate'] ?? 0))
        return { ...row, 'Pressure loss': c.calculate_pressure_radiator_kv_Pa() }
      } catch (e:any){
        localWarnings.push(`Radiator ${row['Radiator nr']}: ${e.message||e}`)
        return { ...row, 'Pressure loss': NaN }
      }
    })

    let cols = collectorRows.map(r => ({...r}))
    cols = cols.map(col => {
      const name = col['Collector']
      const m = localRad.filter(r => r['Collector'] === name).reduce((s,r)=>s+(Number(r['Mass flow rate']||0)),0)
      let d = 16
      try { d = selectPipeDiameter(m, POSSIBLE_DIAMETERS) } catch (e:any){ localWarnings.push(String(e.message||e)) }
      let dp = NaN
      try {
        const c = new Circuit(Number(col['Collector circuit length'] ?? 0), d, m)
        dp = c.calculate_pressure_collector_kv_Pa()
      } catch (e:any){ localWarnings.push(`Collector ${name}: ${e.message||e}`) }
      return { ...col, 'Mass flow rate': m, 'Diameter': d, 'Collector pressure loss': dp }
    })

    const sortedCols = cols.slice().sort((a,b)=>String(a['Collector']).localeCompare(String(b['Collector'])))
    const lossMap = new Map<string, number>()
    sortedCols.forEach(c => lossMap.set(String(c['Collector']), Number(c['Collector pressure loss'] ?? 0)))
    const names = Array.from(lossMap.keys())

    let merged = localRad.map(r => {
      const idx = names.indexOf(String(r['Collector']))
      const downstream = idx>=0 ? names.slice(idx).reduce((s,n)=>s+(lossMap.get(n)??0),0) : 0
      const total = Number(r['Pressure loss'] ?? 0) + downstream + PRESSURE_LOSS_BOILER_Pa
      return { ...r, 'Total Pressure Loss': total }
    })

    const Q_total = merged.reduce((s,r)=>s+Number(r['Mass flow rate']??0),0)
    const branch_kpa = Math.max(...merged.map(r=>Number(r['Total Pressure Loss']??0))) / 1000
    const K_sys = deriveSystemCurveK(Q_total, branch_kpa)

    const pumpPoints = (PUMP_LIBRARY[cfg.pump_model] || {})[cfg.pump_speed] || []
    let qStar: number|undefined
    let dpStar: number|undefined
    if (pumpPoints.length){
      const qMin = Math.min(...pumpPoints.map(p=>p[0]))
      const qMax = Math.max(...pumpPoints.map(p=>p[0]))
      const Qgrid = Array.from({length:150}, (_,i)=> qMin + (qMax-qMin)*i/149)
      const pumpKpa = interpolateCurve(pumpPoints as any, Qgrid)
      const op = findOperatingPoint(Qgrid, pumpKpa, K_sys)
      qStar = op.q
      dpStar = op.dp
      localWarnings.push(...op.warnings)
    }

    return { merged, cols, calcRows, Q_total, K_sys, qStar, dpStar, warnings: localWarnings }
  }

  let merged: any[] = []
  let cols: any[] = []
  let calcRows: Radiator[] = []
  let pumpInfo: any = {}

  if (mode === MODE_PUMP){
    const dtHigh = Math.max(20, deltaT)
    const hi = simulateForDt(dtHigh)
    warnings.push(...hi.warnings)
    if (hi.qStar === undefined || hi.Q_total > (hi.qStar ?? 0)){
      warnings.push('Pump insufficient even at max ΔT – consider a larger pump or wider pipes.')
      merged = hi.merged; cols = hi.cols; calcRows = hi.calcRows
      pumpInfo = { dt: dtHigh, qStar: hi.qStar, dpStar: hi.dpStar, K: hi.K_sys }
    } else {
      let best = { ...hi, dt: dtHigh }
      let lo = 0.1, hiDt = dtHigh
      for (let iter=0; iter<50; iter++){
        const mid = (lo+hiDt)/2
        const m = simulateForDt(mid)
        warnings.push(...m.warnings)
        if (m.qStar !== undefined && m.Q_total <= (m.qStar ?? 0)){
          best = { ...m, dt: mid }
          hiDt = mid
        } else {
          lo = mid
        }
        if (hiDt - lo < 0.1) break
      }
      merged = best.merged; cols = best.cols; calcRows = best.calcRows
      pumpInfo = { dt: best.dt, qStar: best.qStar, dpStar: best.dpStar, K: best.K_sys }
      warnings.push(`Pump mode: ΔT=${best.dt.toFixed(1)} °C, Q≈${best.Q_total.toFixed(0)} kg/h, pump Q*≈${(best.qStar ?? 0).toFixed(0)} kg/h.`)
    }
  } else if (mode === MODE_FIXED){
    const ts = cfg.supply_temp_input
    if (ts === undefined || ts === null){
      return { warnings: ['Enter a supply temperature in Tab 2 for LT dimensioning mode.'], merged: [], collectors: [], metrics: emptyMetrics(), charts: emptyCharts() }
    }
    calcRows = []
    merged = rad.map(row => {
      const base = Number(row['Radiator power 75/65/20'] ?? 0)
      const hl = Number(row['Calculated heat loss'] ?? 0)
      const spaceT = Number(row['Space Temperature'] ?? 20)
      const extra = calculateExtraPowerNeeded(base, hl, Number(ts), deltaT, spaceT)
      const qRatio = base ? Math.max(hl - Number(row['Electric power']??0), 0) / (base + extra) : 0
      const r = new Radiator({ q_ratio: qRatio, delta_t: deltaT, space_temperature: spaceT, heat_loss: hl + extra, supply_temperature: Number(ts) })
      calcRows.push(r)
      return { ...row,
        'Extra radiator power': extra,
        'Supply Temperature': Number(ts),
        'Return Temperature': r.return_temperature,
        'Mass flow rate': r.mass_flow_rate,
      }
    })
    rad = merged
    const sim = simulateForDt(deltaT)
    merged = sim.merged
    cols = sim.cols
  } else {
    const sim = simulateForDt(deltaT)
    warnings.push(...sim.warnings)
    merged = sim.merged
    cols = sim.cols
    calcRows = sim.calcRows
  }

  const valveType = cfg.valve_type || 'Custom'
  const kvMax = Number(cfg.kv_max ?? 0.7)
  const positions = Number(cfg.positions ?? 8)

  merged = merged.map(r => ({
    ...r,
    'Valve pressure loss N': calcPressureValveOpen_Pa(valveType, Number(r['Mass flow rate'] ?? 0), kvMax),
  }))

  const typedForValve = merged.map(r => ({
    radiatorNr: r['Radiator nr'],
    totalPressureLoss_Pa: r['Total Pressure Loss'],
    valvePressureLossOpen_Pa: r['Valve pressure loss N'],
    massFlowRate_kg_h: r['Mass flow rate'],
    ...r,
  }))

  const withValve = (valveType === 'Custom')
    ? addValvePositionAndKv(typedForValve, 'Custom', kvMax, positions)
    : addValvePositionAndKv(typedForValve, valveType)

  merged = merged.map((r, i) => ({
    ...r,
    'Valve position': withValve[i].valvePosition ?? withValve[i]['Valve position'],
    'Valve kv': withValve[i].valveKv ?? withValve[i]['Valve kv'],
  }))

  if (mode === MODE_BAL && valveOverrideRows?.length){
    const ovMap = new Map<any, any>()
    valveOverrideRows.forEach(o => ovMap.set(o['Radiator nr'], o['Valve Position Override']))
    merged = merged.map(r => {
      const ov = ovMap.get(r['Radiator nr'])
      if (ov !== undefined && ov !== null && ov !== '') return { ...r, 'Valve position': Number(ov) }
      return r
    })
  }

  const v = checkPipeVelocities(
    merged.map(r => ({ radiatorNr: r['Radiator nr'], massFlowRate_kg_h: r['Mass flow rate'], diameter_mm: r['Diameter'], ...r })),
    cols.map(c => ({ name: c['Collector'], massFlowRate_kg_h: c['Mass flow rate'], diameter_mm: c['Diameter'], ...c })),
    0.5,
  )
  merged = v.radiators.map((r:any) => ({ ...r, 'Velocity (m/s)': r.velocity_m_s }))
  cols = v.collectors.map((c:any) => ({ ...c, 'Velocity (m/s)': c.velocity_m_s }))
  warnings.push(...v.warnings)

  const totalFlow = merged.reduce((s,r)=>s+Number(r['Mass flow rate']??0),0)
  const totalHeatLoss = merged.reduce((s,r)=>s+Number(r['Calculated heat loss']??0),0)
  const totalPower = merged.reduce((s,r)=>s+Number(r['Radiator power 75/65/20']??0),0)
  const weightedDt = calculateWeightedDeltaT(calcRows as any, merged as any)
  const highestSupply = (() => {
    try {
      let maxRet = -1e9
      let best:any = null
      for (const r of merged){
        const ret = Number(r['Return Temperature']??-1e9)
        if (ret > maxRet){ maxRet = ret; best = r }
      }
      if (!best) return 'N/A'
      return `${Number(best['Supply Temperature']).toFixed(1)} °C – Radiator ${best['Radiator nr']}`
    } catch { return 'N/A' }
  })()

  const metrics = { totalHeatLoss_W: totalHeatLoss, totalPower_W: totalPower, totalFlow_kg_h: totalFlow, weightedDeltaT_C: weightedDt, highestSupply }
  const charts = buildCharts(merged, mode, cfg, pumpInfo)
  return { warnings, merged, collectors: cols, metrics, charts }
}

function buildCharts(merged:any[], mode:string, cfg:Config, pumpInfo:any){
  const radIds = merged.map(r=>r['Radiator nr'])
  const power = { data: [
      { type:'bar', name:'Radiator Power', x: radIds, y: merged.map(r=>r['Radiator power 75/65/20'] ?? 0) },
      { type:'bar', name:'Required Power', x: radIds, y: merged.map(r=>r['Calculated heat loss'] ?? 0) },
      { type:'bar', name:'Extra radiator power', x: radIds, y: merged.map(r=>r['Extra radiator power'] ?? 0) },
    ], layout: { barmode:'group', title:'Radiator Power vs Required Heat Loss' } }

  const temp = { data: [
      { type:'scatter', mode:'lines+markers', name:'Supply', x: radIds, y: merged.map(r=>r['Supply Temperature']) },
      { type:'scatter', mode:'lines+markers', name:'Return', x: radIds, y: merged.map(r=>r['Return Temperature']) },
      { type:'scatter', mode:'lines+markers', name:'Space', x: radIds, y: merged.map(r=>r['Space Temperature']) },
    ], layout: { title:'Temperature Profile' } }

  const pressure = { data: [{ type:'bar', x: radIds, y: merged.map(r=> (Number(r['Total Pressure Loss']??0))/1000), name:'Total Pressure Loss (kPa)' }],
    layout: { title:'Total Pressure Loss per Radiator', yaxis:{title:'kPa'} } }

  const mass = { data: [{ type:'bar', x: radIds, y: merged.map(r=> Number(r['Mass flow rate']??0)), name:'Mass flow rate (kg/h)' }],
    layout: { title:'Mass Flow Rate per Radiator', yaxis:{title:'kg/h'} } }

  const valve = { data: [{ type:'bar', x: radIds, y: merged.map(r=> Number(r['Valve position'] ?? 0)), name:'Valve position' }],
    layout: { title:'Valve Position Analysis' } }

  const pump = (() => {
    if (mode !== MODE_PUMP) return { data: [], layout: { title: 'Pump vs System Curve (pump mode only)' } }
    const points = (PUMP_LIBRARY[cfg.pump_model]||{})[cfg.pump_speed] || []
    if (!points.length) return { data: [], layout: { title: 'Pump vs System Curve' } }
    const qMin = Math.min(...points.map(p=>p[0]))
    const qMax = Math.max(...points.map(p=>p[0]))
    const Qgrid = Array.from({length:150}, (_,i)=> qMin + (qMax-qMin)*i/149)
    const pumpKpa = interpolateCurve(points as any, Qgrid)
    const sys = Qgrid.map(q => (pumpInfo.K ?? 0) * q*q)
    const data:any[] = [
      { type:'scatter', mode:'lines', name:`${cfg.pump_model} (${cfg.pump_speed})`, x: Qgrid, y: pumpKpa },
      { type:'scatter', mode:'lines', name:'System curve (K·Q²)', x: Qgrid, y: sys, line:{dash:'dash'} },
    ]
    if (pumpInfo.qStar && pumpInfo.dpStar){
      data.push({ type:'scatter', mode:'markers+text', name:'Operating point', x:[pumpInfo.qStar], y:[pumpInfo.dpStar], text:[`Q=${pumpInfo.qStar.toFixed(0)} kg/h`], textposition:'top center' })
    }
    return { data, layout: { title: `Pump vs System — ${cfg.pump_model} (${cfg.pump_speed})`, yaxis:{title:'kPa'}, xaxis:{title:'kg/h'} } }
  })()

  return { power, temp, pressure, mass, valve, pump }
}

function emptyMetrics(){ return { totalHeatLoss_W:0, totalPower_W:0, totalFlow_kg_h:0, weightedDeltaT_C:0, highestSupply:'N/A' } }
function emptyCharts(){ const e = { data:[], layout:{title:''} }; return { power:e, temp:e, pressure:e, mass:e, valve:e, pump:e } }
