export type Room = {
  id: number
  roomType: string
  floorArea_m2: number
  spaceTemp_C: number
  heatLoss_W: number
}

export type RadiatorRow = {
  radiatorNr: number
  roomId: number
  collector: string
  radiatorPower_75_65_20_W: number
  calculatedHeatLoss_W: number
  lengthCircuit_m: number
  spaceTemp_C: number
  deltaT_K: number
  supplyTemp_C: number
  returnTemp_C: number
  massFlowRate_kg_h: number
  diameter_mm: number

  // valve
  valveName: string
  valvePosition?: number
  valveKv?: number

  // hydraulics (Pa)
  dpValve_Pa?: number
  dpPiping_Pa?: number
  dpRadiatorBody_Pa?: number
  dpCollectorBody_Pa?: number
  dpCircuit_Pa?: number           // radiator circuit pressure loss (pipe + radiator body)
  dpTotal_Pa?: number             // includes downstream collectors + boiler + valve setting if chosen
  velocity_m_s?: number
}

export type CollectorRow = {
  name: string
  length_m: number
  massFlowRate_kg_h: number
  diameter_mm: number
  dpCollectorCircuit_Pa?: number
  velocity_m_s?: number
}

export type ValveOverride = {
  position?: number
  kv?: number
  valveName?: string
}

export type ValveOverrides = Record<number, ValveOverride> // key: radiatorNr
