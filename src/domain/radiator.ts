export const T_FACTOR = 49.83
export const EXPONENT_RADIATOR = 1.34
export const POSSIBLE_DIAMETERS = [8,10,12,13,14,16,20,22,25,28,36,50]

export class Radiator {
  q_ratio: number
  delta_t: number
  space_temperature: number
  heat_loss: number
  supply_temperature: number
  return_temperature: number
  mass_flow_rate: number

  constructor(opts: {q_ratio: number, delta_t: number, space_temperature: number, heat_loss: number, supply_temperature?: number | null}){
    this.q_ratio = opts.q_ratio
    this.delta_t = opts.delta_t
    this.space_temperature = opts.space_temperature
    this.heat_loss = opts.heat_loss
    this.supply_temperature = opts.supply_temperature ?? this.calcSupplyTemperature()
    this.return_temperature = this.calcReturnTemperature(this.supply_temperature)
    this.mass_flow_rate = this.calcMassFlowRate()
  }

  calculateDiameter(possible = POSSIBLE_DIAMETERS, fixedDiameter?: number | null): number {
    if (fixedDiameter !== undefined && fixedDiameter !== null) return fixedDiameter
    if (!Number.isFinite(this.mass_flow_rate)) throw new Error('Mass flow rate is NaN – check collector configuration.')
    if (this.mass_flow_rate < 0) throw new Error(`Negative mass flow rate (${this.mass_flow_rate.toFixed(1)} kg/h). Increase radiator power, ΔT, or supply temperature.`)
    return selectPipeDiameter(this.mass_flow_rate, possible)
  }

  calculateTreturn(ts: number){ return this.calcReturnTemperature(ts) }
  calculateMassFlowRate(){ return this.calcMassFlowRate() }

  private calcC(): number {
    if (this.q_ratio <= 0) return Infinity
    return Math.exp(this.delta_t / T_FACTOR / (this.q_ratio ** (1.0/EXPONENT_RADIATOR)))
  }

  private calcSupplyTemperature(): number {
    const c = this.calcC()
    if (c <= 1) return round1(this.space_temperature + Math.max(this.delta_t, 3.0))
    return round1(this.space_temperature + (c/(c-1))*this.delta_t)
  }

  private calcReturnTemperature(supply: number): number {
    const lift = supply - this.space_temperature
    if (lift <= 0) return round1(supply)
    const tReturn = ((this.q_ratio ** (1.0/EXPONENT_RADIATOR) * T_FACTOR) ** 2) / lift + this.space_temperature
    return round1(tReturn)
  }

  private calcMassFlowRate(): number {
    const dT = Math.max(this.supply_temperature - this.return_temperature, 0.1)
    return round1(this.heat_loss / 4180.0 / dT * 3600.0)
  }
}

export function selectPipeDiameter(massFlowRate: number, diameters = POSSIBLE_DIAMETERS): number {
  const minD = 1.4641 * (massFlowRate ** 0.4217)
  const candidates = diameters.filter(d => d >= minD)
  if (!candidates.length) throw new Error(`Mass flow ${massFlowRate.toFixed(1)} kg/h exceeds all standard diameters. Consider increasing ΔT or splitting into parallel radiators.`)
  let best = candidates[0]
  let bestErr = Math.abs(best - minD)
  for (const d of candidates){
    const err = Math.abs(d - minD)
    if (err < bestErr){ best = d; bestErr = err }
  }
  return best
}

function round1(x:number){ return Math.round(x*10)/10 }

import { RadiatorRow } from './types'

export function withThermalDesign(
  radiators: RadiatorRow[],
  supplyTemp_C: number,
  deltaT_K: number
): RadiatorRow[] {
  return radiators.map(row => {
    const base = row.radiatorPower_75_65_20_W ?? 0
    const hl = row.calculatedHeatLoss_W ?? 0
    const qRatio = base > 0 ? Math.max(hl, 0) / base : 0
    const r = new Radiator({
      q_ratio: qRatio,
      delta_t: deltaT_K,
      space_temperature: row.spaceTemp_C ?? 20,
      heat_loss: hl,
      supply_temperature: supplyTemp_C,
    })
    return {
      ...row,
      supplyTemp_C: r.supply_temperature,
      returnTemp_C: r.return_temperature,
      massFlowRate_kg_h: r.mass_flow_rate,
    }
  })
}
