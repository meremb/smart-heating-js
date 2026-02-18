export const BRIDGE_CORRECTION = 0.05
export const GROUND_TEMP_DEFAULT = 10.0
export const GROUND_CORRECTION_FACTOR = 1.15 * 1.45
export const INFILTRATION_FACTOR = 0.34
export const WALL_OFFSET = 0.3

export const VENTILATION_ACH: Record<string, number> = { C: 0.5, D: 0.5*0.3 }

type Areas = {
  walls: number
  neighbours: number
  ground: number
  roof: number
  attic: number
  neighbourfloor: number
  neighbourceiling: number
}

type Flows = { outdoor: number, neighbour: number }

export type HeatLoadDetail = {
  totalHeatLoss: number
  transmissionHeatLoss: number
  ventilationHeatLoss: number
  infiltrationHeatLoss: number
  neighbourLosses: number
  atticLosses: number
}

export type RoomLoadParams = {
  floor_area: number
  uw: number
  u_roof: number
  u_ground: number
  v_system: string
  wall_outside?: number
  v50?: number
  tin?: number
  tout?: number
  tattic?: number
  neighbour_t?: number
  un?: number
  u_glass?: number
  lir?: number
  wall_height?: number
  window?: boolean
  on_ground?: boolean
  under_roof?: boolean
  under_insulated_attic?: boolean
  add_neighbour_losses?: boolean
  neighbour_perimeter?: number
  heat_loss_area_estimation?: 'fromFloorArea' | 'fromExposedPerimeter'
  exposed_perimeter?: number
  ventilation_calculation_method?: 'simple' | 'NBN-D-50-001'
  room_type?: string | null
  return_detail?: boolean
}

export class RoomLoadCalculator {
  p: Required<RoomLoadParams>
  constructor(params: RoomLoadParams){
    this.p = {
      floor_area: params.floor_area,
      uw: params.uw,
      u_roof: params.u_roof,
      u_ground: params.u_ground,
      v_system: params.v_system,
      wall_outside: params.wall_outside ?? 2.0,
      v50: params.v50 ?? 6.0,
      tin: params.tin ?? 20.0,
      tout: params.tout ?? -7.0,
      tattic: params.tattic ?? 10.0,
      neighbour_t: params.neighbour_t ?? 18.0,
      un: params.un ?? 2.0,
      u_glass: params.u_glass ?? 1.0,
      lir: params.lir ?? 0.1,
      wall_height: params.wall_height ?? 3.0,
      window: params.window ?? false,
      on_ground: params.on_ground ?? false,
      under_roof: params.under_roof ?? false,
      under_insulated_attic: params.under_insulated_attic ?? false,
      add_neighbour_losses: params.add_neighbour_losses ?? false,
      neighbour_perimeter: params.neighbour_perimeter ?? 0.0,
      heat_loss_area_estimation: params.heat_loss_area_estimation ?? 'fromFloorArea',
      exposed_perimeter: params.exposed_perimeter ?? 0.0,
      ventilation_calculation_method: params.ventilation_calculation_method ?? 'simple',
      room_type: params.room_type ?? null,
      return_detail: params.return_detail ?? false,
    } as any
  }

  compute(): number | HeatLoadDetail {
    const deltaT = this.p.tin - this.p.tout
    const areas = this.computeAreas()
    const transmission = this.computeTransmission(areas, deltaT)
    const ventilation = this.computeVentilation(deltaT)
    const infiltration = this.computeInfiltration(areas, deltaT)
    const neighbour = this.computeNeighbour(areas)
    const attic = this.computeAttic(areas)
    const airLoss = Math.max(ventilation, infiltration)
    const total = transmission + airLoss + neighbour + attic
    if (this.p.return_detail){
      return {
        totalHeatLoss: total,
        transmissionHeatLoss: transmission,
        ventilationHeatLoss: ventilation,
        infiltrationHeatLoss: infiltration,
        neighbourLosses: neighbour,
        atticLosses: attic,
      }
    }
    return Math.round(total)
  }

  private computeTransmission(a: Areas, deltaT: number): number {
    const walls = a.walls * (this.p.uw + BRIDGE_CORRECTION)
    const roof = a.roof * (this.p.u_roof + BRIDGE_CORRECTION)
    const ground = a.ground * GROUND_CORRECTION_FACTOR * (this.p.u_ground + BRIDGE_CORRECTION) * (this.p.tin - GROUND_TEMP_DEFAULT)
    let loss = (walls + roof) * deltaT + ground
    if (this.p.window){
      const windowFraction = a.walls * 0.2
      loss += windowFraction * ((this.p.u_glass ?? this.p.uw) - this.p.uw) * deltaT
    }
    return loss
  }

  private computeVentilation(deltaT: number): number {
    const flows = this.getVentFlows()
    const deltaNeighbour = Math.max(0, this.p.tin - this.p.neighbour_t)
    return INFILTRATION_FACTOR * (flows.outdoor * deltaT + flows.neighbour * deltaNeighbour)
  }

  private computeInfiltration(a: Areas, deltaT: number): number {
    const envelope = a.walls + a.roof + a.ground
    return INFILTRATION_FACTOR * this.p.lir * this.p.v50 * envelope * deltaT
  }

  private computeNeighbour(a: Areas): number {
    if (!this.p.add_neighbour_losses) return 0
    const totalArea = a.neighbours + a.neighbourfloor + a.neighbourceiling
    return this.p.un * Math.max(0, this.p.tin - this.p.neighbour_t) * totalArea
  }

  private computeAttic(a: Areas): number {
    return a.attic * this.p.un * (this.p.tin - this.p.tattic)
  }

  private computeAreas(): Areas {
    const e = WALL_OFFSET
    const gross = this.p.floor_area + 4*e*Math.sqrt(this.p.floor_area) + 4*e**2
    let wallExternal = 0
    let wallNeighbour = 0
    if (this.p.heat_loss_area_estimation === 'fromFloorArea'){
      const side = Math.sqrt(gross)
      wallExternal = side * this.p.wall_height * this.p.wall_outside
      wallNeighbour = side * this.p.wall_height * (4.0 - this.p.wall_outside)
    } else if (this.p.heat_loss_area_estimation === 'fromExposedPerimeter'){
      wallExternal = this.p.exposed_perimeter * this.p.wall_height
      wallNeighbour = this.p.neighbour_perimeter * this.p.wall_height
    }
    const groundArea = this.p.on_ground ? gross : 0
    const roofArea = this.p.under_roof ? gross : 0
    const atticArea = this.p.under_insulated_attic ? gross : 0
    const neighbourFloor = groundArea ? 0 : this.p.floor_area
    const neighbourCeiling = (roofArea || atticArea) ? 0 : this.p.floor_area
    return {
      walls: wallExternal,
      neighbours: wallNeighbour,
      ground: groundArea,
      roof: roofArea,
      attic: atticArea,
      neighbourfloor: neighbourFloor,
      neighbourceiling: neighbourCeiling,
    }
  }

  private getVentFlows(): Flows {
    if (this.p.ventilation_calculation_method === 'simple') return this.simpleVentFlows()
    if (this.p.ventilation_calculation_method === 'NBN-D-50-001') return this.detailedVentFlows()
    return { outdoor: 0, neighbour: 0 }
  }

  private simpleVentFlows(): Flows {
    const ach = VENTILATION_ACH[this.p.v_system] ?? 0
    const volume = this.p.floor_area * this.p.wall_height
    return { outdoor: volume * ach, neighbour: 0 }
  }

  private detailedVentFlows(): Flows {
    const bounds: Record<string, {min:number, max:number}> = {
      Living: {min:75, max:150},
      Kitchen: {min:50, max:75},
      Bedroom: {min:25, max:72},
      Study: {min:25, max:72},
      Laundry: {min:50, max:75},
      Bathroom: {min:50, max:150},
      Toilet: {min:25, max:25},
      Hallway: {min:0, max:75},
      '': {min:0, max:150}
    }
    const rt = this.p.room_type ?? ''
    const b = bounds[rt] ?? bounds['']
    const nom = clamp(3.6 * this.p.floor_area, b.min, b.max)
    const supplyRooms = new Set(['Living','Bedroom','Bureau',''])
    if (supplyRooms.has(rt)){
      const outdoor = nom * (this.p.v_system === 'D' ? 0.3 : 1.0)
      return { outdoor, neighbour: 0 }
    }
    return { outdoor: 0, neighbour: nom }
  }
}

function clamp(x:number, a:number, b:number){ return Math.max(a, Math.min(b, x)) }
