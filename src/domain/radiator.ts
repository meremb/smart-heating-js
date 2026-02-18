import { RadiatorRow } from './types'

const CP_WATER = 4180 // J/kgK

// Design calculation consistent with your Python tests: Q ≈ m_dot * cp * ΔT
// where m_dot is in kg/s. Your code uses kg/h, so convert.
export function calcMassFlowRate_kg_h(heatLoss_W: number, deltaT_K: number): number {
  if (!heatLoss_W || !deltaT_K || deltaT_K <= 0) return 0
  const m_dot_kg_s = heatLoss_W / (CP_WATER * deltaT_K)
  return m_dot_kg_s * 3600
}

export function calcReturnTemp_C(supplyTemp_C: number, deltaT_K: number): number {
  return supplyTemp_C - deltaT_K
}

export function withThermalDesign(rows: RadiatorRow[], supplyTemp_C: number, deltaT_K: number): RadiatorRow[] {
  return rows.map(r => {
    const m = calcMassFlowRate_kg_h(r.calculatedHeatLoss_W, deltaT_K)
    return {
      ...r,
      deltaT_K,
      supplyTemp_C,
      returnTemp_C: calcReturnTemp_C(supplyTemp_C, deltaT_K),
      massFlowRate_kg_h: m
    }
  })
}
