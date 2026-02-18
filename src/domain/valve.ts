// Port of domain/valve.py (Python) to TypeScript.
// Units:
// - kv: m^3/h
// - mass flow: kg/h
// - pressure: Pa

import { HYDRAULIC_CONSTANT_Pa } from './hydraulics'

export type ValveConfig = {
  positions: number
  kv_values: number[]
  description: string
}

export const VALVE_CATALOGUE: Record<string, ValveConfig> = {
  'Danfoss RA-N 10 (3/8)': { positions: 8, kv_values: [0.04, 0.08, 0.12, 0.19, 0.25, 0.33, 0.38, 0.56], description: 'Danfoss RA-N 10 (3/8) – 8-position TRV' },
  'Danfoss RA-N 15 (1/2)': { positions: 8, kv_values: [0.04, 0.08, 0.12, 0.20, 0.30, 0.40, 0.51, 0.73], description: 'Danfoss RA-N 15 (1/2) – 8-position TRV' },
  'Danfoss RA-N 20 (3/4)': { positions: 8, kv_values: [0.10, 0.15, 0.17, 0.26, 0.35, 0.46, 0.73, 1.04], description: 'Danfoss RA-N 20 (3/4) – 8-position TRV' },
  'Oventrop DN15 (1/2)': { positions: 9, kv_values: [0.05, 0.09, 0.14, 0.20, 0.26, 0.32, 0.43, 0.57, 0.67], description: 'Oventrop DN15 (1/2) – 9-position TRV' },
  'Heimeier (1/2)': { positions: 8, kv_values: [0.049, 0.09, 0.15, 0.265, 0.33, 0.47, 0.59, 0.67], description: 'Heimeier (1/2) – 8-position TRV' },
  'Vogel und Noot': { positions: 5, kv_values: [0.13, 0.30, 0.43, 0.58, 0.75], description: 'Vogel und Noot – 5-position TRV' },
  'Comap': { positions: 6, kv_values: [0.028, 0.08, 0.125, 0.24, 0.335, 0.49], description: 'Comap – 6-position TRV' }
}

export function getValveNames(): string[] {
  return ['Custom', ...Object.keys(VALVE_CATALOGUE)]
}

export function getValveConfig(name: string | undefined | null): ValveConfig | null {
  if (!name || name === 'Custom') return null
  return VALVE_CATALOGUE[name] ?? null
}

export function getKvAtPosition(valveName: string, position: number, kvMaxCustom = 0.7, nCustom = 100): number {
  const cfg = getValveConfig(valveName)
  if (cfg) {
    const idx = Math.min(position, cfg.kv_values.length - 1)
    return cfg.kv_values[idx]
  }
  // custom linear
  if (nCustom <= 1) return 0
  return (position / (nCustom - 1)) * kvMaxCustom
}

export function calcPressureValveOpen_Pa(valveName: string, massFlow_kg_h: number, kvMaxCustom = 0.7): number {
  const cfg = getValveConfig(valveName)
  const kv = cfg ? cfg.kv_values[cfg.kv_values.length - 1] : kvMaxCustom
  if (kv <= 0) return Infinity
  return round1(HYDRAULIC_CONSTANT_Pa * ((massFlow_kg_h / 1000.0) / kv) ** 2)
}

export function calcPressureForKv_Pa(massFlow_kg_h: number, kv: number): number {
  if (kv <= 0) return Infinity
  return round1(HYDRAULIC_CONSTANT_Pa * ((massFlow_kg_h / 1000.0) / kv) ** 2)
}

export function positionToKv(valveName: string, position?: number, overrideKv?: number): number {
  if (overrideKv !== undefined && overrideKv !== null) return overrideKv
  if (position === undefined || position === null) return 0
  const cfg = getValveConfig(valveName)
  if (cfg) return cfg.kv_values[Math.min(position, cfg.kv_values.length - 1)] ?? 0
  return 0
}

// --- Balancing sizing (ported from calculate_kv_position_valve) ---
// Works on plain arrays of objects rather than pandas DataFrames.

export function computeKvNeeded(rows: any[]): { maxPressureValveCircuit: number, rows: any[] } {
  // Requires each row to have: Total Pressure Loss (Pa) and Valve pressure loss N (Pa) and Mass flow rate (kg/h)
  const totalValveCircuit = rows.map(r => (r.totalPressureLoss_Pa ?? r['Total Pressure Loss'] ?? 0) + (r.valvePressureLossOpen_Pa ?? r['Valve pressure loss N'] ?? 0))
  const maxP = Math.max(...totalValveCircuit)
  const out = rows.map((r, i) => {
    const totalLoss = (r.totalPressureLoss_Pa ?? r['Total Pressure Loss'] ?? 0)
    const dpValve = maxP - totalLoss
    const dpBar = Math.max(dpValve / 100000.0, 1e-9) // Pa -> bar
    const m = (r.massFlowRate_kg_h ?? r['Mass flow rate'] ?? 0)
    const kvNeeded = (m / 1000.0) / Math.sqrt(dpBar)
    return { ...r, totalPressureValveCircuit_Pa: totalValveCircuit[i], pressureDifferenceValve_Pa: dpValve, kv_needed: kvNeeded }
  })
  return { maxPressureValveCircuit: maxP, rows: out }
}

export function findValvePosition(kvNeeded: number, kvValues: number[]): number {
  for (let i = 0; i < kvValues.length; i++) {
    if (kvValues[i] >= kvNeeded) return i
  }
  return kvValues.length - 1
}

export function solveValvePolynomial(a: number, b: number, c: number, kvNeeded: number): number {
  const disc = Math.max(b*b - 4*a*(c - kvNeeded), 0)
  if (disc <= 0) return 0.1
  return (-b + Math.sqrt(disc)) / (2*a)
}

export function adjustPositionCustom(kvNeeded: number, kvMax: number, n: number): number {
  const ratioKv = clamp(kvNeeded / kvMax, 0, 1)
  const ratioPos = clamp(Math.sqrt(ratioKv), 0, 1)
  return Math.ceil(ratioPos * n)
}

export function addValvePositionAndKv(rows: any[], valveName: string, customKvMax?: number, nCustom?: number): any[] {
  const { rows: withKv } = computeKvNeeded(rows)
  const cfg = getValveConfig(valveName)

  if (cfg) {
    const kvValues = cfg.kv_values
    return withKv.map(r => {
      const pos = findValvePosition(r.kv_needed, kvValues)
      return { ...r, valvePosition: pos, valveKv: kvValues[pos] }
    })
  }

  // Custom valve
  if (customKvMax !== undefined && nCustom !== undefined) {
    return withKv.map(r => ({ ...r, valvePosition: adjustPositionCustom(r.kv_needed, customKvMax, nCustom) }))
  }

  // Polynomial fallback
  const a = 0.0114, b = -0.0086, c = 0.0446
  return withKv.map(r => ({ ...r, valvePosition: Math.ceil(solveValvePolynomial(a, b, c, r.kv_needed)) }))
}

function clamp(x: number, a: number, b: number){ return Math.max(a, Math.min(b, x)) }
function round1(x: number){ return Math.round(x*10)/10 }
