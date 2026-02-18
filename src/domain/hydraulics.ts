// Port of domain/hydraulics.py (Python) to TypeScript for static-site execution.
// Units:
// - mass flow: kg/h
// - kv: m^3/h
// - pressure losses: Pa

export const PRESSURE_LOSS_BOILER_Pa = 350.0
export const HYDRAULIC_CONSTANT_Pa = 97180.0
export const LOCAL_LOSS_COEFFICIENT = 1.3
export const KV_RADIATOR_m3_h = 2.0
export const KV_COLLECTOR_m3_h = 14.66

// Pipe kv polynomial: kv = A*d^2 + B*d + C (d in metres)
export const KV_PIPE_A = 51626.0
export const KV_PIPE_B = -417.39
export const KV_PIPE_C = 1.5541

export const WATER_DENSITY = 1000.0 // kg/m^3
export const MAX_VELOCITY_DEFAULT = 0.5 // m/s

export const POSSIBLE_DIAMETERS_MM = [8, 10, 12, 14, 16, 18, 20, 22, 26, 32]

export function kvPipe(diameter_mm: number): number {
  const d_m = diameter_mm / 1000.0
  return KV_PIPE_A * d_m ** 2 + KV_PIPE_B * d_m + KV_PIPE_C
}

export class Circuit {
  length_circuit_m: number
  diameter_mm: number
  mass_flow_kg_h: number

  constructor(length_circuit_m: number, diameter_mm: number, mass_flow_kg_h: number) {
    this.length_circuit_m = length_circuit_m
    this.diameter_mm = diameter_mm
    this.mass_flow_kg_h = mass_flow_kg_h
  }

  calculate_pressure_loss_piping_Pa(): number {
    const kv = kvPipe(this.diameter_mm)
    if (kv <= 0) return Infinity
    const r_per_m = HYDRAULIC_CONSTANT_Pa * ((this.mass_flow_kg_h / 1000.0) / kv) ** 2
    // *2 for supply+return and local coefficient
    return round1(r_per_m * this.length_circuit_m * 2 * LOCAL_LOSS_COEFFICIENT)
  }

  calculate_pressure_radiator_kv_Pa(): number {
    const piping = this.calculate_pressure_loss_piping_Pa()
    const radiator_loss = HYDRAULIC_CONSTANT_Pa * ((this.mass_flow_kg_h / 1000.0) / KV_RADIATOR_m3_h) ** 2
    return round1(piping + radiator_loss)
  }

  calculate_pressure_collector_kv_Pa(): number {
    const piping = this.calculate_pressure_loss_piping_Pa()
    const collector_loss = HYDRAULIC_CONSTANT_Pa * ((this.mass_flow_kg_h / 1000.0) / KV_COLLECTOR_m3_h) ** 2
    return round1(piping + collector_loss)
  }

  calculate_water_volume_L(): number {
    const r_m = (this.diameter_mm / 2.0) / 1000.0
    return round2(Math.PI * r_m ** 2 * this.length_circuit_m * 1000.0)
  }
}

export class Collector {
  name: string
  pressure_loss_Pa: number
  mass_flow_kg_h: number

  constructor(name: string) {
    this.name = name
    this.pressure_loss_Pa = 0
    this.mass_flow_kg_h = 0
  }

  update_mass_flow_rate(radiators: { collector: string, massFlowRate_kg_h: number }[]): void {
    this.mass_flow_kg_h = radiators
      .filter(r => r.collector === this.name)
      .reduce((s, r) => s + (r.massFlowRate_kg_h || 0), 0)
  }
}

export function calcVelocity_m_s(mass_flow_kg_h: number, diameter_mm: number): number {
  const m_dot = mass_flow_kg_h / 3600.0 // kg/s
  const d_m = diameter_mm / 1000.0
  const area = Math.PI * (d_m / 2.0) ** 2
  if (area === 0) return 0
  return m_dot / (WATER_DENSITY * area)
}

export function checkPipeVelocities(
  radRows: any[],
  colRows: any[],
  maxVelocity = MAX_VELOCITY_DEFAULT,
): { radiators: any[], collectors: any[], warnings: string[] } {
  const warnings: string[] = []
  const radiators = radRows.map(r => {
    const v = calcVelocity_m_s(r.massFlowRate_kg_h || 0, r.diameter_mm || 0)
    if (v > maxVelocity) {
      const rid = r.radiatorNr ?? r['Radiator nr'] ?? '?'
      warnings.push(`High velocity radiator ${rid}: ${v.toFixed(2)} m/s > ${maxVelocity.toFixed(2)} m/s`)
    }
    return { ...r, velocity_m_s: round3(v) }
  })

  const collectors = colRows.map(c => {
    const v = calcVelocity_m_s(c.massFlowRate_kg_h || 0, c.diameter_mm || 0)
    if (v > maxVelocity) {
      warnings.push(`High velocity collector ${c.name ?? c['Collector'] ?? '?'}: ${v.toFixed(2)} m/s > ${maxVelocity.toFixed(2)} m/s`)
    }
    return { ...c, velocity_m_s: round3(v) }
  })

  return { radiators, collectors, warnings }
}

export function selectPipeDiameter(mass_flow_kg_h: number, possible = POSSIBLE_DIAMETERS_MM, maxVelocity = MAX_VELOCITY_DEFAULT): number {
  // Equivalent intent to domain.radiator._select_pipe_diameter (not provided).
  // Chooses smallest diameter that meets velocity comfort limit.
  for (const d of possible) {
    const v = calcVelocity_m_s(mass_flow_kg_h, d)
    if (v <= maxVelocity) return d
  }
  return possible[possible.length - 1]
}

export function round1(x: number): number { return Math.round(x * 100) / 10 }
export function round2(x: number): number { return Math.round(x * 100) / 100 }
export function round3(x: number): number { return Math.round(x * 1000) / 1000 }
