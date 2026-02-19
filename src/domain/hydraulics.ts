// Port of domain/hydraulics.py (core constants + Circuit + velocity check)

export const PRESSURE_LOSS_BOILER_Pa = 350.0
export const HYDRAULIC_CONSTANT_Pa = 97180.0
export const LOCAL_LOSS_COEFFICIENT = 1.3
export const KV_RADIATOR_m3_h = 2.0
export const KV_COLLECTOR_m3_h = 14.66

export const KV_PIPE_A = 51626.0
export const KV_PIPE_B = -417.39
export const KV_PIPE_C = 1.5541

export const WATER_DENSITY = 1000.0

export function kvPipe(diameter_mm: number): number {
  const d_m = diameter_mm / 1000.0
  return KV_PIPE_A * d_m ** 2 + KV_PIPE_B * d_m + KV_PIPE_C
}

export class Circuit {
  length_circuit_m: number
  diameter_mm: number
  mass_flow_kg_h: number
  constructor(length_circuit_m: number, diameter_mm: number, mass_flow_kg_h: number){
    this.length_circuit_m = length_circuit_m
    this.diameter_mm = diameter_mm
    this.mass_flow_kg_h = mass_flow_kg_h
  }

  calculate_pressure_loss_piping_Pa(): number {
    const kv = kvPipe(this.diameter_mm)
    if (kv <= 0) return Infinity
    const r_per_m = HYDRAULIC_CONSTANT_Pa * ((this.mass_flow_kg_h/1000.0)/kv) ** 2
    return round1(r_per_m * this.length_circuit_m * 2 * LOCAL_LOSS_COEFFICIENT)
  }

  calculate_pressure_radiator_kv_Pa(): number {
    const piping = this.calculate_pressure_loss_piping_Pa()
    const radiator = HYDRAULIC_CONSTANT_Pa * ((this.mass_flow_kg_h/1000.0)/KV_RADIATOR_m3_h) ** 2
    return round1(piping + radiator)
  }

  calculate_pressure_collector_kv_Pa(): number {
    const piping = this.calculate_pressure_loss_piping_Pa()
    const collector = HYDRAULIC_CONSTANT_Pa * ((this.mass_flow_kg_h/1000.0)/KV_COLLECTOR_m3_h) ** 2
    return round1(piping + collector)
  }
}

export function calcVelocity_m_s(mass_flow_kg_h: number, diameter_mm: number): number {
  const m_dot = mass_flow_kg_h / 3600.0
  const d_m = diameter_mm / 1000.0
  const area = Math.PI * (d_m/2.0) ** 2
  if (area === 0) return 0
  return m_dot / (WATER_DENSITY * area)
}

export function checkPipeVelocities(radRows: any[], colRows: any[], maxVelocity = 0.5){
  const warnings: string[] = []
  const radiators = radRows.map(r => {
    const v = calcVelocity_m_s(Number(r.massFlowRate_kg_h ?? r['Mass flow rate'] ?? 0), Number(r.diameter_mm ?? r['Diameter'] ?? 0))
    if (v > maxVelocity) warnings.push(`High velocity radiator ${r.radiatorNr ?? r['Radiator nr'] ?? '?'}: ${v.toFixed(2)} m/s > ${maxVelocity.toFixed(2)} m/s`)
    return { ...r, velocity_m_s: Math.round(v*1000)/1000 }
  })
  const collectors = colRows.map(c => {
    const v = calcVelocity_m_s(Number(c.massFlowRate_kg_h ?? c['Mass flow rate'] ?? 0), Number(c.diameter_mm ?? c['Diameter'] ?? 0))
    if (v > maxVelocity) warnings.push(`High velocity collector ${c.name ?? c['Collector'] ?? '?'}: ${v.toFixed(2)} m/s > ${maxVelocity.toFixed(2)} m/s`)
    return { ...c, velocity_m_s: Math.round(v*1000)/1000 }
  })
  return { radiators, collectors, warnings }
}

// src/domain/hydraulics.ts
export function selectPipeDiameter(massFlowRate_kg_h: number): number {
  // zelfde fit als in python: min_d = 1.4641 * m^0.4217
  const m = Math.max(0, massFlowRate_kg_h)
  const minD = 1.4641 * Math.pow(m, 0.4217)

  const standard = [8,10,12,13,14,16,20,22,25,28,36,50]
  for (const d of standard) if (d >= minD) return d
  return standard[standard.length - 1]
}

function round1(x:number){ return Math.round(x*10)/10 }
