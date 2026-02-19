import { RadiatorRow, CollectorRow, ValveOverrides } from '../domain/types'
import { withThermalDesign, selectPipeDiameter } from '../domain/radiator'
import {
  Circuit,
  PRESSURE_LOSS_BOILER_Pa,
  checkPipeVelocities,
} from '../domain/hydraulics'
import {
  positionToKv,
  calcPressureForKv_Pa,
  calcPressureValveOpen_Pa,
} from '../domain/valve'

// Recompute pipeline aligned with Python services:
// - flows from heat loss
// - radiator circuit dp via Circuit.calculate_pressure_radiator_kv
// - collector circuit dp via Circuit.calculate_pressure_collector_kv
// - total pressure includes downstream collectors + boiler
// - valve dp computed from chosen kv (override or position-derived)

export function recomputeAll(
  radiators: RadiatorRow[],
  collectors: CollectorRow[],
  overrides: ValveOverrides,
  supplyTemp_C: number,
  deltaT_K: number
): { radiators: RadiatorRow[], collectors: CollectorRow[], warnings: string[] } {

  // 1) Thermal design -> mass flows
  let r: RadiatorRow[] = withThermalDesign(radiators, supplyTemp_C, deltaT_K)

  // 2) Diameter selection per radiator circuit (comfort velocity cap)
  r = r.map((x: RadiatorRow) => ({
    ...x,
    diameter_mm: x.diameter_mm || selectPipeDiameter(x.massFlowRate_kg_h ?? 0),
  }))

  // 3) Apply valve overrides -> kv + dp valve at setting + dp valve at full open (for sizing)
  r = r.map((x: RadiatorRow) => {
    const ov = overrides[x.radiatorNr]
    const valveName = ov?.valveName ?? x.valveName
    const position = ov?.position ?? x.valvePosition ?? 1
    const kvSetting = ov?.kv ?? positionToKv(valveName, position)
    const dpValveSetting = kvSetting ? calcPressureForKv_Pa(x.massFlowRate_kg_h ?? 0, kvSetting) : 0
    const dpValveOpen = calcPressureValveOpen_Pa(valveName, x.massFlowRate_kg_h ?? 0)
    return {
      ...x,
      valveName,
      valvePosition: position,
      valveKv: kvSetting,
      dpValve_Pa: dpValveSetting,
      valvePressureLossOpen_Pa: dpValveOpen,
    } as RadiatorRow
  })

  // 4) Radiator circuit pressure loss (pipe + radiator body)
  r = r.map((x: RadiatorRow) => {
    const c = new Circuit(
      x.lengthCircuit_m,
      x.diameter_mm ?? 16,
      x.massFlowRate_kg_h ?? 0
    )
    const dpCircuit = c.calculate_pressure_radiator_kv_Pa()
    const dpPiping = c.calculate_pressure_loss_piping_Pa()
    const dpRadiatorBody = dpCircuit - dpPiping
    return { ...x, dpPiping_Pa: dpPiping, dpRadiatorBody_Pa: dpRadiatorBody, dpCircuit_Pa: dpCircuit }
  })

  // 5) Update collectors from radiators flows & compute collector circuit dp
  const updatedCollectors: CollectorRow[] = collectors.map((col: CollectorRow) => {
    const m = r
      .filter((rad: RadiatorRow) => rad.collector === col.name)
      .reduce((s: number, rad: RadiatorRow) => s + (rad.massFlowRate_kg_h ?? 0), 0)
    const d = col.diameter_mm || selectPipeDiameter(m)
    const circuit = new Circuit(col.length_m, d, m)
    const dp = circuit.calculate_pressure_collector_kv_Pa()
    return { ...col, massFlowRate_kg_h: m, diameter_mm: d, dpCollectorCircuit_Pa: dp }
  })

  // 6) Total pressure loss per radiator incl. downstream collectors + boiler
  const collectorLossMap = new Map<string, number>()
  updatedCollectors
    .slice()
    .sort((a: CollectorRow, b: CollectorRow) => a.name.localeCompare(b.name))
    .forEach((c: CollectorRow) => collectorLossMap.set(c.name, c.dpCollectorCircuit_Pa ?? 0))
  const sortedCollectorNames = Array.from(collectorLossMap.keys())

  const withTotals: RadiatorRow[] = r.map((rad: RadiatorRow) => {
    const idx = sortedCollectorNames.indexOf(rad.collector)
    const downstream = idx >= 0
      ? sortedCollectorNames
          .slice(idx)
          .reduce((s: number, name: string) => s + (collectorLossMap.get(name) ?? 0), 0)
      : 0
    const totalPressureLoss = (rad.dpCircuit_Pa ?? 0) + downstream + PRESSURE_LOSS_BOILER_Pa
    const totalWithValve = totalPressureLoss + (rad.dpValve_Pa ?? 0)
    return { ...rad, totalPressureLoss_Pa: totalPressureLoss, dpTotal_Pa: totalWithValve }
  })

  // 7) Velocities and warnings
  const v = checkPipeVelocities(withTotals as any[], updatedCollectors as any[])

  return {
    radiators: v.radiators as unknown as RadiatorRow[],
    collectors: v.collectors as unknown as CollectorRow[],
    warnings: v.warnings,
  }
}